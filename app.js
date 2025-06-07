import express from "express";
import mongoose from "mongoose";
import dotenv from "dotenv";
import cors from "cors";
import morgan from "morgan";
import path from "path";
import { fileURLToPath } from "url";

// Route imports
import userRouter from "./routes/user-routes.js";
import eventsRouter from "./routes/events-routes.js";
import bookingsRouter from "./routes/booking-routes.js";
import adminRouter from "./routes/admin-routes.js";
import likeRouter from "./routes/like-route.js";
import subscriptionRouter from "./routes/subscription-routes.js";

// Controller imports
import { checkUserExists } from "./controllers/user-controller.js";

// Utility imports
import "./config/firebaseConfig.js";
import { sendEmail } from "./utils/emailConfig.js";

// Constants
const __dirname = path.dirname(fileURLToPath(import.meta.url));
// express configs
dotenv.config();
const app = express();

// Morgan custom tokens
morgan.token("os", (req) => {
  const userAgent = req.headers["user-agent"] || "";
  const osMatch = userAgent.match(/\(([^)]+)\)/);
  if (osMatch && osMatch[1]) {
    const osInfo = osMatch[1];
    return osInfo.includes(";") ? osInfo.split(";")[0].trim() : osInfo.trim();
  }
  return "Unknown OS";
});

morgan.token("time", () => new Date().toLocaleString());
app.use(
  morgan(
    ":time :method :url :status :res[content-length] - :response-time ms :os"
  )
);

// Middleware
// app.use(morgan("tiny"));
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));


// Routes
app.use("/user", userRouter);
app.use("/admin", adminRouter);
app.use("/subscription", subscriptionRouter);
app.use("/events", eventsRouter);
app.use("/event/like", likeRouter);
app.use("/booking", bookingsRouter);
app.get("/checkuser", checkUserExists);
// app.use("/notifications", notificationRouter);

// Email route
app.post("/api/send-email", async (req, res) => {
  const { firstName, lastName, email, phone, message } = req.body;

  // Validate required fields
  if (!firstName || !lastName || !email || !message) {
    return res.status(400).json({
      success: false,
      message: "Please provide firstName, lastName, email, and message.",
    });
  }

  const mailOptions = {
    from: email,
    // from: "info@satsangseva.com",
    to: "info@satsangseva.com",
    cc: email,
    subject: `Contact Us Message from ${firstName} ${lastName}`,
    text: `Name: ${firstName} ${lastName}\nEmail: ${email}\nPhone: ${
      phone || "N/A"
    }\nMessage: ${message}`,
  };

  try {
    const result = await sendEmail(mailOptions);
    return res.status(200).json(result);
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});
app.post("/send-whatsapp", async (req, res) => {
  const { to, message } = req.body;

  try {
    await client.messages.create({
      from: `whatsapp:${whatsappNumber}`,
      to: `whatsapp:${to}`,
      body: message,
    });
    res.status(200).send("WhatsApp message sent successfully.");
  } catch (error) {
    res.status(500).send("Failed to send WhatsApp message.");
  }
});
app.get("/", (req, res) => {
  res.send("Server running");
});


mongoose.connect(process.env.MONGODB_URL)
  .then(() =>
    app.listen(process.env.PORT || 8000, () =>
      console.log(
        `Connected To Database And Server is running on http://localhost:${
          process.env.PORT || 8000
        } `
      )
    )
  )
  .catch((e) => console.log(e));

export default app;
