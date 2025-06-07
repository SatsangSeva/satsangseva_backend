import Subscription from "../models/Subscription.js";
import User from "../models/User.js";

export const toggleSubscription = async (req, res) => {
  const subscriberId = req.user.id; // The user performing the action
  const { userId: subscribedToId } = req.params; // The user to be subscribed to

  try {
    if (subscriberId === subscribedToId) {
      return res
        .status(400)
        .json({ message: "You cannot subscribe to yourself" });
    }

    const subscribedToUser = await User.findById(subscribedToId);
    if (!subscribedToUser)
      return res.status(404).json({ message: "User not found" });

    const existingSubscription = await Subscription.findOne({
      subscriber: subscriberId,
      subscribedTo: subscribedToId,
    });

    if (existingSubscription) {
      // await Subscription.findOneAndDelete({
      //   subscriber: subscriberId,
      //   subscribedTo: subscribedToId,
      // });
      await Subscription.findOneAndDelete({
        _id: existingSubscription._id
      });
      return res
        .status(200)
        .json({ message: "Unsubscribed successfully", subscribed: false });
    } else {
      const subscription = new Subscription({
        subscriber: subscriberId,
        subscribedTo: subscribedToId,
      });
      await subscription.save();
      return res
        .status(200)
        .json({ message: "Subscribed successfully", subscribed: true });
    }
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error toggling subscription", error: error.message });
  }
};

export const getSubscribedUsers = async (req, res) => {
  const userId = req.user.id;

  try {
    const userExists = await User.findById(userId);
    if (!userExists) return res.status(404).json({ message: "User not found" });

    const subscriptions = await Subscription.find({ subscriber: userId })
      .populate({ path: "subscribedTo", select: "name email profile createdAt" })
      .select("-__v");

    res
      .status(200)
      .json({ subscriptions: subscriptions.map((sub) => sub.subscribedTo) });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error fetching subscriptions", error: error.message });
  }
};

export const getUserSubscribers = async (req, res) => {
  const userId = req.user.id;

  try {
    const userExists = await User.findById(userId);
    if (!userExists) return res.status(404).json({ message: "User not found" });

    const subscribers = await Subscription.find({ subscribedTo: userId })
      .populate({ path: "subscriber", select: "name email profile createdAt" })
      .select("-__v");

    res
      .status(200)
      .json({ subscribers: subscribers.map((sub) => sub.subscriber) });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error fetching subscribers", error: error.message });
  }
};

export const getCount = async (req, res) => {
  const userId = req.params.id;
  try {
    const userExists = await User.findById(userId);
    if (!userExists) {
      return res.status(404).json({ message: "User not found" });
    }

    const [subscriptions, subscribers] = await Promise.all([
      Subscription.countDocuments({ subscriber: userId }),
      Subscription.countDocuments({ subscribedTo: userId }),
    ]);

    return res.status(200).json({ subscriptions, subscribers });
  } catch (error) {
    console.error("Error fetching subscription counts:", error);
    return res.status(500).json({
      message: "Error fetching subscriptions",
      error: error.message,
    });
  }
};

export const hasUserSubscribed = async (req, res) => {
  const { guestId } = req.params;
  const userId = req.user.id;

  try {
    const existingSubscription = await Subscription.exists({
      subscriber: userId,
      subscribedTo: guestId,
    });
    return res
      .status(200)
      .json({ success: true, subscribed: !!existingSubscription });
  } catch (error) {
    console.error("Error in has User Subscribed:", error);
    return res
      .status(500)
      .json({ success: false, message: "Internal server error" });
  }
};
