import jwt from "jsonwebtoken";

const jwtMiddleware = (req, res, next) => {
  const header = req.headers.authorization;
  // if (!header)
  //   return res
  //     .status(401)
  //     .json({ success: false, message: "Access denied, no token provided" });

  try {
    if (header) {
      const token = header.split(" ")[1];
      if (token) {
        const decoded = jwt.verify(token, process.env.SECRET_KEY);
        req.user = decoded;
        // console.log(`decoded`, decoded);
      }
    }
    next();
  } catch (error) {
    return res.status(400).json({ success: false, message: "Invalid token" });
  }
};

export default jwtMiddleware;
