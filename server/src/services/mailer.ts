/* eslint-disable @typescript-eslint/no-explicit-any */
import nodemailer from 'nodemailer';
import { escapeHtml } from '../utils/crm.js';

export const OFFICIAL_SENDER = 'contacto@dreamtek.tech';
export const OFFICIAL_SECURITY_FROM = 'Dreamtek Security <contacto@dreamtek.tech>';
export const OFFICIAL_GENERAL_FROM = 'Dreamtek <contacto@dreamtek.tech>';

let testTransporter: any = null;

export function setMailerTransporterForTest(transporter: any): void {
  testTransporter = transporter;
}

export function resetMailerTransporterForTest(): void {
  testTransporter = null;
}

export function getMailerTransporter(): any {
  if (testTransporter) {
    return testTransporter;
  }

  const port = parseInt(process.env.SMTP_PORT || '465', 10);
  const secure = process.env.SMTP_SECURE === 'true' || port === 465;

  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.hostinger.com',
    port,
    secure,
    auth: {
      user: process.env.SMTP_USER || OFFICIAL_SENDER,
      pass: process.env.SMTP_PASS || '',
    },
    connectionTimeout: 5000,
    greetingTimeout: 5000,
    socketTimeout: 5000,
  });
}

/**
 * Sanitizes header strings to prevent CRLF injection in email headers (OWASP A03)
 */
export function sanitizeEmailHeader(value: string): string {
  if (!value) return '';
  return value.replace(/[\r\n]+/g, ' ').trim();
}

export interface SendMailOptions {
  to: string;
  subject: string;
  text: string;
  html: string;
  from?: string;
}

/**
 * Dispatches an email via the centralized SSOT Nodemailer transporter (FC 049 / C-049.1)
 */
export async function sendMail(options: SendMailOptions): Promise<void> {
  const transporter = getMailerTransporter();
  const safeTo = sanitizeEmailHeader(options.to);
  const safeSubject = sanitizeEmailHeader(options.subject);
  const safeFrom = options.from ? sanitizeEmailHeader(options.from) : OFFICIAL_SECURITY_FROM;

  await transporter.sendMail({
    from: safeFrom,
    to: safeTo,
    subject: safeSubject,
    text: options.text,
    html: options.html,
  });
}

/**
 * Template: Registration Verification OTP (Condition C-049.1 / C-049.2)
 */
export async function sendRegistrationVerificationOtp(
  to: string,
  code: string,
  fullName?: string,
): Promise<void> {
  const safeName = fullName ? escapeHtml(fullName) : 'Usuario';
  const safeCode = escapeHtml(code);

  const subject = 'Confirma tu correo electrónico — Dreamtek';
  const text = `Hola ${safeName},\n\nTu código de verificación para completar tu registro en Dreamtek es: ${code}\n\nEste código expira en 15 minutos y es de un solo uso.\n\nSi tú no creaste esta cuenta, puedes ignorar este mensaje.\n\n— Equipo de Seguridad Dreamtek`;

  const html = `
    <div style="background-color: #0b0f19; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; padding: 40px 20px; color: #f3f4f6;">
      <div style="max-width: 540px; margin: 0 auto; background: #111827; border: 1px solid #1f2937; border-radius: 12px; overflow: hidden; box-shadow: 0 10px 25px rgba(0,0,0,0.5);">
        <div style="background: linear-gradient(135deg, #0284c7 0%, #0369a1 100%); padding: 24px; text-align: center;">
          <h1 style="color: #ffffff; margin: 0; font-size: 22px; letter-spacing: 1px; font-weight: 700;">DREAMTEK</h1>
          <p style="color: #bae6fd; margin: 4px 0 0 0; font-size: 13px;">Seguridad Perimetral y Desarrollo Soberano</p>
        </div>
        <div style="padding: 32px 24px;">
          <h2 style="color: #f9fafb; font-size: 18px; margin-top: 0;">Confirmación de Cuenta</h2>
          <p style="color: #9ca3af; font-size: 14px; line-height: 1.6;">Hola <strong style="color: #e5e7eb;">${safeName}</strong>, gracias por registrarte. Para activar tu cuenta, ingresa el siguiente código de verificación de 6 dígitos:</p>
          <div style="background: #1f2937; border: 1px dashed #38bdf8; border-radius: 8px; text-align: center; padding: 20px; margin: 24px 0;">
            <span style="font-family: monospace; font-size: 34px; font-weight: bold; letter-spacing: 8px; color: #38bdf8;">${safeCode}</span>
          </div>
          <p style="color: #9ca3af; font-size: 13px; line-height: 1.5;">Este código es válido durante <strong style="color: #d1d5db;">15 minutos</strong> y puede utilizarse una sola vez. Si no solicitaste este registro, puedes desestimar este correo.</p>
        </div>
        <div style="background: #0d1321; border-top: 1px solid #1f2937; padding: 16px 24px; text-align: center;">
          <p style="color: #6b7280; font-size: 11px; margin: 0;">Enviado desde el emisor oficial <strong>contacto@dreamtek.tech</strong> &bull; Protocolo L Soberano</p>
        </div>
      </div>
    </div>
  `;

  await sendMail({
    to,
    subject,
    text,
    html,
    from: OFFICIAL_SECURITY_FROM,
  });
}

/**
 * Template: MFA 2FA Email OTP (FC 047 migration to unified mailer)
 */
export async function sendMfaEmailOtp(to: string, code: string): Promise<void> {
  const safeCode = escapeHtml(code);
  const subject = 'Tu código de verificación de 2 pasos — Dreamtek';
  const text = `Tu código de verificación de dos factores para acceder a Dreamtek es: ${code}\n\nEste código expira en 10 minutos. Si no solicitaste este acceso, protege tu cuenta de inmediato.\n\n— Dreamtek Security`;

  const html = `
    <div style="background-color: #0b0f19; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; padding: 40px 20px; color: #f3f4f6;">
      <div style="max-width: 540px; margin: 0 auto; background: #111827; border: 1px solid #1f2937; border-radius: 12px; overflow: hidden; box-shadow: 0 10px 25px rgba(0,0,0,0.5);">
        <div style="background: linear-gradient(135deg, #0284c7 0%, #0369a1 100%); padding: 24px; text-align: center;">
          <h1 style="color: #ffffff; margin: 0; font-size: 22px; letter-spacing: 1px; font-weight: 700;">DREAMTEK SECURITY</h1>
        </div>
        <div style="padding: 32px 24px;">
          <h2 style="color: #f9fafb; font-size: 18px; margin-top: 0;">Desafío de Seguridad en 2 Pasos</h2>
          <p style="color: #9ca3af; font-size: 14px; line-height: 1.6;">Ingresa el siguiente código de seguridad para completar tu inicio de sesión:</p>
          <div style="background: #1f2937; border: 1px dashed #38bdf8; border-radius: 8px; text-align: center; padding: 20px; margin: 24px 0;">
            <span style="font-family: monospace; font-size: 34px; font-weight: bold; letter-spacing: 8px; color: #38bdf8;">${safeCode}</span>
          </div>
          <p style="color: #9ca3af; font-size: 13px; line-height: 1.5;">Este código expira en <strong style="color: #d1d5db;">10 minutos</strong>. Si tú no intentaste iniciar sesión, cambia tu contraseña de inmediato.</p>
        </div>
        <div style="background: #0d1321; border-top: 1px solid #1f2937; padding: 16px 24px; text-align: center;">
          <p style="color: #6b7280; font-size: 11px; margin: 0;">Enviado desde el emisor oficial <strong>contacto@dreamtek.tech</strong> &bull; Protocolo L Soberano</p>
        </div>
      </div>
    </div>
  `;

  await sendMail({
    to,
    subject,
    text,
    html,
    from: OFFICIAL_SECURITY_FROM,
  });
}

/**
 * Template: Welcome Email after successful verification
 */
export async function sendWelcomeEmail(to: string, fullName: string): Promise<void> {
  const safeName = escapeHtml(fullName || 'Cliente');
  const subject = '¡Bienvenido/a a Dreamtek! Tu cuenta está activa';
  const text = `Hola ${safeName},\n\nTu correo ha sido verificado con éxito y tu cuenta en Dreamtek está activa.\n\nPuedes acceder a tu portal en cualquier momento.\n\n— Equipo Dreamtek`;

  const html = `
    <div style="background-color: #0b0f19; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; padding: 40px 20px; color: #f3f4f6;">
      <div style="max-width: 540px; margin: 0 auto; background: #111827; border: 1px solid #1f2937; border-radius: 12px; overflow: hidden; box-shadow: 0 10px 25px rgba(0,0,0,0.5);">
        <div style="background: linear-gradient(135deg, #0284c7 0%, #0369a1 100%); padding: 24px; text-align: center;">
          <h1 style="color: #ffffff; margin: 0; font-size: 22px; letter-spacing: 1px; font-weight: 700;">DREAMTEK</h1>
        </div>
        <div style="padding: 32px 24px;">
          <h2 style="color: #f9fafb; font-size: 18px; margin-top: 0;">¡Cuenta Verificada con Éxito!</h2>
          <p style="color: #9ca3af; font-size: 14px; line-height: 1.6;">Hola <strong style="color: #e5e7eb;">${safeName}</strong>, tu correo electrónico ha sido validado correctamente. Ya tienes acceso completo a la plataforma de Dreamtek.</p>
        </div>
        <div style="background: #0d1321; border-top: 1px solid #1f2937; padding: 16px 24px; text-align: center;">
          <p style="color: #6b7280; font-size: 11px; margin: 0;">Enviado desde el emisor oficial <strong>contacto@dreamtek.tech</strong> &bull; Protocolo L Soberano</p>
        </div>
      </div>
    </div>
  `;

  await sendMail({
    to,
    subject,
    text,
    html,
    from: OFFICIAL_GENERAL_FROM,
  });
}
