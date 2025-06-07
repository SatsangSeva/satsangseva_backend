import express from "express";
import {
  addEvent,
  getEventById,
  deleteEvent,
  getUpComingEvents,
  getPastEvents,
  updateEvent,
  getLatestEvents,
  getLiveEvents,
  getAllEvents,
  searchEvents,
  getNearByEvents,
  getEventsByKM,
  suggestEventNames,
  getEventInsight,
  getAllApprovedEvents,
  getPendingEvents,
  getEventsDistanceForUser,
} from "../controllers/event-controller.js";
import authMiddleware from "../middleware/authMiddleware.js";
import jwtMiddleware from "../middleware/jwtMiddleware.js";
const eventsRouter = express.Router();

eventsRouter.use("/search",jwtMiddleware, searchEvents);
eventsRouter.use(authMiddleware);
eventsRouter.get("/insight/:id", getEventInsight);
eventsRouter.get("/", getUpComingEvents);
eventsRouter.get("/past", getPastEvents);
eventsRouter.get("/latest", getLatestEvents);
eventsRouter.get("/live", getLiveEvents);
eventsRouter.use("/nearby0", getNearByEvents);
eventsRouter.use("/nearby", getEventsByKM);
eventsRouter.use("/suggestions", suggestEventNames);
eventsRouter.get("/getAll", getAllApprovedEvents);
eventsRouter.get("/pending", getPendingEvents);
eventsRouter.get("/all", getAllEvents);
eventsRouter.post("/", addEvent);
eventsRouter.post('/event-distance' , getEventsDistanceForUser)
eventsRouter.put("/:id", updateEvent);
eventsRouter.delete("/:id", deleteEvent);
eventsRouter.get("/:id", getEventById);
export default eventsRouter;
