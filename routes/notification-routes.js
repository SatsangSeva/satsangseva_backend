import express from "express";
import {
  sendToDevice,
  sendToDevices,
  sendToTopic,
  subscribeTopic,
  unsubscribeTopic,
} from "../controllers/notification-controller.js";

const notificationRouter = express.Router();

notificationRouter.post("/send-to-device", sendToDevice);
notificationRouter.post("/send-to-devices", sendToDevices);
notificationRouter.post("/send-to-topic", sendToTopic);
notificationRouter.post("/subscribe-topic", subscribeTopic);
notificationRouter.post("/unsubscribe-topic", unsubscribeTopic);

export default notificationRouter;
