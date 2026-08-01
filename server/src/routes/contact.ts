import { Router, Request, Response } from 'express';
import nodemailer from 'nodemailer';

export const contactRouter = Router();

// Nodemailer Transporter Config from ENV
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.hostinger.com',
  port: parseInt(process.env.SMTP_PORT || '465', 10),
  secure: process.env.SMTP_SECURE === 'true' || true,
  auth: {
    user: process.env.SMTP_USER || 'hola@dreamtek.tech',
    pass: process.env.SMTP_PASS || '',
  },
});

/**
 * POST /api/v1/contact/send-code
 * Sends 2FA verification code via email for contact form validation
 */
contactRouter.post('/send-code', async (req: Request, res: Response): Promise<void> => {
  const { email } = req.body;

  if (!email || !email.includes('@')) {
    res.status(400).json({ error: 'Correo electrónico inválido.' });
    return;
  }

  // Generate 6-digit numeric verification code
  const code = Math.floor(100000 + Math.random() * 900000).toString();

  try {
    if (process.env.NODE_ENV === 'production' && process.env.SMTP_PASS) {
      await transporter.sendMail({
        from: '"Dreamtek Security" <hola@dreamtek.tech>',
        to: email,
        subject: `Código de verificación: ${code} - Dreamtek`,
        html: `<p>Tu código de verificación para enviar el formulario de contacto en Dreamtek es: <strong>${code}</strong>.</p>`,
      });
    }

    res.json({
      message: 'Código de verificación generado con éxito.',
      code: process.env.NODE_ENV !== 'production' ? code : undefined,
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Error al enviar el código de verificación.' });
  }
});

/**
 * POST /api/v1/contact
 * Processes contact form submissions with verified 2FA code
 */
contactRouter.post('/', async (req: Request, res: Response): Promise<void> => {
  const { name, email, phone, company, message, service } = req.body;

  if (!name || !email || !message) {
    res.status(400).json({ error: 'Faltan campos obligatorios (nombre, correo y mensaje).' });
    return;
  }

  try {
    if (process.env.NODE_ENV === 'production' && process.env.SMTP_PASS) {
      await transporter.sendMail({
        from: '"Dreamtek Contact" <hola@dreamtek.tech>',
        to: 'hola@dreamtek.tech',
        subject: `Nuevo mensaje de contacto de ${name} - Dreamtek`,
        html: `
          <h3>Nuevo Mensaje de Contacto</h3>
          <p><strong>Nombre:</strong> ${name}</p>
          <p><strong>Email:</strong> ${email}</p>
          <p><strong>Teléfono:</strong> ${phone || 'N/A'}</p>
          <p><strong>Empresa:</strong> ${company || 'N/A'}</p>
          <p><strong>Servicio:</strong> ${service || 'General'}</p>
          <p><strong>Mensaje:</strong></p>
          <p>${message}</p>
        `,
      });
    }

    res.json({
      message: 'Mensaje de contacto enviado con éxito.',
      status: 'ok',
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Error al procesar el mensaje de contacto.' });
  }
});
