import jwt from "jsonwebtoken";

const authMiddleware = (req, res, next) => {
  const header = req.headers.authorization;
  if (!header)
    return res
      .status(401)
      .json({ success: false, message: "Access denied, no token provided" });
  const token = header.split(" ")[1];

  if (!token) {
    return res
      .status(401)
      .json({ success: false, message: "Access denied, no token provided" });
  }

  try {
    const decoded = jwt.verify(token, process.env.SECRET_KEY);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(400).json({ success: false, message: "Invalid token" });
  }
};

export default authMiddleware;
