import express from "express";
import {
  getSubscribedUsers,
  getUserSubscribers,
  toggleSubscription,
  getCount,
  hasUserSubscribed,
} from "../controllers/subscription-controller.js";
import authMiddleware from "../middleware/authMiddleware.js";

const subscriptionRouter = express.Router();

subscriptionRouter.use(authMiddleware);
subscriptionRouter.post("/toggle/:userId", toggleSubscription);
subscriptionRouter.get("/status/:guestId", hasUserSubscribed);
subscriptionRouter.get("/subscriptions", getSubscribedUsers);
subscriptionRouter.get("/subscribers", getUserSubscribers);
subscriptionRouter.get("/count/:id", getCount);

export default subscriptionRouter;
