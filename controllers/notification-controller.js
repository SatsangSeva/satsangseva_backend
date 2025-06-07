import {
  sendNotificationToDevice,
  sendNotificationToDevices,
  sendNotificationToTopic,
  subscribeToTopic,
  unsubscribeFromTopic,
} from "../utils/firebaseConfig.js";

export const sendToDevice = async (req, res) => {
  try {
    const { token, title, body, data } = req.body;
    const response = await sendNotificationToDevice({
      token,
      title,
      body,
      data,
    });
    res.status(200).json({ success: true, response });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const sendToDevices = async (req, res) => {
  try {
    const { tokens, title, body, data } = req.body;
    const response = await sendNotificationToDevices({
      tokens,
      title,
      body,
      data,
    });
    res.status(200).json({ success: true, response });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const sendToTopic = async (req, res) => {
  try {
    const { topic, title, body, data } = req.body;
    const response = await sendNotificationToTopic({
      topic,
      title,
      body,
      data,
    });
    res.status(200).json({ success: true, response });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const subscribeTopic = async (req, res) => {
  try {
    const { tokens, topic } = req.body;
    const response = await subscribeToTopic(tokens, topic);
    res.status(200).json({ success: true, response });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const unsubscribeTopic = async (req, res) => {
  try {
    const { tokens, topic } = req.body;
    const response = await unsubscribeFromTopic(tokens, topic);
    res.status(200).json({ success: true, response });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};
