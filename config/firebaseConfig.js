import dotenv from 'dotenv'
dotenv.config()
import { initializeApp, cert } from "firebase-admin/app";


const serviceAccount = {
  type: process.env.FIREBASE_TYPE,
  project_id: process.env.FIREBASE_PROJECT_ID,
  private_key: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"), // Fix newlines
  client_email: process.env.FIREBASE_CLIENT_EMAIL,
};
initializeApp({
  credential: cert(serviceAccount),
  projectId: "satsangseva-75e97",
});
