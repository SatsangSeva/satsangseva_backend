import Admin from "../models/Admin.js";
import User from "../models/User.js";
import Blogs from "../models/Blogs.js";
import mongoose from "mongoose";
import upload from "../utils/multer.js";
import cloudinary, { getPublicIdFromUrl } from "../utils/cloudinary.js";
import { validateEventInputs } from "../utils/eventValidators.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import twilio from "twilio";
import dotenv from "dotenv";
import crypto from "crypto";

import Events from "../models/Events.js";
import Bookings from "../models/Bookings.js";
dotenv.config();

const emailTemplate = `
<style>
  body {
    font-family: Arial, sans-serif;
  }
  .container {
    max-width: 600px;
    margin: 40px auto;
    padding: 20px;
    background-color: #f9f9f9;
    border: 1px solid #ddd;
    border-radius: 10px;
    box-shadow: 0 0 10px rgba(0, 0, 0, 0.1);
  }
  .header {
    background-color: #007bff;
    color: #fff;
    padding: 10px;
    border-bottom: 1px solid #ddd;
  }
  .header h2 {
    margin: 0;
  }
  .body {
    padding: 20px;
  }
  .body p {
    margin-bottom: 20px;
  }
  .footer {
    background-color: #007bff;
    color: #fff;
    padding: 10px;
    border-top: 1px solid #ddd;
  }
</style>

<div class="container">
  <div class="header">
    <h2>Contact Us Form Submission: SatsangSeva</h2>
  </div>
  <div class="body">
    <p><strong>Name:</strong> {{name}}</p>
    <p><strong>Email:</strong> {{email}}</p>
    <p><strong>Phone Number:</strong> +91-{{phoneNumber}}</p>
    <p><strong>Message:</strong></p>
    <p>{{message}}</p>
  </div>
  <div class="footer">
    <p>Best regards,</p>
    <p>Team SatsangSeva</p>
  </div>
</div>
`;

const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
const otpStore = new Map();
const sendSms = async ({ mobile, otp }) => {
  const baseURL = `http://control.bestsms.co.in/api/sendhttp.php?authkey=441556ACnRoemxXLZ67b0d8f0P1&mobiles=${mobile}&sender=NSKFST&route=4&country=91&DLT_TE_ID=1207162399931698582&message=Dear User,
Your OTP for accessing satsangseva.com is ${otp}. Please use this code to complete your authentication.
This OTP is valid for 10 minutes.
For your security, do not share this OTP with anyone
Thank you
Call support for help
-Nashik First`;
  const response = await fetch(baseURL);

  return response;
};
const generateOtp = () => {
  const otp = crypto.randomInt(1000, 9999);
  const expirationTime = Date.now() + 60000 * 10;
  return { otp, expirationTime };
};
export const sendWhatsAppOtp = async (req, res, next) => {
  const phone = req.params.id;

  // Validate phone number length
  if (phone.length !== 10) {
    return res.status(422).json({ message: "Invalid phone number" });
  }

  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const serviceSid = process.env.TWILIO_AUTH_SERVICES;
  const client = twilio(accountSid, authToken);

  try {
    const verification = await client.verify.v2
      .services(serviceSid)
      .verifications.create({
        to: `+91${phone}`,
        channel: "sms",
        channelConfiguration: {
          whatsapp: { enabled: true },
        },
      });

    return res.status(200).json({ message: "WhatsApp OTP sent successfully" });
  } catch (e) {
    console.error("Error sending OTP:", e);
    return res
      .status(500)
      .json({ message: "Error in Sending OTP: " + e.message });
  }
};

export const verifyWhatsAppOtp = async (req, res, next) => {
  const otp = req.query.otp,
    phone = req.query.contact;
  if (phone.length !== 10 || otp.length !== 6) {
    return res.status(422).json({ message: "Invalid Contact/OTP Length." });
  }
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const serviceSid = process.env.TWILIO_AUTH_SERVICES;
  const client = twilio(accountSid, authToken);

  const verificationCheck = await client.verify.v2
    .services(process.env.TWILIO_AUTH_SERVICES)
    .verificationChecks.create({
      code: otp,
      to: "+91" + phone,
    })
    .then((resp) => {
      // console.log(otp + " " + phone);
      // console.log(resp.status);
      if (resp.status === "approved") {
        return res
          .status(200)
          .json({ message: "Contact Verified Successfully: " + resp.status });
      } else {
        return res
          .status(422)
          .json({ message: "Verification Failed: " + resp.status });
      }
    })
    .catch((e) => {
      // console.log(e);
      return res.status(404).json({ message: "Error in Verifing OTP: " + e });
    });
};

export const resetPassword = async (req, res, next) => {
  const email = req.params.id;
  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  if (!emailRegex.test(email)) {
    return res.status(422).json({ message: "Invalid Email" });
  }
  const user = await User.findOne({ email: email });
  if (!user) {
    return res
      .status(500)
      .json({ message: "User Not Exists for email: " + email });
  }
  const phone = user.phoneNumber;

  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const client = twilio(accountSid, authToken);

  const verification = await client.verify.v2
    .services(process.env.TWILIO_AUTH_SERVICES)
    .verifications.create({
      channel: "whatsapp",
      to: "+91" + phone,
      channelConfiguration: {
        whatsapp: {
          enabled: true,
        },
      },
    })
    .then((resp) => {
      // console.log(resp);
      // console.log(resp.accountSid);
      return res
        .status(200)
        .json({ message: "SMS/WhatsApp OTP Send Successfully", to: phone });
    })
    .catch((e) => {
      // console.log(e);
      return res.status(404).json({ message: "Error in Sending OTP: " + e });
    });
};

export const addAdmin = async (req, res, next) => {
  const { email, password, name, mobile } = req.body;
  if (!email && email.trim() === "" && !password && password.trim() === "") {
    return res.status(422).json({ message: "Invalid Inputs" });
  }

  let existingAdmin;
  try {
    existingAdmin = await Admin.findOne({ email });
  } catch (err) {
    return console.log(err);
  }

  if (existingAdmin) {
    return res.status(400).json({ message: "Admin already exists" });
  }

  let admin;
  const hashedPassword = bcrypt.hashSync(password);
  try {
    // admin = new Admin({ email, password: hashedPassword });
    admin = new Admin({
      email,
      name,
      mobile,
      password: hashedPassword,
    });
    admin = await admin.save();
  } catch (err) {
    return console.log(err);
  }
  if (!admin) {
    return res.status(500).json({ message: "Unable to store admin" });
  }
  return res.status(201).json({ admin });
};

export const adminLogin = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validate input
    if (!email || !password || email.trim() === "" || password.trim() === "") {
      return res.status(422).json({ message: "Email and password are required" });
    }

    // Check if admin exists
    const existingAdmin = await Admin.findOne({ email }).select("+password");
    if (!existingAdmin) {
      return res.status(404).json({ message: "Admin not found" });
    }

    // Verify password
    const isPasswordCorrect = bcrypt.compareSync(password, existingAdmin.password);
    if (!isPasswordCorrect) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    // Generate JWT token
    const token = jwt.sign(
      { id: existingAdmin._id },
      process.env.SECRET_KEY,
      { expiresIn: "7d" }
    );

    // Remove password field before sending response
    const { password: _, ...adminData } = existingAdmin.toObject();

    return res.status(200).json({
      message: "Authentication successful",
      token,
      admin: adminData,
    });

  } catch (error) {
    console.error("Login Error:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

export const getAdmins = async (req, res, next) => {
  let admins;
  try {
    admins = await Admin.find();
  } catch (err) {
    return console.log(err);
  }
  if (!admins) {
    return res.status(500).json({ message: "Internal Server Error" });
  }
  return res.status(200).json({ admins });
};

export const getAdminById = async (req, res, next) => {
  const id = req.params.id;

  let admin;
  try {
    admin = await Admin.findById(id).populate("addedMovies");
  } catch (err) {
    return console.log(err);
  }
  if (!admin) {
    return console.log("Cannot find Admin");
  }
  return res.status(200).json({ admin });
};

// Blogs Routes
export const addBlog = async (req, res, next) => {
  let session;
  try {
    // Handle file upload
    await new Promise((resolve, reject) => {
      upload(req, res, (err) => {
        if (err) {
          reject(err);
        }
        resolve();
      });
    });

    // Validate request body
    if (!req.body.blogData) {
      return res.status(400).json({
        success: false,
        message: "Blog data is required",
      });
    }

    // Parse blog data
    const { title, content } = JSON.parse(req.body.blogData);

    // Validate required fields
    if (!title?.trim() || !content?.trim()) {
      return res.status(400).json({
        success: false,
        message: "Title and content are required",
      });
    }

    // Validate files
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        success: false,
        message: "At least one image is required",
      });
    }

    if (req.files.length > 4) {
      return res.status(400).json({
        success: false,
        message: "Maximum 4 images allowed",
      });
    }

    // Sort files by index
    const filesWithIndex = req.files.map((file, index) => ({ file, index }));
    filesWithIndex.sort((a, b) => a.index - b.index);

    // Start MongoDB session
    session = await mongoose.startSession();
    session.startTransaction();

    // Upload images to Cloudinary
    const images = await Promise.all(
      filesWithIndex.map(async ({ file }) => {
        try {
          const result = await cloudinary.uploader.upload(file.path, {
            folder: "SatsangSeva/Blogs",
            quality: "auto",
            fetch_format: "auto",
          });
          return result.secure_url;
        } catch (error) {
          throw new Error(`Failed to upload image: ${error.message}`);
        }
      })
    );

    // Create and save blog
    const blog = new Blogs({
      title,
      content,
      images,
    });

    await blog.save({ session });
    await session.commitTransaction();

    // Send success response
    res.status(201).json({
      success: true,
      message: "Blog added successfully",
      data: {
        id: blog._id,
        title: blog.title,
      },
    });
  } catch (error) {
    // Rollback transaction if error occurs
    if (session) {
      await session.abortTransaction();
    }

    // Handle duplicate title error
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "Blog title already exists",
      });
    }

    // Handle validation errors
    if (error.name === "ValidationError") {
      return res.status(400).json({
        success: false,
        message: Object.values(error.errors)
          .map((err) => err.message)
          .join(", "),
      });
    }

    // Handle other errors
    res.status(500).json({
      success: false,
      message: "Failed to add blog",
      error:
        process.env.NODE_ENV === "development"
          ? error.message
          : "Internal server error",
    });
  } finally {
    if (session) {
      session.endSession();
    }
  }
};

export const getBlogs = async (req, res, next) => {
  try {
    const blogs = await Blogs.find().sort({ _id: -1 }).lean();

    if (!blogs || blogs.length === 0) {
      return res.status(404).json({ message: "No Blogs found" });
    }

    const blogsWithTimestamps = blogs.map((blog) => ({
      ...blog,
      createdAt: blog._id.getTimestamp(),
    }));

    return res.status(200).json({ blogs: blogsWithTimestamps });
  } catch (err) {
    // console.error("Error fetching blogs:", err);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

export const getBlogById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid blog ID format",
      });
    }

    const blog = await Blogs.findById(id).lean().select("-__v").exec();

    if (!blog) {
      return res.status(404).json({
        success: false,
        message: `No blog found with ID: ${id}`,
      });
    }

    const createdAt = mongoose.Types.ObjectId(id).getTimestamp();

    const formattedBlog = {
      ...blog,
      id: blog._id,
      createdAt,
      _id: undefined,
    };

    return res.status(200).json({
      success: true,
      message: "Blog retrieved successfully",
      data: formattedBlog,
    });
  } catch (error) {
    console.error("Error in getBlogById:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to retrieve blog",
      error:
        process.env.NODE_ENV === "development"
          ? error.message
          : "Internal server error",
    });
  }
};

export const deleteBlog = async (req, res) => {
  const session = await mongoose.startSession();

  try {
    const { id } = req.params;

    // Validate ID format
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid blog ID format",
      });
    }

    session.startTransaction();

    // Find the blog
    const blog = await Blogs.findById(id).session(session);
    if (!blog) {
      await session.abortTransaction();
      return res.status(404).json({
        success: false,
        message: `No blog found with ID: ${id}`,
      });
    }

    // Extract Cloudinary public IDs from image URLs
    const imagePublicIds = blog.images.map((imageUrl) => {
      const parts = imageUrl.split("/");
      const folderPath = parts.slice(parts.indexOf("SatsangSeva")).join("/");
      return folderPath.split(".")[0]; // Remove file extension
    });

    // Delete images from Cloudinary
    const cloudinaryResults = await Promise.allSettled(
      imagePublicIds.map((publicId) => cloudinary.uploader.destroy(publicId))
    );

    // Separate success and failed deletions
    const imagesDeleted = cloudinaryResults.filter((r) => r.status === "fulfilled").length;
    const imagesFailed = cloudinaryResults
      .filter((r) => r.status === "rejected")
      .map((r) => r.reason);

    // Delete blog from DB
    await Blogs.findByIdAndDelete(id).session(session);

    await session.commitTransaction();

    return res.status(200).json({
      success: true,
      message: "Blog deleted successfully",
      data: {
        id: blog._id,
        title: blog.title,
        imagesDeleted,
        imagesFailed: imagesFailed.length,
        errors: imagesFailed.length ? imagesFailed : undefined,
      },
    });

  } catch (error) {
    await session.abortTransaction();
    console.error("Error in deleteBlog:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to delete blog",
      error: process.env.NODE_ENV === "development" ? error.message : "Internal server error",
    });

  } finally {
    session.endSession();
  }
};

export const getCount = async (req, res) => {
  try {
    const [userCount, eventCount, bookingAggregation] = await Promise.all([
      User.countDocuments({}),
      Events.countDocuments({}),
      Bookings.aggregate([
        {
          $group: {
            _id: null,
            totalAttendees: { $sum: { $toInt: "$noOfAttendee" } },
          },
        },
      ]),
    ]);

    const totalAttendees = bookingAggregation?.[0]?.totalAttendees || 0;

    return res.status(200).json({
      success: true,
      users: userCount,
      bookings: totalAttendees,
      events: eventCount,
    });
  } catch (error) {
    console.error("Error retrieving counts:", error);
    return res.status(500).json({
      success: false,
      message: "Error retrieving counts",
      error: error.message,
    });
  }
};

export const adminUpdateBasicUserInfo = async (req, res) => {
  try {

    const userId = req.params.id;
    const user = await User.findById(userId);
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    const { name, email, phoneNumber, password, otp, profileType } = req.body;

    if (!name && !email && !phoneNumber && !password && profileType === undefined) {
      return res.status(400).json({
        success: false,
        message:
          "No update fields provided. Please supply at least one field.",
      });
    }

    // Validate profileType if provided
    if (profileType !== undefined) {
      const validProfileTypes = ["Artist", "Orator", "Organizer"];
      if (profileType !== null && !validProfileTypes.includes(profileType)) {
        return res.status(400).json({
          success: false,
          message: `ProfileType must be one of: ${validProfileTypes.join(
            ", "
          )} or null`,
        });
      }
    }

    let requiresOtp = false;
    let otpDestination = null;
    let pendingUpdate = {};

    if (phoneNumber && phoneNumber.trim() !== "") {
      const newPhone = phoneNumber.trim();
      if (!/^\d{10}$/.test(newPhone)) {
        return res.status(422).json({
          success: false,
          message: "Invalid phone number format; it must be 10 digits.",
        });
      }
      if (newPhone !== user.phoneNumber) {
        const existingUser = await User.findOne({
          phoneNumber: newPhone,
          _id: { $ne: userId },
        });
        if (existingUser) {
          return res.status(409).json({
            success: false,
            message: "The new phone number is already in use.",
          });
        }
        requiresOtp = true;
        otpDestination = newPhone;
        pendingUpdate.phoneNumber = newPhone;
      }
    }

    if (password && password.trim() !== "") {
      if (!requiresOtp) {
        otpDestination = user.phoneNumber;
      }
      requiresOtp = true;
      pendingUpdate.password = password.trim();
    }

    let directUpdates = {};

    if (name && name.trim() !== "") {
      directUpdates.name = name.trim();
    }

    if (profileType !== undefined) {
      directUpdates.profileType = profileType;
    }

    if (email && email.trim() !== "") {
      const newEmail = email.trim();
      if (!emailRegex.test(newEmail)) {
        return res
          .status(422)
          .json({ success: false, message: "Invalid email format" });
      }
      if (requiresOtp) {
        const existingEmailUser = await User.findOne({
          email: newEmail,
          _id: { $ne: userId },
        });
        if (existingEmailUser) {
          return res.status(409).json({
            success: false,
            message: "The new email is already in use.",
          });
        }
      }
      directUpdates.email = newEmail;
    }

    if (!requiresOtp) {
      const finalUpdates = { ...directUpdates };
      const updatedUser = await User.findByIdAndUpdate(userId, finalUpdates, {
        new: true,
      });
      return res.status(200).json({
        success: true,
        message: "User updated successfully.",
        user: updatedUser,
      });
    }

    pendingUpdate = { ...pendingUpdate, ...directUpdates };

    if (!otp) {
      const { otp: generatedOtp, expirationTime } = generateOtp();
      otpStore.set(otpDestination, {
        otp: generatedOtp,
        expirationTime,
        pendingUpdate,
        userId,
      });
      try {
        const smsResponse = await sendSms({ mobile: otpDestination, otp: generatedOtp });
        if (!smsResponse || !smsResponse.ok) {
          return res.status(500).json({
            success: false,
            message: "Failed to send OTP. Please try again later.",
          });
        }
      } catch (err) {
        return res.status(500).json({
          success: false,
          message: "Failed to send OTP.",
          error: err.message,
        });
      }
      return res.status(200).json({
        success: true,
        message: `OTP sent to ${otpDestination}. Please verify to complete the update.`,
        otpExpiresIn: 10,
        otp: generatedOtp,
      });
    } else {
      const storedData = otpStore.get(otpDestination);
      if (!storedData) {
        return res.status(400).json({
          success: false,
          message: "No OTP request found. Please request OTP again.",
        });
      }
      if (storedData.otp !== Number(otp)) {
        return res
          .status(400)
          .json({ success: false, message: "Invalid OTP provided." });
      }
      if (Date.now() > storedData.expirationTime) {
        otpStore.delete(otpDestination);
        return res.status(400).json({
          success: false,
          message: "OTP expired. Please request a new OTP and try again.",
        });
      }
      if (pendingUpdate.phoneNumber) {
        const existingUser = await User.findOne({
          phoneNumber: pendingUpdate.phoneNumber,
          _id: { $ne: userId },
        });
        if (existingUser) {
          return res.status(409).json({
            success: false,
            message: "The new phone number is already in use.",
          });
        }
      }
      if (pendingUpdate.email) {
        const existingEmailUser = await User.findOne({
          email: pendingUpdate.email,
          _id: { $ne: userId },
        });
        if (existingEmailUser) {
          return res.status(409).json({
            success: false,
            message: "The new email is already in use.",
          });
        }
      }
      if (pendingUpdate.password) {
        pendingUpdate.password = bcrypt.hashSync(pendingUpdate.password, 10);
      }
      const updatedUser = await User.findByIdAndUpdate(userId, pendingUpdate, {
        new: true,
      });
      otpStore.delete(otpDestination);
      return res.status(200).json({
        success: true,
        message: "User updated successfully.",
        user: updatedUser,
      });
    }
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "An error occurred while updating the user.",
      error: error.message,
    });
  }
};


export const adminModifyUser = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    // Use user id from URL params – this is the user to update
    const userId = req.params.id;
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: `User doesn't exist for id: ${userId}`,
      });
    }

    // Process multipart form data (assumes you use an upload middleware)
    await new Promise((resolve, reject) => {
      upload(req, res, (err) => {
        if (err) reject(err);
        resolve();
      });
    });

    const {
      desc,
      location,
      social,
      interests,
      preferredEventTypes,
      profileType,
    } = JSON.parse(req.body.updateUser);

    // Validate profileType if provided
    if (profileType !== undefined) {
      const validProfileTypes = ["Artist", "Orator", "Organizer"];
      if (!validProfileTypes.includes(profileType)) {
        return res.status(400).json({
          success: false,
          message: `ProfileType must be one of: ${validProfileTypes.join(", ")}`,
        });
      }
    }

    if (interests !== undefined) {
      if (!Array.isArray(interests)) {
        return res
          .status(400)
          .json({ success: false, message: "Interests must be an array" });
      }
      if (interests.some((interest) => typeof interest !== "string")) {
        return res.status(400).json({
          success: false,
          message: "All interests must be strings",
        });
      }
    }

    if (preferredEventTypes !== undefined) {
      if (!Array.isArray(preferredEventTypes)) {
        return res.status(400).json({
          success: false,
          message: "PreferredEventTypes must be an array",
        });
      }
      const validEventTypes = ["live", "onsite", "youtube stream"];
      if (
        preferredEventTypes.some((type) => !validEventTypes.includes(type))
      ) {
        return res.status(400).json({
          success: false,
          message: `PreferredEventTypes must be one of: ${validEventTypes.join(
            ", "
          )}`,
        });
      }
    }

    // Validate location format if provided
    if (location) {
      const requiredFields = [
        "address",
        "city",
        "state",
        "postalCode",
        "country",
      ];
      const missingFields = requiredFields.filter(
        (field) => !location[field] || location[field].trim() === ""
      );
      if (missingFields.length > 0) {
        return res.status(400).json({
          success: false,
          message: `Location is missing required fields: ${missingFields.join(
            ", "
          )}`,
        });
      }
      if (location.postalCode && !/^\d{5,6}$/.test(location.postalCode)) {
        return res.status(400).json({
          success: false,
          message: "Postal code must be a valid 5 or 6-digit number",
        });
      }
    }

    // Prepare update object
    const update = {
      ...(desc && { desc }),
      ...(location && { location }),
      ...(interests && { interests }),
      ...(profileType !== undefined && { profileType }),
      ...(preferredEventTypes && { preferredEventTypes }),
    };

    if (social) {
      update.social = social;
    }

    // Handle profile image if provided
    if (req.files?.length > 0) {
      if (req.files?.length > 1) {
        await session.abortTransaction();
        return res
          .status(500)
          .json({ success: false, message: "Only one image allowed" });
      }
      try {
        // Delete old image if exists
        if (user.profile) {
          const publicId = user.profile.split("/").pop().split(".")[0];
          if (publicId) {
            await cloudinary.uploader.destroy(`SatsangSeva/Users/${publicId}`);
          }
        }
        // Upload new image
        const file = req.files[0];
        const result = await cloudinary.uploader.upload(file.path, {
          folder: "SatsangSeva/Users",
        });
        update.profile = result.secure_url;
      } catch (err) {
        await session.abortTransaction();
        return res.status(500).json({
          success: false,
          message: "Failed to process image",
          error: err.message,
        });
      }
    }

    const updatedUser = await User.findByIdAndUpdate(userId, update, {
      new: true,
      session,
    });
    await session.commitTransaction();

    return res.status(200).json({
      success: true,
      message: "User updated successfully",
      updatedUser,
    });
  } catch (err) {
    await session.abortTransaction();
    return res.status(500).json({
      success: false,
      message: "Failed to update user",
      error: err.message,
    });
  } finally {
    session.endSession();
  }
};

export const adminUpdateEvent = async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  // Helper function to abort transaction and send response
  const abortTransaction = async (status, message, errors = null) => {
    await session.abortTransaction();
    return res.status(status).json({ success: false, message, ...(errors && { errors }) });
  };

  try {
    // No user ownership check is required since admin middleware handles authentication
    const eventId = req.params.id;
    const event = await Events.findById(eventId).session(session);

    if (!event) {
      return abortTransaction(404, "Event not found");
    }

    // Handle file upload (assuming upload returns a promise)
    await new Promise((resolve, reject) => {
      upload(req, res, (err) => (err ? reject(err) : resolve()));
    });

    // Parse and validate event data
    let eventData;
    try {
      eventData = JSON.parse(req.body.eventData);
    } catch (err) {
      return abortTransaction(400, "Invalid event data format");
    }

    const errors = validateEventInputs(eventData);
    if (errors) {
      return abortTransaction(422, "Validation failed", errors);
    }

    const {
      eventName,
      eventCategory,
      eventDesc,
      eventPrice,
      eventLang,
      noOfAttendees,
      maxAttendees,
      performerName,
      hostName,
      hostWhatsapp,
      sponserName,
      eventLink,
      location,
      eventAddress,
      geoCoordinates,
      startDate,
      endDate,
    } = eventData;

    // Process file uploads if available
    if (req.files && req.files.length > 0) {
      const MAX_POSTERS = 5;
      const sortedFiles = req.files
        .map((file, index) => ({ file, index }))
        .sort((a, b) => a.index - b.index)
        .slice(0, MAX_POSTERS);

      try {
        // Remove old images from Cloudinary
        const oldPosters = event.eventPosters || [];
        await Promise.all(
          oldPosters.map(async (posterUrl) => {
            const publicId = getPublicIdFromUrl(posterUrl);
            if (publicId) {
              await cloudinary.uploader.destroy(publicId);
            }
          })
        );

        // Upload new images
        const eventPosters = await Promise.all(
          sortedFiles.map(async ({ file }) => {
            const result = await cloudinary.uploader.upload(file.path, {
              folder: "SatsangSeva",
              resource_type: "image",
              quality: "auto",
              fetch_format: "auto",
            });
            return result.secure_url;
          })
        );

        event.eventPosters = eventPosters;
      } catch (error) {
        return abortTransaction(500, "Error managing image uploads", error.message);
      }
    }

    // Update event fields
    const formattedEventCategory = Array.isArray(eventCategory) ? eventCategory : [eventCategory];
    Object.assign(event, {
      eventName,
      eventCategory: formattedEventCategory,
      eventDesc,
      eventPrice,
      eventLang,
      noOfAttendees,
      maxAttendees,
      performerName,
      hostName,
      hostWhatsapp,
      sponserName,
      eventLink,
      location,
      eventAddress,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      updatedAt: new Date(),
    });

    // Update geoCoordinates if provided
    if (geoCoordinates) {
      event.geoCoordinates = {
        type: "Point",
        coordinates: geoCoordinates,
      };
    }

    const resEvent = await event.save({ session });
    await session.commitTransaction();

    return res.status(200).json({
      success: true,
      message: "Event updated successfully",
      data: resEvent,
    });
  } catch (error) {
    await session.abortTransaction();
    console.log(`error`, error)
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  } finally {
    session.endSession();
  }
};