
// import { createCanvas, loadImage } from 'canvas';
// import QRCode from 'qrcode';
// import fetch from 'node-fetch';
// globalThis.fetch = fetch;
// /**
//  * Generate an in-memory PNG ticket image.
//  *
//  * @param {Object}   opts
//  * @param {Object}   opts.event       – { title, sponsor, host, venue, date, time, tickets, amount }
//  * @param {Object}   opts.booking     – { id }
//  * @param {string|Buffer} opts.logo   – Local file path or Buffer of your downloaded logo
//  * @param {string}   opts.posterUrl   – Cloudinary URL of event poster
//  * @returns {Promise<Buffer>}         – PNG buffer
//  */
// export const generateTicketImage = async ({
//   event,
//   booking,
//   logo,
//   posterUrl
// }) => {
//   const width   = 800;
//   const headerH = 120;
//   const detailH = 200;
//   const footerY = headerH + detailH + 20;
//   const margin  = 20;

//   const canvas = createCanvas(width, footerY + 300);
//   const ctx    = canvas.getContext('2d');

//   // White background
//   ctx.fillStyle = '#fff';
//   ctx.fillRect(0, 0, canvas.width, canvas.height);

//   // — Draw local logo —
//   // `logo` can be a filesystem path (e.g. './assets/logo.png') or a Buffer
//   const logoImg = await loadImage(logo);
//   const logoW   = 200;
//   const logoH   = (logoImg.height / logoImg.width) * logoW;
//   ctx.drawImage(logoImg, margin, margin, logoW, logoH);

//   // — Generate & draw QR from booking.id —
//   const qrBuffer = await QRCode.toBuffer(booking.id, {
//     type:   'png',
//     width:  150,
//     margin: 1
//   });
//   const qrImg = await loadImage(qrBuffer);
//   ctx.drawImage(qrImg, width - margin - 150, margin, 150, 150);

//   // — Event details text —
//   ctx.fillStyle = '#000';
//   ctx.font      = '20px sans-serif';
//   ctx.fillText('Event Details:', margin, headerH + 10);

//   ctx.font = '16px sans-serif';
//   [
//     `Event: ${event.title}`,
//     `Host: ${event.host}`,
//     `Venue: ${event.venue}`,
//     `Date: ${event.date}`,
//     `Time: ${event.time}`,
//     `Tickets: ${event.tickets}`,
//     `Amount Paid: Rs. ${event.amount}`,
//     `Booking ID: ${booking.id}`
//   ].forEach((line, i) =>
//     ctx.fillText(line, margin, headerH + 40 + i * 22)
//   );

//   // — Separator line —
//   ctx.strokeStyle = '#ccc';
//   ctx.lineWidth   = 1;
//   ctx.beginPath();
//   ctx.moveTo(margin, headerH + detailH);
//   ctx.lineTo(width - margin, headerH + detailH);
//   ctx.stroke();

//   // — Draw Cloudinary poster (auto-fit width) —
//   const poster = await loadImage(posterUrl);
//   const boxW   = width - margin * 2;
//   const scale  = boxW / poster.width;
//   const boxH   = poster.height * scale;
//   ctx.drawImage(poster, margin, footerY, boxW, boxH);

//   return canvas.toBuffer('image/png');
// };


// Top of your generateTicketImage file
import path from 'path';
import { createCanvas, loadImage, registerFont } from 'canvas';
import QRCode from 'qrcode';
import fetch from 'node-fetch';
globalThis.fetch = fetch;

// Register your font from fonts folder
registerFont(path.join(process.cwd(), 'fonts', 'NotoSansDevanagari-Regular.ttf'), { family: 'NotoSans' });

// Ticket Image Generator
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

  // Draw local logo
  const logoImg = await loadImage(logo);
  const logoW   = 200;
  const logoH   = (logoImg.height / logoImg.width) * logoW;
  ctx.drawImage(logoImg, margin, margin, logoW, logoH);

  // Generate QR Code
  const qrBuffer = await QRCode.toBuffer(booking.id, {
    type:   'png',
    width:  150,
    margin: 1
  });
  const qrImg = await loadImage(qrBuffer);
  ctx.drawImage(qrImg, width - margin - 150, margin, 150, 150);

  // Event Details using NotoSans Font
  ctx.fillStyle = '#000';
  ctx.font      = '20px "NotoSans"';
  ctx.fillText('Event Details:', margin, headerH + 10);

  ctx.font = '16px "NotoSans"';
  [
    `Event: ${event.title}`,
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

  // Separator line
  ctx.strokeStyle = '#ccc';
  ctx.lineWidth   = 1;
  ctx.beginPath();
  ctx.moveTo(margin, headerH + detailH);
  ctx.lineTo(width - margin, headerH + detailH);
  ctx.stroke();

  // Draw Cloudinary Poster
  const poster = await loadImage(posterUrl);
  const boxW   = width - margin * 2;
  const scale  = boxW / poster.width;
  const boxH   = poster.height * scale;
  ctx.drawImage(poster, margin, footerY, boxW, boxH);

  return canvas.toBuffer('image/png');
};

