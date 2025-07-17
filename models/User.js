import mongoose from "mongoose";
import { cascadeDeleteHelpers } from "../utils/cascadeDelete.js";
const Schema = mongoose.Schema;

const locationSchema = new Schema({
  address: { type: String, required: true },
  address2: { type: String, default: null },
  city: { type: String, required: true },
  state: { type: String, required: true },
  postalCode: { type: String, required: true },
  country: { type: String, required: true },
  coordinates: {
    lat: { type: String, require: true },
    lng: { type: String, require: true },
  },
},{_id:false});
const userSchema = new Schema({
  name: {
    type: String,
    // required: true,
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
  },
   profileView : {type : Number , default:0},
  phoneNumber: {
    type: String,
    // required: true,
    // Remove unique: true and use sparse: true
    index: {
      unique: true,
      sparse: true,
    },
    maxLength: 10,
  },
  password: {
    type: String,
    // required: true,
    minLength: 6,
  },
  userType: {
    type: String,
    enum: ["Host&Participant", "Participant"],
    default: "Host&Participant",
  },
  profileType: {
    type: String,
    enum: ["Artist", "Orator", "Organizer"],
  },
  desc: {
    type: String,
    default: null,
  },
  location: {
    type: locationSchema,
    // required: true,
  },
  interests: {
    type: [String],
    default: [],
  },
  preferredEventTypes: {
    type: [
      {
        type: String,
        enum: ["live", "onsite", "youtube stream"],
      },
    ],
    default: [],
  },
  profile: {
    type: String,
    default: null,
  },
 document: {
  type: [String],
  default: [],
},
  social: {
    facebook: { type: String, default: null },
    twitter: { type: String, default: null },
    instagram: { type: String, default: null },
    youtube: { type: String, default: null },
    web: { type: String, default: null }
  },
  bookings: [{ type: mongoose.Types.ObjectId, ref: "Booking" }],
  events: [
    {
      type: mongoose.Types.ObjectId,
      ref: "Events",
    },
  ],
  fcmToken: [
    {
      type: String,
    },
  ],
  createdAt: {
    type: Date,
    default: () => Date.now(),
    immutable: true,
  },
});

userSchema.pre("findOneAndDelete", async function (next) {
  try {
    // Get the document that's about to be deleted
    const userDoc = await this.model.findOne(this.getFilter());
    if (!userDoc) return next();

    const userId = userDoc._id;

    // Cascade delete related documents
    await cascadeDeleteHelpers.deleteUserEvents(userId);
    await cascadeDeleteHelpers.deleteUserBookings(userId);
    await cascadeDeleteHelpers.deleteUserLikes(userId);
    await cascadeDeleteHelpers.deleteUserSubscriptions(userId);

    next();
  } catch (error) {
    next(error);
  }
});

// Handle deleteMany
userSchema.pre("deleteMany", async function (next) {
  try {
    // Get IDs of users that will be deleted
    const users = await this.model.find(this.getFilter());
    const userIds = users.map(user => user._id);

    // Process each user
    for (const userId of userIds) {
      await cascadeDeleteHelpers.deleteUserEvents(userId);
      await cascadeDeleteHelpers.deleteUserBookings(userId);
      await cascadeDeleteHelpers.deleteUserLikes(userId);
      await cascadeDeleteHelpers.deleteUserSubscriptions(userId);
    }

    next();
  } catch (error) {
    next(error);
  }
});


export default mongoose.model("User", userSchema);

userSchema.pre("save", function (next) {
  if (!this.isNew) {
    this.createdAt = this.get("createdAt");
  }
  next();
});
