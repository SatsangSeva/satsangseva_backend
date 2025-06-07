// import mongoose from "mongoose";

// const adminSchema = new mongoose.Schema({
//   email: {
//     type: String,
//     unique: true,
//     required: true,
//   },
//   password: {
//     type: String,
//     required: true,
//     minLength: 6,
//   },
//   addedMovies: [
//     {
//       type: mongoose.Types.ObjectId,
//       ref: "Movie",
//     },
//   ],
// });

// export default mongoose.model("Admin", adminSchema);

import mongoose from "mongoose";

const adminSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
    },
    email: {
      type: String,
      unique: true,
      required: true,
    },
    mobile: {
      type: String,
      required: true,
    },
    password: {
      type: String,
      required: true,
      minLength: 6,
    },
    designation: {
      type: String,
      default: "admin",
    },
    isImageSubmitted: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

export default mongoose.model("Admin", adminSchema);
