import mongoose from "mongoose";
import { cascadeDeleteHelpers } from "../utils/cascadeDelete.js";

const likeSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    eventId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Event",
      required: true,
    },
  },
  { timestamps: true }
);



// Use findOneAndDelete middleware
likeSchema.pre("findOneAndDelete", async function (next) {
  try {
    const likeDoc = await this.model.findOne(this.getFilter());
    if (!likeDoc) return next();

    // Decrement like count on the event
    await cascadeDeleteHelpers.updateEventLikeCount(likeDoc.eventId, false);

    next();
  } catch (error) {
    next(error);
  }
});

// Handle deleteMany
likeSchema.pre("deleteMany", async function (next) {
  try {
    const likes = await this.model.find(this.getFilter());

    // Group likes by event for better performance
    const eventCounts = {};
    likes.forEach(like => {
      const eventId = like.eventId.toString();
      eventCounts[eventId] = (eventCounts[eventId] || 0) + 1;
    });

    // Update each event's like count
    const Event = mongoose.model("Event");
    for (const [eventId, count] of Object.entries(eventCounts)) {
      await Event.findByIdAndUpdate(
        eventId,
        { $inc: { likeCount: -count } }
      );
    }

    next();
  } catch (error) {
    next(error);
  }
});


// Do not remove its for future review
// likeSchema.post("save", async function () {
//   try {
//     await cascadeDeleteHelpers.updateEventLikeCount(this.eventId, true);
//   } catch (error) {
//     console.error(`Error updating like count: ${error.message}`);
//   }
// });



likeSchema.index({ userId: 1, eventId: 1 }, { unique: true });

export default mongoose.model("Like", likeSchema);
