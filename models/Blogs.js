import mongoose from "mongoose";

const blogsSchema = new mongoose.Schema({
  title: {
    type: String,
    unique: true,
    required: [true, "Title is required"],
    required: [true, "Title should be Unique"],
  },
  content: {
    type: String,
    required: [true, "Content is required"],
  },
  images: {
    type: [{ type: String }],
    required: true,
  },
});

export default mongoose.model("Blogs", blogsSchema);
