import mongoose from "mongoose";
import Booking from "../models/Bookings.js";
import Event from "../models/Events.js";
import User from "../models/User.js";
import { writeFile } from 'fs/promises';
import path from "path";
import dotenv from "dotenv";
import { isNonFatalWaError, sendTemplateMessage, uploadMedia } from "../utils/whatsappService.js";
import { generateTicketImage } from "../utils/ticketGenerator.js";
import { sendNotificationToDevice } from "../utils/pushNotification.js";
dotenv.config();

// POST /bookings - Create new booking
export const newBooking = async (req, res) => {

  const session = await mongoose.startSession();
  let booking = null;
  try {
    const {
      event,
      attendeeContact,
      noOfAttendee,
      amountPaid,
      paymentId,
      user,
    } = req.body;

    // Validate required fields
    if (
      !event ||
      !attendeeContact ||
      !noOfAttendee ||
      !user ||
      isNaN(Number(noOfAttendee))
    ) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields",
        requiredFields: ["event", "attendeeContact", "noOfAttendee", "user"],
      });
    }

    // Fetch event and user in parallel
    const [existingEvent, existingUser] = await Promise.all([
      Event.findById(event),
      User.findById(user),
    ]);

    if (!existingEvent) {
      return res
        .status(404)
        .json({ success: false, message: "Event not found with given ID" });
    }
    if (!existingUser) {
      return res
        .status(404)
        .json({ success: false, message: "User not found with given ID" });
    }
    if (!existingEvent.approved) {
      return res.status(403).json({
        success: false,
        message:
          "This event is not approved yet. Please wait for event approval.",
      });
    }
    if (
      Number(existingEvent.maxAttendees) !== Infinity &&
      Number(existingEvent.maxAttendees) <
      Number(existingEvent.currentNoOfAttendees) + Number(noOfAttendee)
    ) {
      return res.status(400).json({
        success: false,
        message: `Event capacity exceeded. Maximum: ${existingEvent.maxAttendees}, Current: ${existingEvent.currentNoOfAttendees}`,
      });
    }

    // Start transaction
    session.startTransaction();

    // Create booking document
    booking = new Booking({
      event,
      attendeeContact,
      noOfAttendee: Number(noOfAttendee),
      amountPaid: Number(amountPaid || 0),
      paymentId,
      user,
    });
    await booking.save({ session });

    // Update related user and event documents
    existingUser.bookings.push(booking._id);
    existingEvent.bookings.push(booking._id);
    existingEvent.currentNoOfAttendees += Number(noOfAttendee);
    await Promise.all([
      existingUser.save({ session }),
      existingEvent.save({ session }),
    ]);

    const logoPath = path.join(process.cwd(), "public", "images", "logo.png");

    const imgBuffer = await generateTicketImage({
      event: {
        title: existingEvent.eventName,
        host: existingEvent.organizerName,
        venue: `${existingEvent.address?.address}, ${existingEvent.address?.landmark}, ${existingEvent.address?.city}, ${existingEvent.address?.state}, ${existingEvent.address?.postalCode}, ${existingEvent.address?.country}`,
        date: existingEvent.startDate,
        time: existingEvent.startTime,
        tickets: booking.noOfAttendee,
        amount: booking.amountPaid
      },
      booking: { id: booking._id.toString() },
      logo: logoPath,
      posterUrl: existingEvent.eventPosters[0]
    });

    // const outPath = path.resolve('debug-ticket.png');
    // await writeFile(outPath, imgBuffer);

    const mediaId = await uploadMedia(imgBuffer, {
      filename: `ticket-${booking._id}.png`,
      type: 'image/png'
    });

    try {
      const vars = [
        existingUser.name,
        booking._id.toString(),
        existingEvent.eventName,
        existingEvent.organizerName,
        `${existingEvent.address.address}, ${existingEvent.address.landmark}, ${existingEvent.address.city}, ${existingEvent.address.state}, ${existingEvent.address.postalCode}, ${existingEvent.address.country}`,
        `${existingEvent.startDate} | ${existingEvent.startTime}`,
        booking.noOfAttendee.toString(),
        booking.amountPaid.toString(),
        existingEvent.locationLink,
        `${process.env.FRONTEND_URL}event/${existingEvent._id}`,
      ];

      await sendTemplateMessage(
        attendeeContact,
        'event_booking_en',
        'en',
        mediaId,
        vars
      );
    } catch (waErr) {
      if (!isNonFatalWaError(waErr)) {
        await session.abortTransaction();
        return res.status(502).json({
          success: false,
          message:
            "WhatsApp send failed",
          error: waErr.response?.data?.error
        });
      }
      // swallow and continue
    }

     try {
      const userFcmTokens = existingUser.fcmToken || [];
      const userDeviceToken = userFcmTokens.length > 0 ? userFcmTokens[userFcmTokens.length - 1] : null;

      if (userDeviceToken) {
        await sendNotificationToDevice({
          token: userDeviceToken,
          title: "Booking Confirmed",
          body: `Your booking for ${existingEvent.eventName} is confirmed.`,
          data: { bookingId: booking._id.toString(), eventId: existingEvent._id.toString() },
        });
      }
    } catch (notificationError) {
      console.error('Notification send error:', notificationError.message);
      // Do not fail the transaction if notification fails
    }
    
    await session.commitTransaction();

    return res.status(201).json({
      success: true,
      message: "Booking created successfully",
      data: { booking },
    });
  } catch (error) {
    if (session.inTransaction()) await session.abortTransaction();
    return res.status(500).json({
      success: false,
      message: "An error occurred while processing the booking",
      error: error.message,
      errorDetails:
        process.env.NODE_ENV === "development" ? error.stack : undefined,
    });
  } finally {
    await session.endSession();
  }
};

// GET /bookings/:id - Get booking by ID
export const getBookingById = async (req, res) => {
  const { id } = req.params;
  try {
    const booking = await Booking.findById(id).populate("event");
    if (!booking) {
      return res.status(404).json({
        success: false,
        message: "Booking not found",
      });
    }
    return res.status(200).json({ success: true, booking });
  } catch (error) {
    console.error("Error retrieving booking:", error);
    return res.status(500).json({
      success: false,
      message: "Error retrieving booking",
      error: error.message,
    });
  }
};

// GET /events/:id/bookings - Get all bookings of an event
export const getBookingsOfEvent = async (req, res) => {
  const { id: eventId } = req.params;
  try {
    const bookings = await Booking.find({ event: eventId }).populate(
      "user",
      "name"
    );
    return res.status(200).json({ success: true, bookings });
  } catch (error) {
    console.error("Error retrieving bookings for event:", error);
    return res.status(500).json({
      success: false,
      message: "Error retrieving bookings for event",
      error: error.message,
    });
  }
};

export const getBookedEventsByUser = async (req, res) => {
  const { userId } = req.params;
  try {
    const bookings = await Booking.find({ user: userId }).populate({
      path: "event",
      select: "-bookings", // customize the fields as needed
    });

    if (!bookings || bookings.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No bookings found for the given user",
      });
    }

    let events = bookings.map((booking) => booking.event);
    events = Array.from(
      new Map(events.map((event) => [event._id?.toString(), event])).values()
    );

    return res.status(200).json({ success: true, events });
  } catch (error) {
    console.error("Error fetching booked events by user:", error);
    return res.status(500).json({
      success: false,
      message: "Error fetching booked events",
      error: error.message,
    });
  }
};

// DELETE /bookings/:id - Delete a booking
// export const deleteBooking = async (req, res) => {
//   const { id } = req.params;
//   try {
//     const booking = await Booking.findByIdAndRemove(id)
//       .populate("user")
//       .populate("event");

//     if (!booking) {
//       return res.status(404).json({
//         success: false,
//         message: "Booking not found",
//       });
//     }

//     const session = await mongoose.startSession();
//     session.startTransaction();

//     try {
//       if (booking.user && booking.user.bookings) {
//         booking.user.bookings.pull(booking._id);
//         await booking.user.save({ session });
//       }
//       if (booking.event && booking.event.bookings) {
//         booking.event.bookings.pull(booking._id);
//         await booking.event.save({ session });
//       }
//       await session.commitTransaction();
//       session.endSession();
//       return res.status(200).json({
//         success: true,
//         message: "Booking deleted successfully",
//       });
//     } catch (error) {
//       await session.abortTransaction();
//       session.endSession();
//       return res.status(500).json({
//         success: false,
//         message: "Error updating related data after deletion",
//         error: error.message,
//       });
//     }
//   } catch (error) {
//     console.error("Error deleting booking:", error);
//     return res.status(500).json({
//       success: false,
//       message: "Internal Server Error",
//       error: error.message,
//     });
//   }
// };
export const deleteBooking = async (req, res) => {
  const { id } = req.params;

  try {
    const booking = await Booking.findById(id);

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: "Booking not found",
      });
    }

    // Use findOneAndDelete to trigger cascade middleware
    await Booking.findOneAndDelete({ _id: id });

    return res.status(200).json({
      success: true,
      message: "Booking deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting booking:", error);
    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
      error: error.message,
    });
  }
};
