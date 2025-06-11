import mongoose from "mongoose";
import { cascadeDeleteHelpers } from "../utils/cascadeDelete.js";

const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
const eventAgendaItemSchema = new mongoose.Schema({
  subEvent: {
    type: Number,
    required: true,
    min: 1,
  },
  title: {
    type: String,
    required: true,
  },
  description: {
    type: String,
    required: true,
  },
},{_id:false});
const locationSchema = new mongoose.Schema({
  address: { type: String, required: true },
  address2: { type: String, default: null },
  landmark: { type: String, default: null },
  city: { type: String, required: true },
  state: { type: String, required: true },
  postalCode: { type: String, required: true },
  country: { type: String, required: true },
});
const eventSchema = new mongoose.Schema(
  {
    isPrivate: {
      type: Boolean,
      default: false,
    },
    eventName: {
      type: String,
      text: true,
      required: true,
    },
    eventCategory: {
      type: [String],
      required: true,
      validate: {
        validator: function (categories) {
          return (
            Array.isArray(categories) &&
            categories.length > 0 &&
            categories.every(
              (cat) => typeof cat === "string" && cat.trim() !== ""
            )
          );
        },
        message: "Event category must be a non-empty array of strings",
      },
    },
    eventPosters: {
      type: [{ type: String }],
      required: true,
    },
    eventDesc: {
      type: String,
      required: true,
    },
    eventPrice: {
      type: String,
      required: true,
    },
    eventLang: {
      type: String,
      required: true,
    },
    noOfAttendees: {
      type: String,
      required: true,
    },
    maxAttendees: { type: String, default: Infinity },
    currentNoOfAttendees: { type: String, default: 0 },
    eventAgenda: {
      type: [eventAgendaItemSchema],
      required: true,
      validate: {
        validator: function (agenda) {
          return agenda.length > 0;
        },
        message: "Event must have at least one agenda item",
      },
    },
    artistOrOratorName: {
      type: String,
      required: true,
    },
    organizerName: {
      type: String,
      required: true,
    },
    organizerWhatsapp: {
      type: String,
      required: true,
    },
    eventLink: {
      type: String,
      // required: true,
    },
    bookingLink: {
      type: String,
    },
    locationLink: {
      type: String,
      required: true,
    },
    address: {
      type: locationSchema,
      required: true,
    },
    startDate: {
      type: Date,
      required: true,
    },
    endDate: {
      type: Date,
      required: true,
    },
    startTime: {
      type: String,
      required: true,
      validate: {
        validator: function (value) {
          return timeRegex.test(value);
        },
        message: "Start time must be in HH:MM (24-hour) format",
      },
    },
    endTime: {
      type: String,
      required: true,
      validate: {
        validator: function (value) {
          return timeRegex.test(value);
        },
        message: "End time must be in HH:MM (24-hour) format",
      },
    },
    approved: {
      type: Boolean,
      default: false,
    },
    bookings: [{ type: mongoose.Types.ObjectId, ref: "Booking" }],
    likeCount: { type: Number, default: 0 },
    user: {
      type: mongoose.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  {
    timestamps: true,
  }
);


eventSchema.pre("findOneAndDelete", async function (next) {
  try {
    const eventDoc = await this.model.findOne(this.getFilter());
    if (!eventDoc) return next();

    const eventId = eventDoc._id;

    // Cascade delete related documents
    await cascadeDeleteHelpers.deleteEventBookings(eventId);
    await cascadeDeleteHelpers.deleteEventLikes(eventId);
    await cascadeDeleteHelpers.removeEventFromUser(eventId);

    next();
  } catch (error) {
    next(error);
  }
});

// Handle deleteMany
eventSchema.pre("deleteMany", async function (next) {
  try {
    const events = await this.model.find(this.getFilter());
    const eventIds = events.map(event => event._id);

    // Process each event
    for (const eventId of eventIds) {
      await cascadeDeleteHelpers.deleteEventBookings(eventId);
      await cascadeDeleteHelpers.deleteEventLikes(eventId);
      await cascadeDeleteHelpers.removeEventFromUser(eventId);
    }

    next();
  } catch (error) {
    next(error);
  }
});

// Do not remove its for future review
// eventSchema.post("save", async function() {
//   try {
//     const User = mongoose.model("User");
//     await User.findByIdAndUpdate(
//       this.user,
//       { $addToSet: { events: this._id } }
//     );
//   } catch (error) {
//     console.error(`Error updating user events: ${error.message}`);
//   }
// });
eventSchema.index({ geoCoordinates: "2dsphere" });
eventSchema.index({ eventName: "text" });
eventSchema.index({ startDate: 1, endDate: 1 });
eventSchema.index({ approved: 1 });
export default mongoose.model("Event", eventSchema);
