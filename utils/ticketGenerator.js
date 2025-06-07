// import os from "os";
// import fs from "fs";
// import path from "path";
// import PDFDocument from "pdfkit";

// export async function generateTicket(booking, event, user) {
//   // 1) Prepare file paths
//   const tmpDir = os.tmpdir();
//   const fileName = `ticket-${booking._id}.pdf`;
//   const tempFilePath = path.join(tmpDir, fileName);


//   if (!fs.existsSync(tmpDir)) {
//     await fs.promises.mkdir(tmpDir, { recursive: true });
//   }

//   // 2) Create the PDF
//   return new Promise((resolve, reject) => {
//     const doc = new PDFDocument({ size: "A4", margin: 40 });
//     const stream = fs.createWriteStream(tempFilePath);

//     doc.pipe(stream);

//     // --- Header with logo ---
    // const logoPath = path.join(process.cwd(), "public", "images", "logo.png");
//     if (fs.existsSync(logoPath)) {
//       doc.image(logoPath, { fit: [150, 150], align: "center" });
//       doc.moveDown(1);
//     }
//     doc
//       .font("Helvetica-Bold")
//       .fontSize(20)
//       .text("Event Ticket", { align: "center" })
//       .moveDown(1);

//     // --- Booking & User Details ---
//     doc
//       .font("Helvetica")
//       .fontSize(12)
//       .text(`Booking ID     : ${booking._id}`)
//       .text(`Event          : ${event.eventName}`)
//       .text(`User Name      : ${user.name}`)
//       .text(`Contact        : ${booking.attendeeContact}`)
//       .text(`Tickets        : ${booking.noOfAttendee}`)
//       .text(`Amount Paid    : ₹${booking.amountPaid}`)
//       .text(
//         `Date           : ${new Date(event.startDate).toLocaleDateString(
//           "en-IN"
//         )} ${new Date(event.startDate).toLocaleTimeString("en-IN")}`
//       )
//       .moveDown(2);

//     doc
//       .font("Helvetica-Oblique")
//       .fontSize(10)
//       .fillColor("#888")
//       .text("Thank you for booking with SatsangSeva.com", {
//         align: "center",
//       });

//     doc.end();

//     // 3) Resolve when the file is fully written
//     stream.on("finish", () => resolve(tempFilePath));
//     stream.on("error", (err) => reject(err));
//   });
// }

import { createCanvas, loadImage } from 'canvas';
import QRCode from 'qrcode';
import fetch from 'node-fetch';
globalThis.fetch = fetch;
/**
 * Generate an in-memory PNG ticket image.
 *
 * @param {Object}   opts
 * @param {Object}   opts.event       – { title, sponsor, host, venue, date, time, tickets, amount }
 * @param {Object}   opts.booking     – { id }
 * @param {string|Buffer} opts.logo   – Local file path or Buffer of your downloaded logo
 * @param {string}   opts.posterUrl   – Cloudinary URL of event poster
 * @returns {Promise<Buffer>}         – PNG buffer
 */
export const generateTicketImage = async ({
  event,
  booking,
  logo,
  posterUrl
}) => {
  const width   = 800;
  const headerH = 120;
  const detailH = 200;
  const footerY = headerH + detailH + 20;
  const margin  = 20;

  const canvas = createCanvas(width, footerY + 300);
  const ctx    = canvas.getContext('2d');

  // White background
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // — Draw local logo —
  // `logo` can be a filesystem path (e.g. './assets/logo.png') or a Buffer
  const logoImg = await loadImage(logo);
  const logoW   = 200;
  const logoH   = (logoImg.height / logoImg.width) * logoW;
  ctx.drawImage(logoImg, margin, margin, logoW, logoH);

  // — Generate & draw QR from booking.id —
  const qrBuffer = await QRCode.toBuffer(booking.id, {
    type:   'png',
    width:  150,
    margin: 1
  });
  const qrImg = await loadImage(qrBuffer);
  ctx.drawImage(qrImg, width - margin - 150, margin, 150, 150);

  // — Event details text —
  ctx.fillStyle = '#000';
  ctx.font      = '20px sans-serif';
  ctx.fillText('Event Details:', margin, headerH + 10);

  ctx.font = '16px sans-serif';
  [
    `Event: ${event.title}`,
    `Sponsor: ${event.sponsor}`,
    `Host: ${event.host}`,
    `Venue: ${event.venue}`,
    `Date: ${event.date}`,
    `Time: ${event.time}`,
    `Tickets: ${event.tickets}`,
    `Amount Paid: Rs. ${event.amount}`,
    `Booking ID: ${booking.id}`
  ].forEach((line, i) =>
    ctx.fillText(line, margin, headerH + 40 + i * 22)
  );

  // — Separator line —
  ctx.strokeStyle = '#ccc';
  ctx.lineWidth   = 1;
  ctx.beginPath();
  ctx.moveTo(margin, headerH + detailH);
  ctx.lineTo(width - margin, headerH + detailH);
  ctx.stroke();

  // — Draw Cloudinary poster (auto-fit width) —
  const poster = await loadImage(posterUrl);
  const boxW   = width - margin * 2;
  const scale  = boxW / poster.width;
  const boxH   = poster.height * scale;
  ctx.drawImage(poster, margin, footerY, boxW, boxH);

  return canvas.toBuffer('image/png');
};
