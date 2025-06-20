import mongoose from "mongoose";
import Events from "../models/Events.js";
import User from "../models/User.js";
import upload from "../utils/multer.js";
import { validateEventInputs } from '../utils/eventValidators.js'
import cloudinary, { getPublicIdFromUrl } from "../utils/cloudinary.js";
import Bookings from "../models/Bookings.js";
import dotenv from "dotenv";
import { calculateDistanceInKm, extractCoordinatesFromLink } from "../config/geoConfig.js";
dotenv.config();

const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;

export const addEvent = async (req, res, next) => {
  const session = await mongoose.startSession();
  try {
    // Token validation
    const adminId = req.user.id;
    // Handle file upload
    await new Promise((resolve, reject) => {
      upload(req, res, (err) => {
        if (err) {
          reject(err);
        }
        resolve();
      });
    });

    // Validate if files were uploaded
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        success: false,
        message: "At least one event poster is required",
      });
    }

    // Parse and validate event data
    let eventData;
    try {
      eventData = JSON.parse(req.body.eventData);
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: "Invalid event data format",
        error: "Event data must be valid JSON",
      });
    }
    // console.log(`event data`, eventData);

    // Validate event inputs
    // const validationErrors = validateEventInputs(eventData);
    // if (validationErrors) {
    //   return res.status(422).json({
    //     success: false,
    //     message: "Validation failed",
    //     errors: validationErrors,
    //   });
    // }

    // Validate dates
    const startDateObj = new Date(eventData.startDate);
    const endDateObj = new Date(eventData.endDate);

    if (isNaN(startDateObj.getTime()) || isNaN(endDateObj.getTime())) {
      return res.status(400).json({
        success: false,
        message: "Invalid date format",
      });
    }

    if (startDateObj > endDateObj) {
      return res.status(400).json({
        success: false,
        message: "End date must be after start date",
      });
    }

    // Process and sort files
    const filesWithIndex = req.files.map((file, index) => ({
      file,
      index,
    }));
    filesWithIndex.sort((a, b) => a.index - b.index);

    // Upload images to Cloudinary
    session.startTransaction();

    try {
      // Uncomment in production

      const eventPosters = await Promise.all(
        filesWithIndex.slice(0, 4).map(async ({ file }) => {
          const result = await cloudinary.uploader.upload(file.path, {
            folder: "SatsangSeva",
          });
          return result.secure_url;
        })
      );

      // Create new event
      const event = new Events({
        ...eventData,
        eventCategory: Array.isArray(eventData.eventCategory)
          ? eventData.eventCategory
          : [eventData.eventCategory],
        startDate: startDateObj,
        endDate: endDateObj,
        eventPosters,
        user: adminId,
      });

      // Save event with transaction
      // const session = await mongoose.startSession();
      try {
        // session.startTransaction();
        const adminUser = await User.findById(adminId);
        console.log(`adminUser`, adminUser);
        if (!adminUser) {
          throw new Error("Admin user not found");
        }

        // Uncomment in production
        await event.save({ session });
        adminUser.events.push(event);
        await adminUser.save({ session });
        await session.commitTransaction();

        // console.log(`New event is `, event);
        return res.status(201).json({
          success: true,
          message: "Event created successfully",
          eventData: event,
        });
      } catch (error) {
        // Uncomment in production
        await session.abortTransaction();
        throw error;
      } finally {
        // Uncomment in production
        session.endSession();
      }
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: "Failed to process event",
        error: error.message,
      });
    }
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

export const getAllApprovedEvents = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 25;
    const skip = (page - 1) * limit;

    const userId =
      req.user && req.user.id ? mongoose.Types.ObjectId(req.user.id) : null;

    // Base pipeline without skip and limit for counting
    const basePipeline = [
      { $match: { approved: true } },
      { $sort: { startDate: 1 } },
    ];

    // Main pipeline with pagination
    const pipeline = [
      ...basePipeline,
      { $skip: skip },
      { $limit: limit },
      {
        $lookup: {
          from: "users",
          localField: "user",
          foreignField: "_id",
          pipeline: [
            {
              $project: {
                _id: 1,
                name: 1,
                email: 1,
                profile: 1,
              },
            },
          ],
          as: "creator",
        },
      },
      {
        $lookup: {
          from: "likes",
          let: { eventId: "$_id" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ["$eventId", "$$eventId"] },
                    { $eq: ["$userId", userId] },
                  ],
                },
              },
            },
          ],
          as: "userLikes",
        },
      },
      {
        $addFields: {
          isLiked: { $gt: [{ $size: "$userLikes" }, 0] },
          creator: { $arrayElemAt: ["$creator", 0] },
        },
      },
      { $project: { userLikes: 0, user: 0, __v: 0 } },
    ];

    // Count pipeline
    const countPipeline = [...basePipeline, { $count: "total" }];

    // Execute aggregation
    const [events, countResult] = await Promise.all([
      Events.aggregate(pipeline),
      Events.aggregate(countPipeline),
    ]);

    // Calculate total and total pages
    const total = countResult.length > 0 ? countResult[0].total : 0;
    const totalPages = Math.ceil(total / limit);

    if (!events || events.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No events found",
      });
    }

    return res.status(200).json({
      success: true,
      events,
      pagination: {
        page,
        limit,
        totalEvents: total,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
    });
  } catch (err) {
    return res.status(404).json({
      success: false,
      message: "Error fetching events: " + err.message,
    });
  }
};

export const getAllEvents = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 25;
    const skip = (page - 1) * limit;

    const userId =
      req.user && req.user.id ? mongoose.Types.ObjectId(req.user.id) : null;

    // Base pipeline without skip and limit for counting
    const basePipeline = [
      { $sort: { startDate: 1 } },
    ];

    // Main pipeline with pagination
    const pipeline = [
      ...basePipeline,
      { $skip: skip },
      { $limit: limit },
      {
        $lookup: {
          from: "users",
          localField: "user",
          foreignField: "_id",
          pipeline: [
            {
              $project: {
                _id: 1,
                name: 1,
                email: 1,
                profile: 1,
              },
            },
          ],
          as: "creator",
        },
      },
      {
        $lookup: {
          from: "likes",
          let: { eventId: "$_id" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ["$eventId", "$$eventId"] },
                    { $eq: ["$userId", userId] },
                  ],
                },
              },
            },
          ],
          as: "userLikes",
        },
      },
      {
        $addFields: {
          isLiked: { $gt: [{ $size: "$userLikes" }, 0] },
          creator: { $arrayElemAt: ["$creator", 0] },
        },
      },
      { $project: { userLikes: 0, user: 0, __v: 0 } },
    ];

    // Count pipeline
    const countPipeline = [...basePipeline, { $count: "total" }];

    // Execute aggregation
    const [events, countResult] = await Promise.all([
      Events.aggregate(pipeline),
      Events.aggregate(countPipeline),
    ]);

    // Calculate total and total pages
    const total = countResult.length > 0 ? countResult[0].total : 0;
    const totalPages = Math.ceil(total / limit);

    if (!events || events.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No events found",
      });
    }

    return res.status(200).json({
      success: true,
      events,
      pagination: {
        page,
        limit,
        totalEvents: total,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
    });
  } catch (err) {
    return res.status(404).json({
      success: false,
      message: "Error fetching events: " + err.message,
    });
  }
};

export const updateEvent = async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  // Helper function to abort transaction and send response
  const abortTransaction = async (status, message, errors = null) => {
    await session.abortTransaction();
    return res.status(status).json({ success: false, message, ...(errors && { errors }) });
  };

  try {
    const userId = req.user.id;
    const eventId = req.params.id;
    const event = await Events.findById(eventId).session(session);

    if (!event) {
      return abortTransaction(404, "Event not found");
    }

    if (event.user.toString() !== userId) {
      return abortTransaction(403, "You don't have permission to update this event");
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
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  } finally {
    session.endSession();
  }
};

export const getNearByEvents = async (req, res, next) => {
  try {
    const location = [parseFloat(req.query.long), parseFloat(req.query.lat)];
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 25;
    const skip = (page - 1) * limit;
    const userId =
      req.user && req.user.id ? mongoose.Types.ObjectId(req.user.id) : null;
    const currentDate = new Date();

    // Base pipeline without skip and limit for counting
    const basePipeline = [
      {
        $geoNear: {
          near: location,
          distanceField: "distance",
          spherical: true,
        },
      },
      {
        $match: { startDate: { $gte: currentDate }, approved: true },
      },
      { $sort: { distance: 1 } },
    ];

    // Main pipeline with pagination
    const pipeline = [
      ...basePipeline,
      { $skip: skip },
      { $limit: limit },
      {
        $lookup: {
          from: "users",
          localField: "user",
          foreignField: "_id",
          pipeline: [
            {
              $project: {
                _id: 1,
                name: 1,
                email: 1,
                profile: 1,
              },
            },
          ],
          as: "creator",
        },
      },
      {
        $lookup: {
          from: "likes",
          let: { eventId: "$_id" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ["$eventId", "$$eventId"] },
                    { $eq: ["$userId", userId] },
                  ],
                },
              },
            },
          ],
          as: "userLikes",
        },
      },
      {
        $addFields: {
          isLiked: { $gt: [{ $size: "$userLikes" }, 0] },
          creator: { $arrayElemAt: ["$creator", 0] },
        },
      },
      {
        $project: {
          _id: 1,
          distance: 1,
          eventName: 1,
          eventCategory: 1,
          eventLang: 1,
          noOfAttendees: 1,
          performerName: 1,
          hostName: 1,
          hostWhatsapp: 1,
          sponserName: 1,
          eventLink: 1,
          location: 1,
          eventAddress: 1,
          startDate: 1,
          endDate: 1,
          eventDesc: 1,
          eventPrice: 1,
          eventPosters: 1,
          approved: 1,
          creator: 1,
          isLiked: 1,
        },
      },
    ];

    // Count pipeline
    const countPipeline = [...basePipeline, { $count: "total" }];

    // Execute aggregation
    const [events, countResult] = await Promise.all([
      Events.aggregate(pipeline),
      Events.aggregate(countPipeline),
    ]);

    // Calculate total and total pages
    const total = countResult.length > 0 ? countResult[0].total : 0;
    const totalPages = Math.ceil(total / limit);

    if (!events) {
      return res.status(500).json({
        success: false,
        message: "Request Failed",
      });
    }

    if (events.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No events found",
      });
    }

    return res.status(200).json({
      success: true,
      events,
      pagination: {
        page,
        limit,
        totalEvents: total,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
    });
  } catch (error) {
    return res.status(404).json({
      success: false,
      message: "Error fetching events: " + error.message,
    });
  }
};

export const getEventsByKM = async (req, res, next) => {
  try {
    const longitude = parseFloat(req.query.long);
    const latitude = parseFloat(req.query.lat);

    if (isNaN(longitude) || isNaN(latitude)) {
      return res.status(400).json({
        success: false,
        message:
          "Invalid coordinates provided. Please provide valid longitude and latitude.",
      });
    }

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 25;
    const skip = (page - 1) * limit;
    const userId =
      req.user && req.user.id ? mongoose.Types.ObjectId(req.user.id) : null;

    // Base pipeline without skip and limit for counting
    const basePipeline = [
      {
        $geoNear: {
          near: { type: "Point", coordinates: [longitude, latitude] },
          distanceField: "distance", // in meters
          spherical: true,
          distanceMultiplier: 0.001, // convert to kilometers
        },
      },
      {
        $match: { approved: true },
      },
    ];

    // Main pipeline with pagination
    const pipeline = [
      ...basePipeline,
      { $skip: skip },
      { $limit: limit },
      {
        $lookup: {
          from: "users",
          localField: "user",
          foreignField: "_id",
          pipeline: [
            {
              $project: {
                _id: 1,
                name: 1,
                email: 1,
                profile: 1,
              },
            },
          ],
          as: "creator",
        },
      },
      {
        $lookup: {
          from: "likes",
          let: { eventId: "$_id" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ["$eventId", "$$eventId"] },
                    { $eq: ["$userId", userId] },
                  ],
                },
              },
            },
          ],
          as: "userLikes",
        },
      },
      {
        $addFields: {
          isLiked: { $gt: [{ $size: "$userLikes" }, 0] },
          creator: { $arrayElemAt: ["$creator", 0] },
        },
      },
      { $project: { userLikes: 0, user: 0, __v: 0 } },
    ];

    // Count pipeline
    const countPipeline = [...basePipeline, { $count: "total" }];

    // Execute aggregation
    const [events, countResult] = await Promise.all([
      Events.aggregate(pipeline),
      Events.aggregate(countPipeline),
    ]);

    // Calculate total and total pages
    const total = countResult.length > 0 ? countResult[0].total : 0;
    const totalPages = Math.ceil(total / limit);

    if (!events) {
      return res
        .status(500)
        .json({ success: false, message: "Request Failed" });
    }

    if (events.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: "No events found" });
    }

    return res.status(200).json({
      success: true,
      events,
      pagination: {
        page,
        limit,
        totalEvents: total,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
    });
  } catch (error) {
    console.error("Error in getEventsByKM:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};


// export const getUpComingEvents = async (req, res, next) => {
//   try {
//     const currentDate = new Date();
//     const page = parseInt(req.query.page) || 1;
//     const limit = parseInt(req.query.limit) || 25;
//     const skip = (page - 1) * limit;
//     const userId = req.user && req.user.id ? mongoose.Types.ObjectId(req.user.id) : null;

//     // Fetch user location
//     const user = await User.findById(req.user.id).lean();
//     if (!user || !user.location || !user.location.coordinates) {
//       return res.status(400).json({ message: "User location not found." });
//     }

//     const userLat = parseFloat(user.location.coordinates.lat);
//     const userLng = parseFloat(user.location.coordinates.lng);

//     const basePipeline = [
//       { $match: { startDate: { $gte: currentDate }, approved: true } },
//       { $sort: { startDate: 1 } },
//     ];

//     const pipeline = [
//       ...basePipeline,
//       { $skip: skip },
//       { $limit: limit },
//       {
//         $lookup: {
//           from: "users",
//           localField: "user",
//           foreignField: "_id",
//           pipeline: [
//             { $project: { _id: 1, name: 1, email: 1, profile: 1 } },
//           ],
//           as: "creator",
//         },
//       },
//       {
//         $lookup: {
//           from: "likes",
//           let: { eventId: "$_id" },
//           pipeline: [
//             {
//               $match: {
//                 $expr: { $and: [{ $eq: ["$eventId", "$$eventId"] }, { $eq: ["$userId", userId] }] },
//               },
//             },
//           ],
//           as: "userLikes",
//         },
//       },
//       {
//         $addFields: {
//           isLiked: { $gt: [{ $size: "$userLikes" }, 0] },
//           creator: { $arrayElemAt: ["$creator", 0] },
//         },
//       },
//       { $project: { userLikes: 0, user: 0, __v: 0 } },
//     ];

//     const countPipeline = [...basePipeline, { $count: "total" }];

//     const [events, countResult] = await Promise.all([
//       Events.aggregate(pipeline),
//       Events.aggregate(countPipeline),
//     ]);

//     // Batch process distance calculation
//     const eventsWithDistance = await Promise.all(events.map(async (event) => {
//       const locationData = await extractCoordinatesFromLink(event.locationLink);

//       if (!locationData) {
//         return { ...event, distanceInKm: null };
//       }

//       const eventLat = locationData.lat;
//       const eventLng = locationData.lng;

//       const distance = calculateDistanceInKm(userLat, userLng, eventLat, eventLng);

//       return {
//         ...event,
//         distanceInKm: parseFloat(distance.toFixed(3)),
//       };
//     }));

//     const total = countResult.length > 0 ? countResult[0].total : 0;
//     const totalPages = Math.ceil(total / limit);

//     if (eventsWithDistance.length === 0) {
//       return res.status(404).json({ success: false, message: "No upcoming events found" });
//     }

//     return res.status(200).json({
//       success: true,
//       events: eventsWithDistance,
//       pagination: {
//         page,
//         limit,
//         totalEvents: total,
//         totalPages,
//         hasNextPage: page < totalPages,
//         hasPrevPage: page > 1,
//       },
//     });
//   } catch (err) {
//     console.error("getUpComingEvents error:", err);
//     return res.status(500).json({ success: false, message: err.message });
//   }
// };

export const getUpComingEvents = async (req, res, next) => {
  try {
    const currentDate = new Date();
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 25;
    const skip = (page - 1) * limit;
    const userId = req.user && req.user.id ? mongoose.Types.ObjectId(req.user.id) : null;

    // Try to fetch user location (optional now)
    const user = await User.findById(req.user.id).lean();
    let userLat = null;
    let userLng = null;

    if (user && user.location && user.location.coordinates) {
      userLat = parseFloat(user.location.coordinates.lat);
      userLng = parseFloat(user.location.coordinates.lng);
    }

    const basePipeline = [
      { $match: { startDate: { $gte: currentDate }, approved: true } },
      { $sort: { startDate: 1 } },
    ];

    const pipeline = [
      ...basePipeline,
      { $skip: skip },
      { $limit: limit },
      {
        $lookup: {
          from: "users",
          localField: "user",
          foreignField: "_id",
          pipeline: [
            { $project: { _id: 1, name: 1, email: 1, profile: 1 } },
          ],
          as: "creator",
        },
      },
      {
        $lookup: {
          from: "likes",
          let: { eventId: "$_id" },
          pipeline: [
            {
              $match: {
                $expr: { $and: [{ $eq: ["$eventId", "$$eventId"] }, { $eq: ["$userId", userId] }] },
              },
            },
          ],
          as: "userLikes",
        },
      },
      {
        $addFields: {
          isLiked: { $gt: [{ $size: "$userLikes" }, 0] },
          creator: { $arrayElemAt: ["$creator", 0] },
        },
      },
      { $project: { userLikes: 0, user: 0, __v: 0 } },
    ];

    const countPipeline = [...basePipeline, { $count: "total" }];

    const [events, countResult] = await Promise.all([
      Events.aggregate(pipeline),
      Events.aggregate(countPipeline),
    ]);

    let eventsWithDistance = [];

    // If user location is available, calculate distance
    if (userLat !== null && userLng !== null) {
      eventsWithDistance = await Promise.all(events.map(async (event) => {
        const locationData = await extractCoordinatesFromLink(event.locationLink);

        if (!locationData) {
          return { ...event, distanceInKm: null };
        }

        const eventLat = locationData.lat;
        const eventLng = locationData.lng;

        const distance = calculateDistanceInKm(userLat, userLng, eventLat, eventLng);

        return {
          ...event,
          distanceInKm: parseFloat(distance.toFixed(3)),
        };
      }));
    } else {
      // If user location is not available, just return events as-is without distance
      eventsWithDistance = events.map(event => ({ ...event, distanceInKm: null }));
    }

    const total = countResult.length > 0 ? countResult[0].total : 0;
    const totalPages = Math.ceil(total / limit);

    if (eventsWithDistance.length === 0) {
      return res.status(404).json({ success: false, message: "No upcoming events found" });
    }

    return res.status(200).json({
      success: true,
      events: eventsWithDistance,
      pagination: {
        page,
        limit,
        totalEvents: total,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
    });
  } catch (err) {
    console.error("getUpComingEvents error:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
};


export const getPastEvents = async (req, res, next) => {
  try {
    const currentDate = new Date();
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 25;
    const skip = (page - 1) * limit;
    const userId =
      req.user && req.user.id ? mongoose.Types.ObjectId(req.user.id) : null;

    // Base pipeline without skip and limit for counting
    const basePipeline = [
      { $match: { endDate: { $lt: currentDate }, approved: true } },
      { $sort: { endDate: -1 } },
    ];

    // Main pipeline with pagination
    const pipeline = [
      ...basePipeline,
      { $skip: skip },
      { $limit: limit },
      {
        $lookup: {
          from: "users",
          localField: "user",
          foreignField: "_id",
          pipeline: [
            {
              $project: {
                _id: 1,
                name: 1,
                email: 1,
                profile: 1,
              },
            },
          ],
          as: "creator",
        },
      },
      {
        $lookup: {
          from: "likes",
          let: { eventId: "$_id" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ["$eventId", "$$eventId"] },
                    { $eq: ["$userId", userId] },
                  ],
                },
              },
            },
          ],
          as: "userLikes",
        },
      },
      {
        $addFields: {
          isLiked: { $gt: [{ $size: "$userLikes" }, 0] },
          creator: { $arrayElemAt: ["$creator", 0] },
        },
      },
      { $project: { userLikes: 0, __v: 0, user: 0 } },
    ];

    // Count pipeline
    const countPipeline = [...basePipeline, { $count: "total" }];

    // Execute aggregation
    const [events, countResult] = await Promise.all([
      Events.aggregate(pipeline),
      Events.aggregate(countPipeline),
    ]);

    // Calculate total and total pages
    const total = countResult.length > 0 ? countResult[0].total : 0;
    const totalPages = Math.ceil(total / limit);

    if (!events) {
      return res
        .status(500)
        .json({ success: false, message: "Request Failed" });
    }

    if (events.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: "No past events found" });
    }

    return res.status(200).json({
      success: true,
      events,
      pagination: {
        page,
        limit,
        totalEvents: total,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
    });
  } catch (err) {
    console.error("getPastEvents error:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

export const getLatestEvents = async (req, res, next) => {
  try {
    const currentDate = new Date();
    currentDate.setHours(0, 0, 0, 0); // start of today
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 25;
    const skip = (page - 1) * limit;
    const userId =
      req.user && req.user.id ? mongoose.Types.ObjectId(req.user.id) : null;

    // Base pipeline without skip and limit for counting
    const basePipeline = [
      { $match: { endDate: { $gte: currentDate }, approved: true } },
      { $sort: { endDate: 1 } },
    ];

    // Main pipeline with pagination
    const pipeline = [
      ...basePipeline,
      { $skip: skip },
      { $limit: limit },
      {
        $lookup: {
          from: "users",
          localField: "user",
          foreignField: "_id",
          pipeline: [
            {
              $project: {
                _id: 1,
                name: 1,
                email: 1,
                profile: 1,
              },
            },
          ],
          as: "creator",
        },
      },
      {
        $lookup: {
          from: "likes",
          let: { eventId: "$_id" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ["$eventId", "$$eventId"] },
                    { $eq: ["$userId", userId] },
                  ],
                },
              },
            },
          ],
          as: "userLikes",
        },
      },
      {
        $addFields: {
          isLiked: { $gt: [{ $size: "$userLikes" }, 0] },
          creator: { $arrayElemAt: ["$creator", 0] },
        },
      },
      { $project: { userLikes: 0, user: 0, __v: 0 } },
    ];

    // Count pipeline
    const countPipeline = [...basePipeline, { $count: "total" }];

    // Execute aggregation
    const [events, countResult] = await Promise.all([
      Events.aggregate(pipeline),
      Events.aggregate(countPipeline),
    ]);

    // Calculate total and total pages
    const total = countResult.length > 0 ? countResult[0].total : 0;
    const totalPages = Math.ceil(total / limit);

    if (!events) {
      return res
        .status(500)
        .json({ success: false, message: "Request Failed" });
    }

    if (events.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: "No latest events found" });
    }

    return res.status(200).json({
      success: true,
      events,
      pagination: {
        page,
        limit,
        totalEvents: total,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
    });
  } catch (err) {
    console.error("getLatestEvents error:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

export const getEventById = async (req, res, next) => {
  try {
    const eventId = mongoose.Types.ObjectId(req.params.id);
    const userId =
      req.user && req.user.id ? mongoose.Types.ObjectId(req.user.id) : null;

    const events = await Events.aggregate([
      { $match: { _id: eventId } },
      {
        $lookup: {
          from: "users",
          localField: "user",
          foreignField: "_id",
          pipeline: [
            {
              $project: {
                _id: 1,
                name: 1,
                email: 1,
                profile: 1,
              },
            },
          ],
          as: "creator",
        },
      },
      {
        $lookup: {
          from: "likes",
          let: { eventId: "$_id" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ["$eventId", "$$eventId"] },
                    { $eq: ["$userId", userId] },
                  ],
                },
              },
            },
          ],
          as: "userLikes",
        },
      },
      {
        $addFields: {
          isLiked: { $gt: [{ $size: "$userLikes" }, 0] },
          creator: { $arrayElemAt: ["$creator", 0] },
        },
      },
      { $project: { userLikes: 0, __v: 0, user: 0 } },
    ]);

    if (!events || events.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: "Invalid Event ID" });
    }
    return res.status(200).json({ success: true, event: events[0] });
  } catch (err) {
    console.error("getEventById error:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

export const approveEventById = async (req, res, next) => {
  const { id } = req.params;
  try {
    const event = await Events.findById(id);
    if (!event) {
      return res.status(404).json({ error: "Event not found" });
    }
    event.approved = true;
    event.approvedAt = new Date();

    await event.save();

    return res.status(200).json({
      message: `Event '${event.eventName}' approved successfully.`,
      event,
    });
  } catch (error) {
    console.error("Error approving event:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};

export const rejectEventById = async (req, res, next) => {
  const { id } = req.params;
  try {
    const event = await Events.findById(id);
    if (!event) {
      return res.status(404).json({ error: "Event not found" });
    }

    event.approved = false;

    await event.save();

    return res.status(200).json({
      message: `Event '${event.eventName}' rejected successfully.`,
      event,
    });
  } catch (error) {
    console.error("Error rejecting event:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};

export const getPendingEvents = async (req, res, next) => {
  try {
    const events = await Events.find({ approved: false });

    if (!events || events.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No events pending approval."
      });
    }

    return res.status(200).json({
      success: true,
      count: events.length,
      pending: events
    });

  } catch (err) {
    console.error(`Error fetching pending events: ${err.message}`);
    return res.status(500).json({
      success: false,
      message: "Failed to retrieve pending events",
      error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
};

export const deleteEvent = async (req, res, next) => {
  try {
    const id = req.params.id;
    const event = await Events.findById(id);

    if (!event) {
      return res.status(404).json({
        success: false,
        message: "Event not found",
      });
    }

    // Delete Cloudinary images before deleting the event
    await Promise.all(
      event.eventPosters.map(async (posterUrl) => {
        const publicId = posterUrl.split("/").pop().split(".")[0];
        await cloudinary.uploader.destroy(`SatsangSeva/${publicId}`);
      })
    );

    // Use findOneAndDelete to trigger cascade middleware
    await Events.findOneAndDelete({ _id: id });

    return res.status(200).json({
      success: true,
      message: "Event and all related data deleted successfully",
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to delete event",
      error: error.message,
    });
  }
};

// export const searchEvents = async (req, res, next) => {
//   try {
//     // Extract pagination parameters
//     const page = parseInt(req.query.page) || 1;
//     const limit = parseInt(req.query.limit) || 25;
//     const skip = (page - 1) * limit;

//     // Extract user ID if available
//     const userId = req.user && req.user.id ? mongoose.Types.ObjectId(req.user.id) : null;

//     // Current date for filtering future events
//     const currentDate = new Date();

//     // Build the aggregation pipeline
//     const pipeline = [];

//     // Handle geolocation search if coordinates are provided
//     if (req.query.lat && req.query.long) {
//       const location = [parseFloat(req.query.long), parseFloat(req.query.lat)];
//       pipeline.push({
//         $geoNear: {
//           near: location,
//           distanceField: "distance",
//           spherical: true,
//         },
//       });
//     }

//     // Build match criteria for search parameters
//     // We'll always require approved events and future dates
//     const baseMatchQuery = {
//       approved: true,
//       startDate: { $gte: currentDate }
//     };

//     // Build an array of OR conditions
//     const orConditions = [];

//     // Add name search if provided
//     if (req.query.name) {
//       orConditions.push({ eventName: { $regex: req.query.name, $options: "i" } });
//     }

//     // Add address search if provided
//     if (req.query.add) {
//       orConditions.push({ "address.address": { $regex: req.query.add, $options: "i" } });
//     }

//     // Add category search if provided
//     if (req.query.category) {
//       let categories = req.query.category;
//       if (!Array.isArray(categories)) {
//         categories = categories.split(",").map(cat => cat.trim());
//       }
//       orConditions.push({ eventCategory: { $in: categories.map(cat => new RegExp(cat, "i")) } });
//     }

//     // Add artist/orator search if provided
//     if (req.query.artist || req.query.orator) {
//       const artistOrOrators = [];
//       if (req.query.artist) {
//         const artists = Array.isArray(req.query.artist) ? req.query.artist : req.query.artist.split(",").map(a => a.trim());
//         artistOrOrators.push(...artists);
//       }
//       if (req.query.orator) {
//         const orators = Array.isArray(req.query.orator) ? req.query.orator : req.query.orator.split(",").map(o => o.trim());
//         artistOrOrators.push(...orators);
//       }
//       if (artistOrOrators.length > 0) {
//         orConditions.push({ artistOrOratorName: { $in: artistOrOrators.map(name => new RegExp(name, "i")) } });
//       }
//     }

//     // Add organizer search if provided - FIXED THIS SECTION
//     if (req.query.organizer) {
//       const organizers = Array.isArray(req.query.organizer)
//         ? req.query.organizer
//         : req.query.organizer.split(",").map(org => org.trim());

//       if (organizers.length > 0) {
//         // Changed to use exact RegExp objects for each organizer name
//         const organizerRegexes = organizers.map(name => new RegExp(name, "i"));
//         orConditions.push({ organizerName: { $in: organizerRegexes } });
//       }
//     }

//     // Add language search if provided
//     if (req.query.language) {
//       orConditions.push({ eventLang: { $regex: req.query.language, $options: "i" } });
//     }

//     // Add date search if provided
//     if (req.query.date) {
//       const startOfDay = new Date(`${req.query.date}T00:00:00Z`);
//       const endOfDay = new Date(`${req.query.date}T23:59:59Z`);
//       orConditions.push({ startDate: { $gte: startOfDay, $lte: endOfDay } });
//     }

//     // Complete match query
//     let matchQuery;
//     if (orConditions.length > 0) {
//       // Combine base conditions with OR conditions
//       matchQuery = {
//         $and: [
//           baseMatchQuery,
//           { $or: orConditions }
//         ]
//       };
//     } else {
//       // If no OR conditions, just use base conditions
//       matchQuery = baseMatchQuery;
//     }

//     // Add match query to pipeline
//     pipeline.push({ $match: matchQuery });

//     // Determine sort order - by distance if geo search, otherwise by date
//     if (req.query.lat && req.query.long) {
//       pipeline.push({ $sort: { distance: 1 } });
//     } else {
//       pipeline.push({ $sort: { startDate: 1 } });
//     }

//     // Count total documents for pagination info
//     const countPipeline = [...pipeline];
//     countPipeline.push({ $count: "total" });

//     // Add pagination
//     pipeline.push(
//       { $skip: skip },
//       { $limit: limit }
//     );

//     // Add creator and likes lookups
//     pipeline.push(
//       {
//         $lookup: {
//           from: "users",
//           localField: "user",
//           foreignField: "_id",
//           pipeline: [
//             {
//               $project: {
//                 _id: 1,
//                 name: 1,
//                 email: 1,
//                 profile: 1,
//               },
//             },
//           ],
//           as: "creator",
//         },
//       },
//       {
//         $lookup: {
//           from: "likes",
//           let: { eventId: "$_id" },
//           pipeline: [
//             {
//               $match: {
//                 $expr: {
//                   $and: [
//                     { $eq: ["$eventId", "$$eventId"] },
//                     { $eq: ["$userId", userId] },
//                   ],
//                 },
//               },
//             },
//           ],
//           as: "userLikes",
//         },
//       },
//       {
//         $addFields: {
//           isLiked: { $gt: [{ $size: "$userLikes" }, 0] },
//           creator: { $arrayElemAt: ["$creator", 0] },
//         },
//       },
//       // Project stage - ensuring all fields match schema fields
//       {
//         $project: {
//           _id: 1,
//           distance: 1,
//           eventName: 1,
//           eventCategory: 1,
//           eventLang: 1,
//           noOfAttendees: 1,
//           eventPrice: 1,
//           artistOrOratorName: 1,
//           organizerName: 1,
//           organizerWhatsapp: 1,
//           eventLink: 1,
//           bookingLink: 1,
//           locationLink: 1,
//           address: 1,
//           startDate: 1,
//           endDate: 1,
//           startTime: 1,
//           endTime: 1,
//           eventDesc: 1,
//           eventPosters: 1,
//           approved: 1,
//           creator: 1,
//           isLiked: 1,
//           likeCount: 1,
//         },
//       }
//     );

//     // Execute aggregation
//     const [events, countResult] = await Promise.all([
//       Events.aggregate(pipeline),
//       Events.aggregate(countPipeline),
//     ]);

//     // Calculate total and total pages
//     const total = countResult.length > 0 ? countResult[0].total : 0;
//     const totalPages = Math.ceil(total / limit);

//     // Return appropriate response
//     if (!events || events.length === 0) {
//       return res.status(404).json({
//         success: false,
//         message: "No events found matching the criteria",
//       });
//     }

//     return res.status(200).json({
//       success: true,
//       events,
//       pagination: {
//         page,
//         limit,
//         totalEvents: total,
//         totalPages,
//         hasNextPage: page < totalPages,
//         hasPrevPage: page > 1,
//       },
//     });
//   } catch (error) {
//     console.error("Events API Error:", error);
//     return res.status(500).json({
//       success: false,
//       message: "Failed to fetch events",
//       error: error.message,
//     });
//   }
// };

export const searchEvents = async (req, res, next) => {
  try {
    // Existing pagination and user logic
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 25;
    const skip = (page - 1) * limit;

    const userId = req.user && req.user.id ? mongoose.Types.ObjectId(req.user.id) : null;

    const currentDate = new Date();
    const pipeline = [];

    let userLat = null;
    let userLng = null;

    // If lat/long are provided in query, use them
    if (req.query.lat && req.query.long) {
      userLat = parseFloat(req.query.lat);
      userLng = parseFloat(req.query.long);
    }

    // Build search filters (same as your existing logic)
    const baseMatchQuery = {
      approved: true,
      startDate: { $gte: currentDate }
    };

    const orConditions = [];

    if (req.query.name) {
      orConditions.push({ eventName: { $regex: req.query.name, $options: "i" } });
    }

    if (req.query.add) {
      orConditions.push({ "address.address": { $regex: req.query.add, $options: "i" } });
    }

    if (req.query.category) {
      let categories = req.query.category;
      if (!Array.isArray(categories)) {
        categories = categories.split(",").map(cat => cat.trim());
      }
      orConditions.push({ eventCategory: { $in: categories.map(cat => new RegExp(cat, "i")) } });
    }

    if (req.query.artist || req.query.orator) {
      const artistOrOrators = [];
      if (req.query.artist) {
        const artists = Array.isArray(req.query.artist) ? req.query.artist : req.query.artist.split(",").map(a => a.trim());
        artistOrOrators.push(...artists);
      }
      if (req.query.orator) {
        const orators = Array.isArray(req.query.orator) ? req.query.orator : req.query.orator.split(",").map(o => o.trim());
        artistOrOrators.push(...orators);
      }
      if (artistOrOrators.length > 0) {
        orConditions.push({ artistOrOratorName: { $in: artistOrOrators.map(name => new RegExp(name, "i")) } });
      }
    }

    if (req.query.organizer) {
      const organizers = Array.isArray(req.query.organizer)
        ? req.query.organizer
        : req.query.organizer.split(",").map(org => org.trim());

      if (organizers.length > 0) {
        const organizerRegexes = organizers.map(name => new RegExp(name, "i"));
        orConditions.push({ organizerName: { $in: organizerRegexes } });
      }
    }

    if (req.query.language) {
      orConditions.push({ eventLang: { $regex: req.query.language, $options: "i" } });
    }

    if (req.query.date) {
      const startOfDay = new Date(`${req.query.date}T00:00:00Z`);
      const endOfDay = new Date(`${req.query.date}T23:59:59Z`);
      orConditions.push({ startDate: { $gte: startOfDay, $lte: endOfDay } });
    }

    let matchQuery;
    if (orConditions.length > 0) {
      matchQuery = { $and: [baseMatchQuery, { $or: orConditions }] };
    } else {
      matchQuery = baseMatchQuery;
    }

    pipeline.push({ $match: matchQuery });
    pipeline.push({ $sort: { startDate: 1 } });
    pipeline.push({ $skip: skip }, { $limit: limit });

    pipeline.push(
      {
        $lookup: {
          from: "users",
          localField: "user",
          foreignField: "_id",
          pipeline: [{ $project: { _id: 1, name: 1, email: 1, profile: 1 } }],
          as: "creator",
        },
      },
      {
        $lookup: {
          from: "likes",
          let: { eventId: "$_id" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ["$eventId", "$$eventId"] },
                    { $eq: ["$userId", userId] },
                  ],
                },
              },
            },
          ],
          as: "userLikes",
        },
      },
      {
        $addFields: {
          isLiked: { $gt: [{ $size: "$userLikes" }, 0] },
          creator: { $arrayElemAt: ["$creator", 0] },
        },
      },
      {
        $project: {
          _id: 1,
          distance: 1,
          eventName: 1,
          eventCategory: 1,
          eventLang: 1,
          noOfAttendees: 1,
          eventPrice: 1,
          artistOrOratorName: 1,
          organizerName: 1,
          organizerWhatsapp: 1,
          eventLink: 1,
          bookingLink: 1,
          locationLink: 1,
          address: 1,
          startDate: 1,
          endDate: 1,
          startTime: 1,
          endTime: 1,
          eventDesc: 1,
          eventPosters: 1,
          approved: 1,
          creator: 1,
          isLiked: 1,
          likeCount: 1,
        },
      }
    );

    const countPipeline = [{ $match: matchQuery }, { $count: "total" }];

    const [events, countResult] = await Promise.all([
      Events.aggregate(pipeline),
      Events.aggregate(countPipeline),
    ]);

    if (!events || events.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No events found matching the criteria",
      });
    }

    const total = countResult.length > 0 ? countResult[0].total : 0;
    const totalPages = Math.ceil(total / limit);

    // 👉 Add distance calculation if user location is provided
    let eventsWithDistance = events;

    if (userLat && userLng) {
      eventsWithDistance = await Promise.all(events.map(async (event) => {
        const locationData = await extractCoordinatesFromLink(event.locationLink);

        if (!locationData) {
          return { ...event, distanceInKm: null };
        }

        const eventLat = locationData.lat;
        const eventLng = locationData.lng;

        const distance = calculateDistanceInKm(userLat, userLng, eventLat, eventLng);

        return {
          ...event,
          distanceInKm: parseFloat(distance.toFixed(3)),
        };
      }));

      // Optional: Sort events by distance if needed
      eventsWithDistance.sort((a, b) => a.distanceInKm - b.distanceInKm);
    }

    return res.status(200).json({
      success: true,
      events: eventsWithDistance,
      pagination: {
        page,
        limit,
        totalEvents: total,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
    });
  } catch (error) {
    console.error("Events API Error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch events",
      error: error.message,
    });
  }
};

export const suggestEventNames = async (req, res, next) => {
  try {
    const eventName = req.query.name;
    if (!eventName) {
      return res.status(400).json({
        success: false,
        message: "The 'name' query parameter is required.",
      });
    }

    // Set up pagination values
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    // Build match query using regex for case-insensitive search
    const matchQuery = {
      eventName: { $regex: eventName, $options: "i" },
      approved: true,
    };

    const userId =
      req.user && req.user.id ? mongoose.Types.ObjectId(req.user.id) : null;

    // Create pipeline for suggestions
    const pipeline = [
      { $match: matchQuery },
      { $sort: { startDate: 1 } },
      { $skip: skip },
      { $limit: limit },
      {
        $lookup: {
          from: "users",
          localField: "user",
          foreignField: "_id",
          pipeline: [
            {
              $project: {
                _id: 1,
                name: 1,
                email: 1,
                profile: 1,
              },
            },
          ],
          as: "creator",
        },
      },
      {
        $lookup: {
          from: "likes",
          let: { eventId: "$_id" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ["$eventId", "$$eventId"] },
                    { $eq: ["$userId", userId] },
                  ],
                },
              },
            },
          ],
          as: "userLikes",
        },
      },
      {
        $addFields: {
          isLiked: { $gt: [{ $size: "$userLikes" }, 0] },
          creator: { $arrayElemAt: ["$creator", 0] },
        },
      },
      { $project: { userLikes: 0, __v: 0, user: 0 } },
    ];

    // Create count pipeline for total count
    const countPipeline = [{ $match: matchQuery }, { $count: "total" }];

    // Execute both pipelines
    const [suggestions, countResult] = await Promise.all([
      Events.aggregate(pipeline),
      Events.aggregate(countPipeline),
    ]);

    // Calculate total and total pages
    const total = countResult.length > 0 ? countResult[0].total : 0;
    const totalPages = Math.ceil(total / limit);

    return res.status(200).json({
      success: true,
      suggestions,
      pagination: {
        page,
        limit,
        totalEvents: total,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
    });
  } catch (err) {
    console.error("suggestEventNames error:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

export const getLiveEvents = async (req, res, next) => {
  try {
    const currentDate = new Date();
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 25;
    const skip = (page - 1) * limit;
    const userId =
      req.user && req.user.id ? mongoose.Types.ObjectId(req.user.id) : null;

    // Build match query for live events
    const matchQuery = {
      startDate: { $lte: currentDate },
      endDate: { $gt: currentDate },
      approved: true,
    };

    // Create pipeline for events
    const pipeline = [
      { $match: matchQuery },
      { $sort: { startDate: 1 } },
      { $skip: skip },
      { $limit: limit },
      {
        $lookup: {
          from: "users",
          localField: "user",
          foreignField: "_id",
          pipeline: [
            {
              $project: {
                _id: 1,
                name: 1,
                email: 1,
                profile: 1,
              },
            },
          ],
          as: "creator",
        },
      },
      {
        $lookup: {
          from: "likes",
          let: { eventId: "$_id" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ["$eventId", "$$eventId"] },
                    { $eq: ["$userId", userId] },
                  ],
                },
              },
            },
          ],
          as: "userLikes",
        },
      },
      {
        $addFields: {
          isLiked: { $gt: [{ $size: "$userLikes" }, 0] },
          creator: { $arrayElemAt: ["$creator", 0] },
        },
      },
      { $project: { userLikes: 0, __v: 0, user: 0 } },
    ];

    // Create count pipeline to count total events
    const countPipeline = [{ $match: matchQuery }, { $count: "total" }];

    // Execute both pipelines
    const [liveEvents, countResult] = await Promise.all([
      Events.aggregate(pipeline),
      Events.aggregate(countPipeline),
    ]);

    // Calculate total and total pages
    const total = countResult.length > 0 ? countResult[0].total : 0;
    const totalPages = Math.ceil(total / limit);

    if (!liveEvents || liveEvents.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: "No live events found" });
    }

    return res.status(200).json({
      success: true,
      events: liveEvents,
      pagination: {
        page,
        limit,
        totalEvents: total,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
    });
  } catch (error) {
    console.error("Error in getLiveEvents:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

export const getEventInsight = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    // Validate IDs
    if (!mongoose.Types.ObjectId.isValid(id) || !mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid event or user ID format"
      });
    }

    const eventId = new mongoose.Types.ObjectId(id);
    const userObjectId = new mongoose.Types.ObjectId(userId);

    // First, check if the event exists and is owned by the user
    const eventCheck = await Events.findOne({
      _id: eventId
    });

    if (!eventCheck) {
      return res.status(404).json({
        success: false,
        message: "Event not found"
      });
    }

    if (eventCheck.user.toString() !== userObjectId.toString()) {
      return res.status(403).json({
        success: false,
        message: "Unauthorized to access this event"
      });
    }

    // Get current date info for statistics
    const currentDate = new Date();
    const startOfWeek = new Date(currentDate);
    startOfWeek.setDate(currentDate.getDate() - currentDate.getDay()); // Start from Sunday
    startOfWeek.setHours(0, 0, 0, 0);

    const startOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
    startOfMonth.setHours(0, 0, 0, 0);

    // Get the number of days in current month
    const lastDayOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).getDate();

    // Aggregation pipeline for detailed booking statistics
    const bookingStats = await Bookings.aggregate([
      {
        $match: {
          event: eventId
        }
      },
      {
        $lookup: {
          from: "users",
          localField: "user",
          foreignField: "_id",
          as: "userDetails"
        }
      },
      {
        $unwind: {
          path: "$userDetails",
          preserveNullAndEmptyArrays: true
        }
      },
      {
        $facet: {
          // Total bookings count
          "totalBookings": [
            { $count: "count" }
          ],

          // Weekly booking statistics (last 7 days)
          "weeklyStats": [
            {
              $match: {
                createdAt: { $gte: startOfWeek }
              }
            },
            {
              $group: {
                _id: {
                  $dayOfWeek: "$createdAt"
                },
                count: { $sum: 1 },
                attendees: { $sum: { $toInt: "$noOfAttendee" } }
              }
            },
            {
              $sort: { _id: 1 }
            }
          ],

          // Monthly booking statistics
          "monthlyStats": [
            {
              $match: {
                createdAt: { $gte: startOfMonth }
              }
            },
            {
              $group: {
                _id: {
                  $dayOfMonth: "$createdAt"
                },
                count: { $sum: 1 },
                attendees: { $sum: { $toInt: "$noOfAttendee" } }
              }
            },
            {
              $sort: { _id: 1 }
            }
          ],

          // Detailed booking information
          "bookings": [
            {
              $project: {
                _id: 1,
                user: "$userDetails._id",
                userName: "$userDetails.name",
                email: "$userDetails.email",
                phoneNumber: "$userDetails.phoneNumber",
                ticketId: "$paymentId",
                noOfAttendees: "$noOfAttendee",
                ticketDate: "$createdAt",
                amountPaid: "$amountPaid"
              }
            },
            {
              $sort: { createdAt: -1 }
            }
          ]
        }
      }
    ]);

    // Extract the data
    const stats = bookingStats[0];
    const totalBookings = stats.totalBookings.length > 0 ? stats.totalBookings[0].count : 0;

    // Process weekly stats to ensure all 7 days are represented (Sunday=1 to Saturday=7)
    const weeklyBookings = Array(7).fill(0);
    stats.weeklyStats.forEach(day => {
      // $dayOfWeek returns 1 for Sunday, 2 for Monday, etc.
      const index = day._id - 1; // Convert to 0-based index
      weeklyBookings[index] = day.count;
    });

    // Process monthly stats to ensure all days of the month are represented
    const monthlyBookings = Array(lastDayOfMonth).fill(0);
    stats.monthlyStats.forEach(day => {
      const index = day._id - 1; // Convert to 0-based index
      monthlyBookings[index] = day.count;
    });

    return res.status(200).json({
      success: true,
      data: {
        totalBookings,
        weeklyStats: weeklyBookings,
        monthlyStats: monthlyBookings,
        bookings: stats.bookings
      }
    });

  } catch (error) {
    console.error("Error in getEventInsight:", error);
    return res.status(500).json({
      success: false,
      message: "Server Error",
      error: error.message
    });
  }
};

export const getEventsDistanceForUser = async (req, res) => {
  try {
    const userId = req.user.id;

    const user = await User.findById(userId).lean();
    if (!user || !user.location || !user.location.coordinates) {
      return res.status(400).json({ message: "User location not found." });
    }

    const userLat = parseFloat(user.location.coordinates.lat);
    const userLng = parseFloat(user.location.coordinates.lng);

    const events = await Events.find({ approved: true }).lean();

    const eventsWithDistance = events.map((event) => {
  const eventCoords = event.geoCoordinates?.coordinates;
  if (!eventCoords || eventCoords.length !== 2) {
    return { ...event, distanceInKm: null };
  }

  const eventLat = parseFloat(eventCoords[1]); // 🟢 Corrected: [lng, lat]
  const eventLng = parseFloat(eventCoords[0]);

  const distance = calculateDistanceInKm(userLat, userLng, eventLat, eventLng);

  return {
    ...event,
    distanceInKm: parseFloat(distance.toFixed(3)), // Keep 3 digits for precision
  };
});

    res.json(eventsWithDistance);
  } catch (err) {
    console.error("Error getting events with distance:", err);
    res.status(500).json({ message: "Server error" });
  }
};

