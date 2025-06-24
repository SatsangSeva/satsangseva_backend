import express from "express";
import {
  addAdmin,
  addBlog,
  adminLogin,
  adminModifyUser,
  adminUpdateBasicUserInfo,
  adminUpdateEvent,
  deleteBlog,
  getAdminById,
  getAdmins,
  getBlogById,
  getBlogs,
  getCount,
  resetPassword,
  sendWhatsAppOtp,
  sendNotificationToAllUsers,
  verifyWhatsAppOtp,
} from "../controllers/admin-controller.js";
import {
  approveEventById,
  getPendingEvents,
  rejectEventById,
} from "../controllers/event-controller.js";
import adminAuthMiddleware from '../middleware/adminAuthMiddleware.js'

const adminRouter = express.Router();

adminRouter.post("/signup", addAdmin);
adminRouter.post("/login", adminLogin);
// adminRouter.get("/", getAdmins);
// adminRouter.get("/:id", getAdminById);
adminRouter.get("/event/pending", getPendingEvents);
adminRouter.put("/approve/:id", approveEventById);
adminRouter.put("/reject/:id", rejectEventById);

adminRouter.post("/verifysend/:id", sendWhatsAppOtp);
adminRouter.get("/verifycheck", verifyWhatsAppOtp);
adminRouter.post("/forgetpassword/:id", resetPassword);

adminRouter.put("/user/basic/:id", adminAuthMiddleware, adminUpdateBasicUserInfo);
adminRouter.put("/user/modify/:id", adminAuthMiddleware, adminModifyUser);
adminRouter.put("/event/:id", adminAuthMiddleware, adminUpdateEvent);

adminRouter.post("/blog", addBlog);
adminRouter.get("/blog", getBlogs);
adminRouter.get("/blog/:id", getBlogById);
adminRouter.delete("/blog/:id", deleteBlog);

adminRouter.get("/analytics", getCount);
adminRouter.post('/send-notification' , sendNotificationToAllUsers)
export default adminRouter;
