import Like from "../models/Like.js";
import Event from "../models/Events.js";
import mongoose from "mongoose";

// Done
export const likeEvent = async (req, res) => {
  const { eventId } = req.params;
  const userId = req.user.id;

  try {
    const event = await Event.findById(eventId);
    if (!event) {
      return res
        .status(404)
        .json({ success: false, message: "Event not found" });
    }

    const existingLike = await Like.findOne({ userId, eventId });

    if (existingLike) {
      // await Like.findByIdAndDelete(existingLike._id);
      await Like.findOneAndDelete({ _id: existingLike._id });
      event.likeCount = Math.max(0, event.likeCount - 1);
      await event.save();

      return res.status(200).json({
        success: true,
        message: "Event unliked",
        likeCount: event.likeCount,
      });
    }

    await Like.create({ userId, eventId });
    event.likeCount += 1;
    await event.save();

    return res.status(201).json({
      success: true,
      message: "Event liked",
      likeCount: event.likeCount,
    });
  } catch (error) {
    console.error("Error in likeEvent:", error);
    return res
      .status(500)
      .json({ success: false, message: "Internal server error" });
  }
};

// Done
export const getLikeCount = async (req, res) => {
  const { eventId } = req.params;

  try {
    const event = await Event.findById(eventId).select("likeCount");
    if (!event) {
      return res
        .status(404)
        .json({ success: false, message: "Event not found" });
    }

    return res.status(200).json({ success: true, likeCount: event.likeCount });
  } catch (error) {
    console.error("Error in getLikeCount:", error);
    return res
      .status(500)
      .json({ success: false, message: "Internal server error" });
  }
};

// Done
export const hasUserLiked = async (req, res) => {
  const { eventId } = req.params;
  const userId = req.user.id;

  try {
    const existingLike = await Like.exists({ userId, eventId });
    return res.status(200).json({ success: true, liked: !!existingLike });
  } catch (error) {
    console.error("Error in hasUserLiked:", error);
    return res
      .status(500)
      .json({ success: false, message: "Internal server error" });
  }
};

// Done
export const getLikedEvents = async (req, res) => {
  const userId = req.user.id;
  try {
    const likedEvents = await Like.aggregate([
      { $match: { userId: mongoose.Types.ObjectId(userId) } },
      {
        $lookup: {
          from: "events",
          localField: "eventId",
          foreignField: "_id",
          as: "event",
        },
      },
      { $unwind: "$event" },
      { $replaceRoot: { newRoot: "$event" } },
    ]);
    return res.status(200).json({
      success: true,
      likedEvents: likedEvents,
    });
  } catch (error) {
    console.error("Error in getLikedEvents:", error);
    return res
      .status(500)
      .json({ success: false, message: "Internal server error" });
  }
};
