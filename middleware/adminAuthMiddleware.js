import jwt from "jsonwebtoken";
import Admin from "../models/Admin.js";


const adminAuthMiddleware = async (req, res, next) => {
  const header = req.headers.authorization;
  if (!header) {
    return res.status(401).json({
      success: false,
      message: "Access denied, no token provided",
    });
  }

  const token = header.split(" ")[1];
  if (!token) {
    return res.status(401).json({
      success: false,
      message: "Access denied, no token provided",
    });
  }

  try {
    const decoded = jwt.verify(token, process.env.SECRET_KEY);

    // Look up the admin using the ID from the token
    const admin = await Admin.findById(decoded.id);
    if (!admin || admin.designation !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Access denied, not an admin",
      });
    }

    // Attach the admin info to the request object
    req.admin = admin;
    next();
  } catch (error) {
    return res
      .status(400)
      .json({ success: false, message: "Invalid token" });
  }
};

export default adminAuthMiddleware;
