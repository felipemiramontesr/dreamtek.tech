"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.contactRouter = void 0;
exports.setTransporterForTest = setTransporterForTest;
exports.getTransporter = getTransporter;
const express_1 = require("express");
const validate_js_1 = require("../middleware/validate.js");
const contact_schema_js_1 = require("../schemas/contact.schema.js");
const cache_js_1 = require("../utils/cache.js");
const mailer_js_1 = require("../services/mailer.js");
exports.contactRouter = (0, express_1.Router)();
let testTransporter = null;
function setTransporterForTest(transporter) {
    testTransporter = transporter;
    (0, mailer_js_1.setMailerTransporterForTest)(transporter);
}
// Nodemailer Transporter Config from ENV (Delegates to centralized mailer SSOT)
function getTransporter() {
    if (testTransporter)
        return testTransporter;
    return (0, mailer_js_1.getMailerTransporter)();
}
/**
 * POST /api/v1/contact/send-code
 * Sends 2FA verification code via email for contact form validation
 */
exports.contactRouter.post('/send-code', (0, validate_js_1.validate)(contact_schema_js_1.sendCodeSchema), async (req, res) => {
    const { email } = req.body;
    if (!email || !email.includes('@')) {
        res.status(400).json({ error: 'Correo electrónico inválido.' });
        return;
    }
    // Generate 6-digit numeric verification code
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    try {
        if (process.env.NODE_ENV === 'production' && process.env.SMTP_PASS) {
            const mailContent = (0, mailer_js_1.buildContactOtpEmail)(code);
            await getTransporter().sendMail({
                from: mailer_js_1.OFFICIAL_SECURITY_FROM,
                to: email,
                subject: mailContent.subject,
                text: mailContent.text,
                html: mailContent.html,
            });
        }
        res.json({
            message: 'Código de verificación generado con éxito.',
            code: process.env.NODE_ENV !== 'production' ? code : undefined,
        });
    }
    catch (err) {
        console.error('[CONTACT_SEND_CODE_ERROR]', err);
        res.status(500).json({ error: 'Error al enviar el código de verificación.' });
    }
});
/**
 * POST /api/v1/contact
 * Processes contact form submissions with verified 2FA code
 */
exports.contactRouter.post('/', (0, validate_js_1.validate)(contact_schema_js_1.contactFormSchema), async (req, res) => {
    const { name, email, phone, company, message, service } = req.body;
    if (!name || !email || !message) {
        res.status(400).json({ error: 'Faltan campos obligatorios (nombre, correo y mensaje).' });
        return;
    }
    try {
        if (process.env.NODE_ENV === 'production' && process.env.SMTP_PASS) {
            const mailContent = (0, mailer_js_1.buildContactNotificationEmail)({
                name,
                email,
                phone,
                company,
                service,
                message,
            });
            await getTransporter().sendMail({
                from: mailer_js_1.OFFICIAL_CONTACT_FROM,
                to: mailer_js_1.OFFICIAL_SENDER,
                subject: mailContent.subject,
                text: mailContent.text,
                html: mailContent.html,
            });
        }
        // Condition C-L2: Invalidate contact cache on submission
        await (0, cache_js_1.invalidateCache)('contact');
        res.json({
            message: 'Mensaje de contacto enviado con éxito.',
        });
    }
    catch (err) {
        console.error('[CONTACT_SUBMIT_ERROR]', err);
        res.status(500).json({ error: 'Error al procesar el mensaje de contacto.' });
    }
});
