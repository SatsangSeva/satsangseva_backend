import mongoose from "mongoose";
const subscriptionSchema = new mongoose.Schema(
  {
    subscriber: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    subscribedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  { timestamps: true }
);

// Ensure a user can't subscribe to the same user multiple times
subscriptionSchema.index({ subscriber: 1, subscribedTo: 1 }, { unique: true });

export default mongoose.model("Subscription", subscriptionSchema);
