import axios from "axios";
import FormData from "form-data";

const PHONE_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
const TOKEN = process.env.FB_TOKEN;
const BASE_URL = "https://graph.facebook.com/v22.0";

if (!PHONE_ID || !TOKEN) {
    throw new Error("Missing WhatsApp config env vars (WHATSAPP_PHONE_NUMBER_ID, FB_TOKEN)");
}

 
// shared Axios instance
export const waApi = axios.create({
    baseURL: `${BASE_URL}/${PHONE_ID}`,
    headers: { Authorization: `Bearer ${TOKEN}` }
});



// helper to build multipart/form-data
export function buildForm(fields) {
    const form = new FormData();
    Object.entries(fields).forEach(([key, { value, options }]) => {
        form.append(key, value, options);
    });
    return form;
}
