import nodemailer from "nodemailer";

export const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 465,
  secure: true,
  auth: {
    user: process.env.GMAIL_MAIL,
    pass: process.env.GMAIL_APP_PASSWORD,
  },
});

export const sendEmail = async (mailOptions) => {
  try {
    const info = await transporter.sendMail(mailOptions);
    // Optionally log info.response for debugging: console.log("Email sent:", info.response);
    return { success: true, message: "Message sent successfully!" };
  } catch (error) {
    console.error("Error sending email:", error);
    throw new Error("Failed to send message. Please try again later.");
  }
};
