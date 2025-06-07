import express from "express";
import {
  likeEvent,
  getLikeCount,
  hasUserLiked,
  getLikedEvents,
} from "../controllers/like-controller.js";
import authMiddleware from "../middleware/authMiddleware.js";

const likeRouter = express.Router();

likeRouter.post("/:eventId", authMiddleware, likeEvent);
likeRouter.get("/:eventId/count", getLikeCount);
likeRouter.get("/:eventId/status", authMiddleware, hasUserLiked);
likeRouter.get("/user", authMiddleware, getLikedEvents);

export default likeRouter;
