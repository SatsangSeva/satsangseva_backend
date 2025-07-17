import express from "express";
import {
  deleteUser,
  getAllUsers,
  getBookingsOfUser,
  getEventsOfUser,
  getUserById,
  login,
  modifyUser,
  submitDoc,
  verifyRegistrationOtp,
  sendRegistrationOtp,
  sendPasswordResetOtp,
  verifyAndResetPassword,
  sendGoogleUpdateOtp,
  verifyGoogleUpdateOtp,
  updateBasicUserInfo,
  getuserInsight,
  verifyFirebaseToken,
  changePassword,
  getUsersByType,
  updateUserCoordinates,
} from "../controllers/user-controller.js";

import authMiddleware from "../middleware/authMiddleware.js";

const userRouter = express.Router();

userRouter.post("/signup/sendotp", sendRegistrationOtp);
userRouter.post("/signup/verifyotp", verifyRegistrationOtp);
userRouter.get("/", getAllUsers);
userRouter.get("/type/:id", authMiddleware, getUsersByType);
userRouter.get("/insight", authMiddleware, getuserInsight);
// userRouter.put("/:id", updateUser);
userRouter.get("/:id",authMiddleware, getUserById);
userRouter.put("/basic-update", updateBasicUserInfo);
userRouter.post("/google/send-update-otp", sendGoogleUpdateOtp);
userRouter.post("/google/verify-update-otp", verifyGoogleUpdateOtp);
userRouter.post("/password-reset/send-otp", sendPasswordResetOtp);
userRouter.post("/password-reset/verify", verifyAndResetPassword);
userRouter.post("/password/change", authMiddleware, changePassword);

userRouter.put("/update/:id", modifyUser);
userRouter.post("/verify", authMiddleware, submitDoc);
userRouter.delete("/:id", deleteUser);
userRouter.post("/login", login);
userRouter.get("/bookings/:id", getBookingsOfUser);
userRouter.get("/events/:id", getEventsOfUser);
userRouter.put('/update-cordinates' ,authMiddleware, updateUserCoordinates)

// Endpoint to verify Firebase token and return JWT
userRouter.post("/auth/firebase", verifyFirebaseToken);

export default userRouter;
