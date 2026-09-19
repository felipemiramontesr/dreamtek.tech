import { Router, Request, Response } from 'express';
import { validate } from '../middleware/validate.js';
import { contactFormSchema, sendCodeSchema } from '../schemas/contact.schema.js';
import { invalidateCache } from '../utils/cache.js';
import {
  getMailerTransporter,
  setMailerTransporterForTest,
  OFFICIAL_SENDER,
  OFFICIAL_SECURITY_FROM,
  OFFICIAL_CONTACT_FROM,
  buildContactOtpEmail,
  buildContactNotificationEmail,
} from '../services/mailer.js';

export const contactRouter = Router();

let testTransporter: any = null;

export function setTransporterForTest(transporter: any) {
  testTransporter = transporter;
  setMailerTransporterForTest(transporter);
}

// Nodemailer Transporter Config from ENV (Delegates to centralized mailer SSOT)
export function getTransporter() {
  if (testTransporter) return testTransporter;
  return getMailerTransporter();
}

/**
 * POST /api/v1/contact/send-code
 * Sends 2FA verification code via email for contact form validation
 */
contactRouter.post(
  '/send-code',
  validate(sendCodeSchema),
  async (req: Request, res: Response): Promise<void> => {
    const { email } = req.body;

    if (!email || !email.includes('@')) {
      res.status(400).json({ error: 'Correo electrónico inválido.' });
      return;
    }

    // Generate 6-digit numeric verification code
    const code = Math.floor(100000 + Math.random() * 900000).toString();

    try {
      if (process.env.NODE_ENV === 'production' && process.env.SMTP_PASS) {
        const mailContent = buildContactOtpEmail(code);
        await getTransporter().sendMail({
          from: OFFICIAL_SECURITY_FROM,
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
    } catch (err: any) {
      console.error('[CONTACT_SEND_CODE_ERROR]', err);
      res.status(500).json({ error: 'Error al enviar el código de verificación.' });
    }
  },
);

/**
 * POST /api/v1/contact
 * Processes contact form submissions with verified 2FA code
 */
contactRouter.post(
  '/',
  validate(contactFormSchema),
  async (req: Request, res: Response): Promise<void> => {
    const { name, email, phone, company, message, service } = req.body;

    if (!name || !email || !message) {
      res.status(400).json({ error: 'Faltan campos obligatorios (nombre, correo y mensaje).' });
      return;
    }

    try {
      if (process.env.NODE_ENV === 'production' && process.env.SMTP_PASS) {
        const mailContent = buildContactNotificationEmail({
          name,
          email,
          phone,
          company,
          service,
          message,
        });
        await getTransporter().sendMail({
          from: OFFICIAL_CONTACT_FROM,
          to: OFFICIAL_SENDER,
          subject: mailContent.subject,
          text: mailContent.text,
          html: mailContent.html,
        });
      }

      // Condition C-L2: Invalidate contact cache on submission
      await invalidateCache('contact');

      res.json({
        message: 'Mensaje de contacto enviado con éxito.',
      });
    } catch (err: any) {
      console.error('[CONTACT_SUBMIT_ERROR]', err);
      res.status(500).json({ error: 'Error al procesar el mensaje de contacto.' });
    }
  },
);
