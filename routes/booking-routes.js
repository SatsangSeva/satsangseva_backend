import express from "express";
import {
  deleteBooking,
  getBookedEventsByUser,
  getBookingById,
  getBookingsOfEvent,
  newBooking,
} from "../controllers/booking-controller.js";

const bookingsRouter = express.Router();

bookingsRouter.post("/", newBooking);
bookingsRouter.get("/:id", getBookingById);
bookingsRouter.get("/user/:userId", getBookedEventsByUser);
bookingsRouter.get("/event/:id", getBookingsOfEvent);
bookingsRouter.delete("/:id", deleteBooking);
export default bookingsRouter;
