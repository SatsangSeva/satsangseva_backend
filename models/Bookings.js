import mongoose from "mongoose";
import { cascadeDeleteHelpers } from "../utils/cascadeDelete.js";

const bookingSchema = new mongoose.Schema(
  {
    event: {
      type: mongoose.Types.ObjectId,
      ref: "Event",
      required: true,
    },
    attendeeContact: {
      type: String,
      required: true,
    },
    noOfAttendee: {
      type: String,
      required: true,
    },
    amountPaid: {
      type: String,
      required: true,
    },
    paymentId: {
      type: String,
      default: null,
    },
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

// Use findOneAndDelete middleware
bookingSchema.pre("findOneAndDelete", async function (next) {
  try {
    const bookingDoc = await this.model.findOne(this.getFilter());
    if (!bookingDoc) return next();

    const attendeeCount = parseInt(bookingDoc.noOfAttendee) || 0;

    // Update references
    await cascadeDeleteHelpers.removeBookingReferences(
      bookingDoc._id,
      bookingDoc.user,
      bookingDoc.event,
      attendeeCount
    );

    next();
  } catch (error) {
    next(error);
  }
});

// Handle deleteMany
bookingSchema.pre("deleteMany", async function (next) {
  try {
    const bookings = await this.model.find(this.getFilter());

    // Process each booking
    for (const booking of bookings) {
      const attendeeCount = parseInt(booking.noOfAttendee) || 0;

      await cascadeDeleteHelpers.removeBookingReferences(
        booking._id,
        booking.user,
        booking.event,
        attendeeCount
      );
    }

    next();
  } catch (error) {
    next(error);
  }
});

// Do not remove its for future review
// bookingSchema.post("save", async function () {
//   try {
//     const User = mongoose.model("User");
//     const Event = mongoose.model("Event");
//     const attendeeCount = parseInt(this.noOfAttendee) || 0;

//     // Update user's bookings
//     await User.findByIdAndUpdate(
//       this.user,
//       { $addToSet: { bookings: this._id } }
//     );

//     // Update event's bookings and attendee count
//     await Event.findByIdAndUpdate(
//       this.event,
//       {
//         $addToSet: { bookings: this._id },
//         $inc: { currentNoOfAttendees: attendeeCount }
//       }
//     );
//   } catch (error) {
//     console.error(`Error updating booking references: ${error.message}`);
//   }
// });

export default mongoose.model("Booking", bookingSchema);
