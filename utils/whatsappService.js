import { buildForm, waApi } from "../config/whatsapp.js";

/**
 * Uploads a PDF stream to WhatsApp Cloud and returns the media_id.
 *
 * @param {Buffer|ReadStream} fileBuffer – a ReadStream for your PDF
 * @param {object} [opts]
 * @param {string} [opts.type]     – e.g. 'application/pdf'
 * @param {string} [opts.filename] – e.g. 'ticket.pdf'
 */
export async function uploadMedia(fileBuffer, opts = {}) {
    const { type = 'image/png', filename = 'image.png' } = opts;

    const fields = {
        messaging_product: { value: 'whatsapp' },
        type: { value: type },
        file: { value: fileBuffer, options: { filename, contentType: type } }
    };
    const form = buildForm(fields);

    const headers = {
        ...form.getHeaders(),
    };

    try {
        const resp = await waApi.post(
            '/media',
            form,
            { headers }
        );
        return resp.data.id;
    } catch (err) {
        console.log('err :>> ', err);
        return err
    }
}

/**
 * Sends a document message to a single WhatsApp number.
 * @param {string} to        – recipient phone in E.164
 * @param {string} mediaId   – from uploadMedia()
 * @param {object} [opts]    – optional captions/filename
 */
export async function sendDocument(to, mediaId, opts = {}) {
    const body = {
        messaging_product: "whatsapp",
        to,
        type: "document",
        document: {
            id: mediaId,
            filename: opts.filename || "ticket.png",
            caption: opts.caption || ""
        }
    };

    return waApi.post("/messages", body);
}

export async function sendTemplateMessage(to, templateName, languageCode, headerMediaId, bodyVariables = []) {
    // Build the components array
    const components = [
        {
            type: 'header',
            parameters: [
                { type: 'image', image: { id: headerMediaId } }
            ]
        },
        {
            type: 'body',
            parameters: bodyVariables.map(text => ({ type: 'text', text }))
        }
    ];

    const payload = {
        messaging_product: 'whatsapp',
        to,
        type: 'template',
        template: {
            name: templateName,
            language: { code: languageCode },
            components
        }
    };

    return waApi.post('/messages', payload);
}
/**
 * Returns true if this error should *not* abort your booking transaction
 * (i.e. invalid number / not on WhatsApp).
 */
export function isNonFatalWaError(err) {
    const e = err.response?.data?.error || {};
    const msg = e.message || "";
    // adjust patterns to match actual WA errors
    return (
        e.code === 100 &&
        /invalid.*whatsapp.*number|not a valid.*whatsapp/i.test(msg)
    );
}
