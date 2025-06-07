import { getMessaging } from "firebase-admin/messaging";
import "../config/firebaseConfig.js";

// Function to send notification to single device
export const sendNotificationToDevice = async ({
  token,
  title,
  body,
  data = {},
}) => {
  try {
    const message = {
      notification: {
        title,
        body,
      },
      data,
      token,
    };

    const response = await getMessaging().send(message);
    // console.log("Successfully sent message to device:", response);
    return response;
  } catch (error) {
    // console.error("Error sending message to device:", error);
    throw error;
  }
};

// Function to send notification to multiple devices
export const sendNotificationToDevices = async ({
  tokens,
  title,
  body,
  data = {},
}) => {
  try {
    // Create a multicast message
    const message = {
      notification: {
        title,
        body,
      },
      data,
      tokens, // Array of device tokens
    };

    // Use the messaging API directly for multicast
    const response = await getMessaging().sendEachForMulticast(message);

    // Get the tokens that failed
    const failedTokens = [];
    response.responses.forEach((resp, idx) => {
      if (!resp.success) {
        failedTokens.push(tokens[idx]);
        console.error("Error sending to token:", tokens[idx], resp.error);
      }
    });

    return {
      successCount: response.successCount,
      failureCount: response.failureCount,
      failedTokens,
    };
  } catch (error) {
    console.error("Error sending multicast messages:", error);
    throw error;
  }
};

// Test call - now with correct parameter name "tokens" instead of "token"
// sendNotificationToDevices({
//   tokens: [
//     "eIfkMPLUR5GaowWB2f1KTf:APA91bHVSbQBBI1YuqagqcYGtsW9jBWnK1McoRX6evtDooDugNZpGvnjnW-vBys6dR4G-eLYIj8rDPasnHVSs4I3dhciTUmT5Jx9HwWkoQpQx2vw1QIp14E",
//     "co_2pu0aTYW2m2e6Q82xRR:APA91bFmOUf3yje93Ki7XMJPJHyPBlBO-AQVfBy9NXfXoFUSNbbnaXRpPk8MFyEgql8VvItK9cfR1WATwyOBqwtMytjrpTT8CSvRvQDQ5RE4QQpvuWTXePA",
//     "eo7jdthnR6y9AOVjsJKBtA:APA91bGPgCB0rYu4qxjYusZzmE8TqRdjYgPtEbdeFTCRyWrTvW7rgLtslqzNDZgE14DQKqhiDl7w1r5EcNP5v_nJyLMuqztywPgn3VsvJKl5o1XeO837lHQ",
//   ],
//   title: "Title for testing",
//   body: "this is body",
// });
