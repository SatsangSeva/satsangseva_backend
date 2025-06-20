import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import mongoose from "mongoose";
import admin from "firebase-admin";
import crypto from "crypto";
import User from "../models/User.js";
import upload from "../utils/multer.js";
import cloudinary from "../utils/cloudinary.js";
import Subscription from "../models/Subscription.js";
import Bookings from "../models/Bookings.js";
import Events from "../models/Events.js";
dotenv.config();

const otpStore = new Map();
const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

const UserType = {
  0: "Host&Participant",
  1: "Participant",
};
const ProfileType = {
  "Artist": "Artist",
  "Orator": "Orator",
  "Organizer": "Organizer",
};

const generateOtp = () => {
  const otp = crypto.randomInt(1000, 9999);
  const expirationTime = Date.now() + 60000 * 10;
  return { otp, expirationTime };
};
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
export const getAllUsers = async (req, res) => {
  try {
    // Fetch all users, sorted by _id in descending order and exclude passwords
    const users = await User.find().sort({ _id: -1 }).select("-password");
    return res.status(200).json({
      success: true,
      message: "Users retrieved successfully.",
      data: users,
    });
  } catch (error) {
    console.error("Error fetching all users:", error);
    return res.status(500).json({
      success: false,
      message: "An unexpected error occurred while retrieving users.",
      error: error.message,
    });
  }
};

export const getUsersByType = async (req, res) => {
  try {
    const type = req.params.id;
    const currentUserId = req.user.id;

    if (!type) {
      return res.status(400).json({
        success: false,
        message: "profileType is required",
      });
    }

    // Use aggregation pipeline to fetch users with subscription info
    const users = await User.aggregate([
      // Match users of the specified type
      {
        $match: {
          profileType: ProfileType[type]
        }
      },
      // Sort by newest first
      {
        $sort: {
          _id: -1
        }
      },
      // Lookup subscriptions
      {
        $lookup: {
          from: "subscriptions",
          let: { userId: "$_id" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ["$subscribedTo", "$$userId"] },
                    { $eq: ["$subscriber", mongoose.Types.ObjectId(currentUserId)] }
                  ]
                }
              }
            }
          ],
          as: "subscriptionInfo"
        }
      },
      // Add isSubscribed field and subscribedAt if applicable
      {
        $addFields: {
          // isSubscribed: { $cond: [{ $gt: [{ $size: "$subscriptionInfo" }, 0] }, true, false] },
          isSubscribed: { $cond: [{ $gt: [{ $size: "$subscriptionInfo" }, 0] }, true, false] },
          subscribedAt: {
            $cond: [
              { $gt: [{ $size: "$subscriptionInfo" }, 0] },
              { $arrayElemAt: ["$subscriptionInfo.createdAt", 0] },
              null
            ]
          }
        }
      },
      // Remove the subscriptionInfo array and password field
      {
        $project: {
          password: 0,
        }
      }
    ]);

    return res.status(200).json({
      success: true,
      message: "Users retrieved successfully.",
      data: users,
    });
  } catch (error) {
    console.error("Error fetching users:", error);
    return res.status(500).json({
      success: false,
      message: "An unexpected error occurred while retrieving users.",
      error: error.message,
    });
  }
};

export const checkUserExists = async (req, res) => {
  try {
    const { phoneNumber, email } = req.query;
    if (!phoneNumber && !email) {
      return res
        .status(400)
        .json({ message: "Phone number or email is required" });
    }

    // Check if either phoneNumber or email exists
    const user = await User.findOne({
      $or: [{ phoneNumber }, { email }],
    });

    if (user) {
      if (user.phoneNumber === phoneNumber) {
        return res.status(200).json({
          exists: true,
          message: "Phone number already exists.",
        });
      }
      if (user.email === email) {
        return res.status(200).json({
          exists: true,
          message: "Email already exists.",
        });
      }
    } else {
      return res.status(401).json({
        exists: false,
        message: "User not found with this phone number or email.",
      });
    }
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Unexpected error occurred." });
  }
};

export const sendRegistrationOtp = async (req, res) => {
  const { email, phoneNumber, name, password, userType, fcmToken, profileType } = req.body;
  const validationErrors = [];
  console.log(req.body)
  if (!name || name.trim() === "") {
    validationErrors.push("Name is required");
  }
  if (!email || email.trim() === "") {
    validationErrors.push("Email is required");
  }
  if (
    !userType ||
    userType.trim() === "" ||
    !Object.values(UserType).includes(userType)
  ) {
    validationErrors.push(
      `UserType is required and should be one of these: Host&Participant, Participant`
    );
  }
  if (profileType && !Object.values(ProfileType).includes(profileType)) {
    validationErrors.push(
      `ProfileType should be one of these: Artist, Orator, Organizer`
    );
  }
  if (!phoneNumber || phoneNumber.trim() === "") {
    validationErrors.push("Phone number is required");
  }
  if (!password || password.trim() === "") {
    validationErrors.push("Password is required");
  }
  if (!fcmToken || fcmToken.trim() === "") {
    return res.status(422).json({ message: "FCM Token is required" });
  }
  if (email && !emailRegex.test(email.trim())) {
    validationErrors.push("Invalid email format");
  }

  if (validationErrors.length > 0) {
    return res.status(422).json({
      message: "Validation Failed",
      errors: validationErrors,
    });
  }

  try {
    const existingUser = await User.findOne({
      $or: [{ phoneNumber: phoneNumber.trim() }, { email: email.trim() }],
    });

    if (existingUser) {
      if (existingUser.email === email.trim()) {
        return res.status(400).json({
          message: "User with this email already exists. Please use a different one.",
        });
      }
      if (existingUser.phoneNumber === phoneNumber.trim()) {
        return res.status(400).json({
          message: "User with this phone number already exists. Please use a different one.",
        });
      }
    }

    const { otp, expirationTime } = generateOtp();
    try {
      const otpSendResult = await sendSms({
        mobile: phoneNumber.trim(),
        otp: otp,
      });
      if (!otpSendResult.status === 200) {
        throw new Error(`${otpSendResult.statusText} : Failed to sent otp`);
      }
      otpStore.set(phoneNumber.trim(), {
        otp,
        expirationTime,
      });
      console.log(`Email: ${email} --> Otp:${otp}`);
      return res.status(200).json({
        message: "OTP sent successfully",
        // Remove otp in production
        otp,
        otpExpiresIn: 10,
      });
    } catch (otpError) {
      // console.error("OTP sending failed:", otpError);
      return res.status(500).json({
        message: "Failed to send OTP. Please try again.",
      });
    }
  } catch (err) {
    console.error("Signup error:", err);
    return res.status(500).json({
      message: "An unexpected error occurred during signup",
    });
  }
};


export const verifyRegistrationOtp = async (req, res) => {
  const { email, phoneNumber, name, password, otp, userType, fcmToken, profileType } = req.body;
  const validationErrors = [];

  if (!phoneNumber || phoneNumber.trim() === "") {
    validationErrors.push("Phone number is required");
  }
  if (!name || name.trim() === "") {
    validationErrors.push("Name is required");
  }
  if (!email || email.trim() === "") {
    validationErrors.push("Email is required");
  }
  if (
    !userType ||
    userType.trim() === "" ||
    !Object.values(UserType).includes(userType)
  ) {
    validationErrors.push(
      `UserType is required and should be one of these: Host&Participant, Participant`
    );
  }
  if (profileType && !Object.values(ProfileType).includes(profileType)) {
    validationErrors.push(
      `ProfileType should be one of these: Artist, Orator, Organizer`
    );
  }
  if (email && !emailRegex.test(email.trim())) {
    validationErrors.push("Invalid email format");
  }
  if (!password || password.trim() === "") {
    validationErrors.push("Password is required");
  }
  if (!fcmToken || fcmToken.trim() === "") {
    return res.status(422).json({ message: "FCM Token is required" });
  }
  if (!otp || isNaN(Number(otp)) || otp.length !== 4) {
    validationErrors.push("OTP is required and should be 4 digit number");
  }

  if (validationErrors.length > 0) {
    return res.status(422).json({
      message: "Validation Failed",
      errors: validationErrors,
    });
  }

  try {
    const data = otpStore.get(phoneNumber);
    let user, userResponse;

    if (!data) {
      return res
        .status(400)
        .json({ success: false, error: "No OTP request found" });
    }

    if (!data.otp || data.otp !== Number(otp)) {
      return res.status(400).json({ success: false, error: "Invalid OTP" });
    }

    if (Date.now() > data.expirationTime) {
      otpStore.delete(phoneNumber);
      return res.status(400).json({ success: false, error: "OTP expired" });
    } else {
      try {
        const userData = {
          name,
          email,
          phoneNumber,
          userType,
          fcmToken: [fcmToken],
          password: bcrypt.hashSync(password),
        };
        if (profileType) {
          userData.profileType = profileType
        }

        const newUser = new User(userData);
        user = await newUser.save();
        if (!user)
          return res.status(400).json({ message: "Error creating user" });
      } catch (error) {
        return res.status(400).json({ message: "Error creating user", error });
      }
    }

    // Generate JWT token
    const token = jwt.sign({ id: user._id }, process.env.SECRET_KEY, {
      expiresIn: "7d",
    });

    otpStore.delete(phoneNumber);
    userResponse = user.toObject();
    delete userResponse.password;

    return res.status(200).json({
      message: "OTP verified successfully",
      user: userResponse,
      token,
    });
  } catch (error) {
    return res.status(400).json({ message: "Error verifying otp", error });
  }
};

export const updateBasicUserInfo = async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res
        .status(401)
        .json({ success: false, message: "Authorization header missing" });
    }
    const token = authHeader.split(" ")[1];
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.SECRET_KEY);
    } catch (err) {
      return res
        .status(401)
        .json({ success: false, message: "Invalid or expired token" });
    }
    const userId = decoded.id;
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
        message: "No update fields provided. Please supply at least one field.",
      });
    }

    // Validate profileType if provided
    if (profileType !== undefined) {
      const validProfileTypes = ["Artist", "Orator", "Organizer"];
      if (profileType !== null && !validProfileTypes.includes(profileType)) {
        return res.status(400).json({
          success: false,
          message: `ProfileType must be one of: ${validProfileTypes.join(", ")} or null`,
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
      const { otp, expirationTime } = generateOtp();
      otpStore.set(otpDestination, {
        otp,
        expirationTime,
        pendingUpdate,
        userId,
      });
      try {
        const smsResponse = await sendSms({
          mobile: otpDestination,
          otp,
        });
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
        otp,
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

export const modifyUser = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const id = req.params.id;
    const user = await User.findById(id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: `User doesn't exist for id: ${id}`,
      });
    }

    // Process multipart form data
    await new Promise((resolve, reject) => {
      upload(req, res, (err) => {
        if (err) reject(err);
        resolve();
      });
    });

    const { desc, location, social, interests, preferredEventTypes, profileType } = JSON.parse(
      req.body.updateUser
    );

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
        return res.status(400).json({
          success: false,
          message: "Interests must be an array",
        });
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

    // Validate location format
    if (location) {
      const requiredFields = ["address", "city", "state", "postalCode", "country"];
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

    // if (social) {
    //   // If social comes in the old array format, convert it to object format
    //   if (Array.isArray(social)) {
    //     const socialObj = {};
    //     social.forEach(item => {
    //       if (item.type && item.link) {
    //         socialObj[item.type] = item.link;
    //       }
    //     });
    //     update.social = socialObj;
    //   } else if (typeof social === 'object') {
    //     // If social is already in object format, use it directly
    //     update.social = social;
    //   }
    // }
    if (social) {
      const existingSocial = user.social?.toObject?.() || {}; // get existing or fallback
    
      let socialObj = {};
    
      if (Array.isArray(social)) {
        social.forEach(item => {
          if (item.type && item.link) {
            socialObj[item.type] = item.link;
          }
        });
      } else if (typeof social === 'object') {
        Object.entries(social).forEach(([key, value]) => {
          if (["facebook", "twitter", "instagram", "youtube", "web"].includes(key)) {
            socialObj[key] = value;
          }
        });
      }
    
      update.social = { ...existingSocial, ...socialObj }; // merge with existing
    }
    // Handle profile image
    if (req.files?.length > 0) {
      if (req.files?.length > 1) {
        await session.abortTransaction();
        return res.status(500).json({
          success: false,
          message: "Only one image allowed",
        });
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

    // Update user with transaction
    const updatedUser = await User.findByIdAndUpdate(id, update, {
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

export const sendPasswordResetOtp = async (req, res) => {
  const { email } = req.body;

  if (!email || email.trim() === "") {
    return res.status(400).json({
      success: false,
      message: "Email is required",
    });
  }

  if (!emailRegex.test(email.trim())) {
    return res.status(400).json({
      success: false,
      message: "Invalid email format",
    });
  }

  try {
    // Check if user exists
    const user = await User.findOne({ email: email.trim() });
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "No user found with this email",
      });
    }

    const { otp, expirationTime } = generateOtp();

    try {
      const otpSendResult = await sendSms({
        mobile: user.phoneNumber,
        otp: otp,
      });

      if (!otpSendResult.status === 200) {
        throw new Error("Failed to send OTP");
      }

      otpStore.set(email.trim(), {
        otp,
        expirationTime,
        userId: user._id,
      });
      console.log(`otpStore`, otpStore);
      return res.status(200).json({
        success: true,
        message: "Password reset OTP sent successfully",
        otpExpiresIn: 10,
      });
    } catch (otpError) {
      console.error("OTP sending failed:", otpError);
      return res.status(500).json({
        success: false,
        message: "Failed to send OTP. Please try again.",
      });
    }
  } catch (error) {
    console.error("Password reset error:", error);
    return res.status(500).json({
      success: false,
      message: "An unexpected error occurred",
    });
  }
};

export const verifyAndResetPassword = async (req, res) => {
  const { email, otp, newPassword } = req.body;

  if (!email || !otp || !newPassword) {
    return res.status(400).json({
      success: false,
      message: "Email, OTP, and new password are required",
    });
  }

  if (!email.trim() || !newPassword.trim()) {
    return res.status(400).json({
      success: false,
      message: "Email and new password cannot be empty",
    });
  }
  const passwordValidation = validatePassword(newPassword.trim());
  if (!passwordValidation.isValid) {
    return res.status(400).json({
      success: false,
      message: "Invalid new password",
      errors: passwordValidation.errors,
    });
  }

  try {
    const storedData = otpStore.get(email.trim());

    if (!storedData) {
      return res.status(400).json({
        success: false,
        message: "No OTP request found or OTP has expired",
      });
    }

    console.log(`storedData`, storedData);
    if (storedData.otp !== Number(otp)) {
      return res.status(400).json({
        success: false,
        message: "Invalid OTP",
      });
    }

    if (Date.now() > storedData.expirationTime) {
      otpStore.delete(email.trim());
      return res.status(400).json({
        success: false,
        message: "OTP has expired",
      });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    const updatedUser = await User.findByIdAndUpdate(
      storedData.userId,
      { password: hashedPassword },
      { new: true }
    );

    if (!updatedUser) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    otpStore.delete(email.trim());

    return res.status(200).json({
      success: true,
      message: "Password reset successful",
    });
  } catch (error) {
    console.error("Password reset error:", error);
    return res.status(500).json({
      success: false,
      message: "An unexpected error occurred while resetting password",
    });
  }
};

export const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const userId = req.user.id;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: "Current password and new password are required",
      });
    }

    // Trim inputs
    const trimmedCurrentPassword = currentPassword.trim();
    const trimmedNewPassword = newPassword.trim();

    // Validate new password
    const passwordValidation = validatePassword(trimmedNewPassword);
    if (!passwordValidation.isValid) {
      return res.status(400).json({
        success: false,
        message: "Invalid new password",
        errors: passwordValidation.errors,
      });
    }

    // Check if new password is different from current password
    if (trimmedCurrentPassword === trimmedNewPassword) {
      return res.status(400).json({
        success: false,
        message: "New password must be different from current password",
      });
    }

    // Find the user
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Verify current password
    const isCurrentPasswordValid = await bcrypt.compare(
      trimmedCurrentPassword,
      user.password
    );
    if (!isCurrentPasswordValid) {
      return res.status(400).json({
        success: false,
        message: "Current password is incorrect",
      });
    }

    // Hash new password
    const hashedNewPassword = await bcrypt.hash(trimmedNewPassword, 10);

    // Update user's password
    user.password = hashedNewPassword;
    await user.save();

    return res.status(200).json({
      success: true,
      message: "Password changed successfully",
    });
  } catch (error) {
    console.error("Change password error:", error);
    return res.status(500).json({
      success: false,
      message: "An unexpected error occurred while changing password",
    });
  }
};

export const submitDoc = async (req, res) => {
  const userId = req.user.id;
  if (!userId)
    return res
      .status(400)
      .json({ success: false, message: "Access denied, unauthorized access" });

  upload(req, res, async (err) => {
    if (err) {
      console.log("Upload error:", err);
      return res.status(500).json({ message: "File upload failed", error: err });
    }

    try {
      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      if (req.files && req.files.length > 0) {
        for (const file of req.files) {
          const result = await cloudinary.uploader.upload(file.path, {
            folder: "SatsangSeva/Users/docs",
            resource_type: "auto",
          });
          user.document.push(result.secure_url); // Push each URL to array
        }

        await user.save();
        return res.status(200).json({
          success: true,
          message: "Documents uploaded successfully!",
          documentUrls: user.document,
        });
      } else {
        return res.status(400).json({ message: "No files uploaded" });
      }
    } catch (err) {
      console.log("Save error:", err);
      return res.status(500).json({ message: "Server error", error: err.message });
    }
  });
};


export const deleteUser = async (req, res) => {
  const { id } = req.params;
  try {
    const user = await User.findByIdAndDelete(id);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found." });
    }
    return res.status(200).json({ success: true, message: "Deleted Successfully" });
  } catch (error) {
    console.error("Error deleting user:", error);
    return res.status(500).json({ success: false, message: "Something went wrong.", error: error.message });
  }
};

export const login = async (req, res) => {
  try {
    const { email, password, gAuth, fcmToken } = req.body;

    if (
      !email ||
      !email.trim() ||
      !password ||
      !password.trim()
    ) {
      return res
        .status(422)
        .json({ message: "Email, password and FCM token are required" });
    }

    if (!emailRegex.test(email)) {
      return res.status(422).json({ message: "Invalid email format" });
    }

    const existingUser = await User.findOne({ email });
    if (!existingUser) {
      return res.status(404).json({ message: "User not found" });
    }
    if (!existingUser.password) {
      return res.status(404).json({ message: "Password update pending" });
    }

    if (!gAuth) {
      const isPasswordCorrect = bcrypt.compareSync(
        password,
        existingUser.password
      );
      if (!isPasswordCorrect) {
        return res.status(400).json({ message: "Incorrect password" });
      }
    }

    // if (
    //   fcmToken &&
    //   !fcmToken.trim() === "" &&
    //   !existingUser.fcmToken.includes(fcmToken)
    // ) {
    //   existingUser.fcmToken.push(fcmToken);
    //   await existingUser.save();
    // }
    if (
      fcmToken &&
      fcmToken.trim() !== "" &&
      !existingUser.fcmToken.includes(fcmToken)
    ) {
      existingUser.fcmToken.push(fcmToken);
      await existingUser.save();
    }
    // Generate JWT token
    const token = jwt.sign({ id: existingUser._id }, process.env.SECRET_KEY, {
      expiresIn: "7d",
    });

    return res.status(200).json({
      message: "Login successful",
      token,
      user: { id: existingUser._id },
    });
  } catch (error) {
    console.error("Login Error:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

export const getBookingsOfUser = async (req, res) => {
  const id = req.params.id;
  let bookings;
  try {
    bookings = await Bookings.find({ user: id })
      .populate("event")
      // .populate("user")
      .sort({ _id: -1 });
  } catch (err) {
    return console.log(err);
  }
  if (!bookings) {
    return res.status(500).json({ message: "Unable to get Your Bookings" });
  }
  return res.status(200).json({ bookings });
};

export const getEventsOfUser = async (req, res) => {
  try {
    const userId = req.params.id;
    if (!userId) {
      return res
        .status(401)
        .json({ success: false, message: "user id is required" });
    }
    const events = await Events.find({ user: userId, approved: true }).sort({
      _id: -1,
    });
    if (!events) {
      return res.status(404).json({ message: "Unable to get Events" });
    }
    return res.status(200).json({ events: events });
  } catch (err) {
    return res.status(500).json({
      success: false,
      messgae: `Unable to get events, ${err.messgae}`,
    });
  }
};

// export const getUserById = async (req, res) => {
//   const { id } = req.params;

//   try {
//     const user = await User.findById(id).select("-password");

//     if (!user) {
//       return res.status(404).json({ message: "User not found" });
//     }
//     return res.status(200).json({ user });
//   } catch (error) {
//     console.error("Error fetching user:", error);
//     return res.status(500).json({ message: "Internal server error" });
//   }
// };

export const getUserById = async (req, res) => {
  const { id } = req.params;
  try {
    // Get user data without transformation
    const user = await User.findById(id).select("-password").lean();

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Direct database query to get the complete social data
    // This bypasses any mongoose transformations
    const userWithFullSocial = await mongoose.connection.db
      .collection('users')
      .findOne({ _id: new mongoose.Types.ObjectId(id) });

    // If we found the user in the raw collection, use that social data
    if (userWithFullSocial && userWithFullSocial.social) {
      user.social = userWithFullSocial.social;
    }

    // If social data is still incomplete, provide default values
    if (user.social && user.social.length > 0) {
      user.social = user.social.map(socialItem => {
        return {
          _id: socialItem._id,
          type: socialItem.type || "unknown",
          link: socialItem.link || "#"
        };
      });
    }

    return res.status(200).json({ user });
  } catch (error) {
    console.error("Error fetching user:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};
export const getuserInsight = async (req, res) => {
  try {
    const userId = req.user.id;

    const subscribers = await Subscription.countDocuments({
      subscribedTo: userId,
    });

    const totalEvents = await Events.countDocuments({ user: userId });

    const now = new Date();

    const upcomingApprovedEvents = await Events.find({
      user: userId,
      // approved: true,
      startDate: { $gt: now },
    });

    const pastEvents = await Events.find({
      user: userId,
      endDate: { $lt: now },
    });

    return res.status(200).json({
      success: true,
      data: {
        subscribers,
        totalEvents,
        upcomingApprovedEvents,
        pastEvents,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Server error while fetching insights",
    });
  }
};

export const googleAuthCallback = async (req, res) => {
  try {
    const user = req.user;
    const token = jwt.sign({ id: user._id }, process.env.SECRET_KEY, {
      expiresIn: "30d",
    });

    res.redirect(
      `satsangseva://auth-success?token=${token}&userId=${user._id}`
    );
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Authentication failed",
      error: error.message,
    });
  }
};

export const sendGoogleUpdateOtp = async (req, res) => {
  const { userId, phoneNumber, email, userType, fcmToken, profileType } = req.body;
  const validationErrors = [];

  // Validate input
  if (!userId || userId.trim() === "") {
    validationErrors.push("User ID is required");
  }
  if (!phoneNumber || phoneNumber.trim() === "") {
    validationErrors.push("Phone number is required");
  }
  if (!email || email.trim() === "") {
    validationErrors.push("Email is required");
  }
  if (!fcmToken || fcmToken.trim() === "") {
    validationErrors.push("fcmToken is required");
  }

  // Phone number format validation
  if (
    phoneNumber &&
    (phoneNumber.length !== 10 || !/^\d+$/.test(phoneNumber))
  ) {
    validationErrors.push("Invalid phone number format");
  }

  // Email format validation
  if (email && !emailRegex.test(email.trim())) {
    validationErrors.push("Invalid email format");
  }
  if (
    !userType ||
    userType.trim() === "" ||
    !Object.values(UserType).includes(userType)
  ) {
    validationErrors.push(
      `UserType is required and shlode be one of this Host&Participant, Participant`
    );
  }
  if (profileType !== undefined) {
    if (profileType !== null && !Object.values(ProfileType).includes(profileType)) {
      validationErrors.push(
        `ProfileType should be one of these: Artist, Orator, Organizer`
      );
    }
  }
  if (validationErrors.length > 0) {
    return res.status(422).json({
      success: false,
      message: "Validation Failed",
      errors: validationErrors,
    });
  }

  try {
    // Check if user exists
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Check if phone number already exists for another user
    const existingPhoneUser = await User.findOne({
      phoneNumber,
      _id: { $ne: userId },
    });
    if (existingPhoneUser) {
      return res.status(409).json({
        success: false,
        message: "Phone number already registered",
      });
    }

    // Check if email already exists for another user
    const existingEmailUser = await User.findOne({
      email,
      _id: { $ne: userId },
    });
    if (existingEmailUser) {
      return res.status(409).json({
        success: false,
        message: "Email already registered",
      });
    }

    // Generate and send OTP
    const { otp, expirationTime } = generateOtp();

    try {
      const otpSendResult = await sendSms({
        mobile: phoneNumber,
        otp: otp,
      });

      if (!otpSendResult.status === 200) {
        throw new Error("Failed to send OTP");
      }

      // Store OTP with additional context
      otpStore.set(phoneNumber, {
        otp,
        expirationTime,
        userId,
        // phoneNumber,
        // email,
      });
      // console.log(otpStore);
      return res.status(200).json({
        success: true,
        message: "OTP sent successfully",
        otpExpiresIn: 10,
        // Remove otp in production
        otp,
      });
    } catch (otpError) {
      console.error("OTP sending failed:", otpError);
      return res.status(500).json({
        success: false,
        message: "Failed to send OTP. Please try again.",
      });
    }
  } catch (error) {
    console.error("Update OTP request error:", error);
    return res.status(500).json({
      success: false,
      message: "An unexpected error occurred",
    });
  }
};

export const verifyGoogleUpdateOtp = async (req, res) => {
  const { userId, phoneNumber, email, otp, fcmToken, userType, profileType } = req.body;
  const validationErrors = [];

  // Validate input
  if (!phoneNumber || !email || !otp || !fcmToken || !userId || !userType) {
    validationErrors.push(
      "userId, phoneNumber, email, otp, fcmToken and userType is required"
    );
  }

  if (email && !emailRegex.test(email.trim())) {
    validationErrors.push("Invalid email format");
  }

  if (
    phoneNumber &&
    (phoneNumber.length !== 10 || !/^\d+$/.test(phoneNumber))
  ) {
    validationErrors.push("Invalid phone number format");
  }

  if (
    !userType ||
    userType.trim() === "" ||
    !Object.values(UserType).includes(userType)
  ) {
    validationErrors.push(
      `UserType is required and should be one of these: Host&Participant, Participant`
    );
  }

  if (profileType !== undefined) {
    if (profileType !== null && !Object.values(ProfileType).includes(profileType)) {
      validationErrors.push(
        `ProfileType should be one of these: Artist, Orator, Organizer`
      );
    }
  }

  if (validationErrors.length > 0) {
    return res.status(422).json({
      success: false,
      message: "Validation Failed",
      errors: validationErrors,
    });
  }

  try {
    const storedData = otpStore.get(phoneNumber);
    if (!storedData) {
      return res.status(400).json({
        success: false,
        message: "No OTP request found",
      });
    }

    if (storedData.otp !== Number(otp)) {
      return res.status(400).json({
        success: false,
        message: "Invalid OTP",
      });
    }

    if (Date.now() > storedData.expirationTime) {
      otpStore.delete(phoneNumber);
      return res.status(400).json({
        success: false,
        message: "OTP expired",
      });
    }

    const updateData = {
      phoneNumber: phoneNumber,
      email: email,
      $addToSet: { fcmToken: fcmToken },
    };

    if (userType) {
      updateData.userType = userType;
    }

    if (profileType !== undefined) {
      updateData.profileType = profileType;
    }

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      updateData,
      { new: true }
    );

    if (!updatedUser) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Clear OTP store
    otpStore.delete(phoneNumber);

    return res.status(200).json({
      success: true,
      message: "Profile updated successfully",
      user: {
        id: updatedUser._id,
        name: updatedUser.name,
        email: updatedUser.email,
        phoneNumber: updatedUser.phoneNumber,
        userType: updatedUser.userType,
        profileType: updatedUser.profileType,
      },
    });
  } catch (error) {
    console.error("Verify update OTP error:", error);
    return res.status(500).json({
      success: false,
      message: "An unexpected error occurred",
    });
  }
};

export const verifyFirebaseToken = async (req, res) => {
  try {
    // Get the ID token from the request
    const { idToken } = req.body;

    if (!idToken) {
      return res.status(400).json({
        success: false,
        message: "No ID token provided",
      });
    }

    const decodedToken = await admin.auth().verifyIdToken(idToken);
    const { email, name, picture } = decodedToken;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: "Invalid token: Email not found",
      });
    }

    // Check if user exists
    let user = await User.findOne({ email });

    let userExist = true;

    if (!user) {
      user = new User({
        name: name || email.split("@")[0],
        email,
        profile: picture || null,
      });
      await user.save();
      userExist = false;
    }

    // Sign JWT token
    const token = jwt.sign({ id: user._id }, process.env.SECRET_KEY, {
      expiresIn: "30d",
    });

    return res.status(200).json({
      success: true,
      userExist,
      token,
      userId: user._id,
    });
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: "Authentication failed",
      error: error.message,
    });
  }
};

const validatePassword = (password) => {
  const minLength = 8;
  const hasUppercase = /[A-Z]/.test(password);
  const hasLowercase = /[a-z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(password);

  const errors = [];

  if (!password) {
    errors.push("Password is required");
  } else {
    if (password.length < minLength) {
      errors.push(`Password must be at least ${minLength} characters long`);
    }
    if (!hasUppercase) {
      errors.push("Password must contain at least one uppercase letter");
    }
    if (!hasLowercase) {
      errors.push("Password must contain at least one lowercase letter");
    }
    if (!hasNumber) {
      errors.push("Password must contain at least one number");
    }
    if (!hasSpecialChar) {
      errors.push("Password must contain at least one special character");
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
};

export const updateUserCoordinates = async (req, res) => {
  try {
    const userId = req.user.id;
    const { lat, lng } = req.body;

    if (!lat || !lng) {
      return res.status(400).json({ success: false, message: "Latitude and Longitude are required." });
    }

    // Update or create coordinates inside user.location
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      {
        $set: {
          "location.coordinates.lat": lat,
          "location.coordinates.lng": lng,
        },
      },
      { new: true, upsert: true } // new: return updated doc; upsert: create path if missing
    ).lean();

    if (!updatedUser) {
      return res.status(404).json({ success: false, message: "User not found." });
    }

    return res.status(200).json({
      success: true,
      message: "User coordinates updated successfully.",
      user: updatedUser,
    });
  } catch (err) {
    console.error("Error updating coordinates:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

