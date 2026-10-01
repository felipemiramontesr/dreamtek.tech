"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.OFFICIAL_COMMERCIAL_FROM = exports.OFFICIAL_SOLUTIONS_FROM = exports.OFFICIAL_CONTACT_FROM = exports.OFFICIAL_GENERAL_FROM = exports.OFFICIAL_SECURITY_FROM = exports.OFFICIAL_SENDER = void 0;
exports.setMailerTransporterForTest = setMailerTransporterForTest;
exports.resetMailerTransporterForTest = resetMailerTransporterForTest;
exports.getMailerTransporter = getMailerTransporter;
exports.sanitizeEmailHeader = sanitizeEmailHeader;
exports.sendMail = sendMail;
exports.renderSovereignEmailWrapper = renderSovereignEmailWrapper;
exports.sendRegistrationVerificationOtp = sendRegistrationVerificationOtp;
exports.sendMfaEmailOtp = sendMfaEmailOtp;
exports.sendWelcomeEmail = sendWelcomeEmail;
exports.buildContactOtpEmail = buildContactOtpEmail;
exports.sendContactOtpEmail = sendContactOtpEmail;
exports.buildContactNotificationEmail = buildContactNotificationEmail;
exports.sendContactNotificationEmail = sendContactNotificationEmail;
exports.buildQuoteNotificationEmail = buildQuoteNotificationEmail;
exports.sendQuoteNotificationEmail = sendQuoteNotificationEmail;
/* eslint-disable @typescript-eslint/no-explicit-any */
const nodemailer_1 = __importDefault(require("nodemailer"));
const crm_js_1 = require("../utils/crm.js");
exports.OFFICIAL_SENDER = 'contacto@dreamtek.tech';
exports.OFFICIAL_SECURITY_FROM = 'Dreamtek Security <contacto@dreamtek.tech>';
exports.OFFICIAL_GENERAL_FROM = 'Dreamtek <contacto@dreamtek.tech>';
exports.OFFICIAL_CONTACT_FROM = 'Dreamtek Contact <contacto@dreamtek.tech>';
exports.OFFICIAL_SOLUTIONS_FROM = 'Dreamtek Solutions <contacto@dreamtek.tech>';
exports.OFFICIAL_COMMERCIAL_FROM = 'Dreamtek Dirección Comercial <contacto@dreamtek.tech>';
let testTransporter = null;
function setMailerTransporterForTest(transporter) {
    testTransporter = transporter;
}
function resetMailerTransporterForTest() {
    testTransporter = null;
}
function getMailerTransporter() {
    if (testTransporter) {
        return testTransporter;
    }
    const port = parseInt(process.env.SMTP_PORT || '465', 10);
    const secure = process.env.SMTP_SECURE === 'true' || port === 465;
    return nodemailer_1.default.createTransport({
        host: process.env.SMTP_HOST || 'smtp.hostinger.com',
        port,
        secure,
        auth: {
            user: process.env.SMTP_USER || exports.OFFICIAL_SENDER,
            pass: process.env.SMTP_PASS || '',
        },
        connectionTimeout: 15000,
        greetingTimeout: 15000,
        socketTimeout: 15000,
    });
}
/**
 * Sanitizes header strings to prevent CRLF injection in email headers (OWASP A03)
 */
function sanitizeEmailHeader(value) {
    if (!value)
        return '';
    return value.replace(/[\r\n]+/g, ' ').trim();
}
/**
 * Dispatches an email via the centralized SSOT Nodemailer transporter (FC 049 / C-049.1)
 */
async function sendMail(options) {
    const transporter = getMailerTransporter();
    const safeTo = sanitizeEmailHeader(options.to);
    const safeSubject = sanitizeEmailHeader(options.subject);
    const safeFrom = options.from ? sanitizeEmailHeader(options.from) : exports.OFFICIAL_SECURITY_FROM;
    await transporter.sendMail({
        from: safeFrom,
        to: safeTo,
        subject: safeSubject,
        text: options.text,
        html: options.html,
    });
}
/**
 * Master Sovereign Email HTML Wrapper (FC 050 / C-050.1 / C-050.3 / C-050.4)
 * Generates email-client compatible HTML with brand tokens, official logo, and sovereign layout.
 */
function renderSovereignEmailWrapper(options) {
    const accentColor = options.accentColor || '#38bdf8';
    const preheaderHtml = options.preheader
        ? `<div style="display: none; max-height: 0px; overflow: hidden; opacity: 0;">${(0, crm_js_1.escapeHtml)(options.preheader)}</div>`
        : '';
    const badgeHtml = options.badge
        ? `<div style="display: inline-block; margin-top: 10px; padding: 4px 12px; background: rgba(56, 189, 248, 0.1); border: 1px solid ${accentColor}; border-radius: 9999px; color: ${accentColor}; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">${(0, crm_js_1.escapeHtml)(options.badge)}</div>`
        : '';
    const ctaHtml = options.cta
        ? `<div style="margin: 28px 0 8px 0; text-align: center;">
        <a href="${(0, crm_js_1.escapeHtml)(options.cta.url)}" style="background-color: #0284c7; color: #ffffff; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 14px; display: inline-block; letter-spacing: 0.5px;">${(0, crm_js_1.escapeHtml)(options.cta.label)} &rarr;</a>
      </div>`
        : '';
    const noticeHtml = options.footerNotice
        ? `<p style="color: #475569; font-size: 10px; margin: 6px 0 0 0;">${(0, crm_js_1.escapeHtml)(options.footerNotice)}</p>`
        : '<p style="color: #475569; font-size: 10px; margin: 6px 0 0 0;">Este mensaje es confidencial y para uso exclusivo del destinatario.</p>';
    return `
    <div style="background-color: #0b0f19; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; padding: 40px 16px; color: #f3f4f6; box-sizing: border-box;">
      ${preheaderHtml}
      <div style="max-width: 580px; margin: 0 auto; background: #00172B; border: 1px solid #1e293b; border-radius: 12px; overflow: hidden; box-shadow: 0 12px 32px rgba(0,0,0,0.6);">
        <!-- Sovereign Header with Official Brand Logo & Typography (Matching Navbar & Landing Page) -->
        <div style="background: linear-gradient(135deg, #00213D 0%, #00172B 100%); border-bottom: 2px solid ${accentColor}; padding: 28px 24px 22px 24px; text-align: center;">
          <table role="presentation" border="0" cellpadding="0" cellspacing="0" style="margin: 0 auto;">
            <tr>
              <td style="vertical-align: middle; padding-right: 11px;">
                <img src="https://dreamtek.tech/svg/24_DREAMTEK_LOGO_ISOTIPO_Teck%20Red_Tight.svg" alt="Dreamtek Isotipo" width="38" height="29" style="display: block; width: 38px; height: 29px; border: 0; outline: none; text-decoration: none;" />
              </td>
              <td style="vertical-align: middle;">
                <span style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 28px; font-weight: 700; letter-spacing: -0.5px; color: #ffffff; line-height: 1;">Dreamtek<span style="color: #FF2D00;">.</span></span>
              </td>
            </tr>
          </table>
          <p style="color: ${accentColor}; margin: 8px 0 0 0; font-size: 11px; letter-spacing: 1.5px; text-transform: uppercase; font-weight: 600;">Sovereign Tech &bull; Software &amp; Ciberseguridad</p>
          ${badgeHtml}
        </div>
        <!-- Body Content -->
        <div style="padding: 32px 26px; font-size: 14px; line-height: 1.65; color: #e5e7eb;">
          ${options.bodyHtml}
          ${ctaHtml}
        </div>
        <!-- Sovereign Canonical Footer (C-050.4) -->
        <div style="background: #080d1a; border-top: 1px solid #1e293b; padding: 18px 24px; text-align: center;">
          <p style="color: #64748b; font-size: 11px; margin: 0; line-height: 1.6;">
            Enviado desde el emisor oficial <strong style="color: #94a3b8;">contacto@dreamtek.tech</strong> &bull; Dreamtek Sovereign Tech &bull; Protocolo L
          </p>
          ${noticeHtml}
        </div>
      </div>
    </div>
  `.trim();
}
/**
 * Template: Registration Verification OTP (FC 049 / FC 050)
 */
async function sendRegistrationVerificationOtp(to, code, fullName) {
    const safeName = fullName ? (0, crm_js_1.escapeHtml)(fullName) : 'Usuario';
    const safeCode = (0, crm_js_1.escapeHtml)(code);
    const subject = 'Confirma tu correo electrónico — Dreamtek';
    const text = `Hola ${safeName},\n\nTu código de verificación para completar tu registro en Dreamtek es: ${code}\n\nEste código expira en 15 minutos y es de un solo uso.\n\nSi tú no creaste esta cuenta, puedes ignorar este mensaje.\n\n— Equipo de Seguridad Dreamtek`;
    const bodyHtml = `
    <h2 style="color: #f9fafb; font-size: 18px; margin-top: 0;">Confirmación de Cuenta</h2>
    <p style="color: #9ca3af; font-size: 14px; line-height: 1.6;">Hola <strong style="color: #e5e7eb;">${safeName}</strong>, gracias por registrarte. Para activar tu cuenta, ingresa el siguiente código de verificación de 6 dígitos:</p>
    <div style="background: #08101e; border: 1px dashed #38bdf8; border-radius: 8px; text-align: center; padding: 20px; margin: 24px 0;">
      <span style="font-family: monospace; font-size: 34px; font-weight: bold; letter-spacing: 8px; color: #38bdf8;">${safeCode}</span>
    </div>
    <p style="color: #9ca3af; font-size: 13px; line-height: 1.5;">Este código es válido durante <strong style="color: #d1d5db;">15 minutos</strong> y puede utilizarse una sola vez. Si no solicitaste este registro, puedes desestimar este correo.</p>
  `;
    const html = renderSovereignEmailWrapper({
        title: subject,
        badge: 'Seguridad Perimetral',
        preheader: `Tu código de verificación es ${code}`,
        bodyHtml,
    });
    await sendMail({
        to,
        subject,
        text,
        html,
        from: exports.OFFICIAL_SECURITY_FROM,
    });
}
/**
 * Template: MFA 2FA Email OTP (FC 047 / FC 050)
 */
async function sendMfaEmailOtp(to, code) {
    const safeCode = (0, crm_js_1.escapeHtml)(code);
    const subject = 'Tu código de verificación de 2 pasos — Dreamtek';
    const text = `Tu código de verificación de dos factores para acceder a Dreamtek es: ${code}\n\nEste código expira en 10 minutos. Si no solicitaste este acceso, protege tu cuenta de inmediato.\n\n— Dreamtek Security`;
    const bodyHtml = `
    <h2 style="color: #f9fafb; font-size: 18px; margin-top: 0;">Desafío de Seguridad en 2 Pasos</h2>
    <p style="color: #9ca3af; font-size: 14px; line-height: 1.6;">Ingresa el siguiente código de seguridad para completar tu inicio de sesión:</p>
    <div style="background: #08101e; border: 1px dashed #38bdf8; border-radius: 8px; text-align: center; padding: 20px; margin: 24px 0;">
      <span style="font-family: monospace; font-size: 34px; font-weight: bold; letter-spacing: 8px; color: #38bdf8;">${safeCode}</span>
    </div>
    <p style="color: #9ca3af; font-size: 13px; line-height: 1.5;">Este código expira en <strong style="color: #d1d5db;">10 minutos</strong>. Si tú no intentaste iniciar sesión, cambia tu contraseña de inmediato.</p>
  `;
    const html = renderSovereignEmailWrapper({
        title: subject,
        badge: 'Autenticación 2FA',
        preheader: `Código de seguridad: ${code}`,
        bodyHtml,
    });
    await sendMail({
        to,
        subject,
        text,
        html,
        from: exports.OFFICIAL_SECURITY_FROM,
    });
}
/**
 * Template: Welcome Email after successful verification (FC 049 / FC 050)
 */
async function sendWelcomeEmail(to, fullName) {
    const safeName = (0, crm_js_1.escapeHtml)(fullName || 'Cliente');
    const subject = '¡Bienvenido/a a Dreamtek! Tu cuenta está activa';
    const text = `Hola ${safeName},\n\nTu correo ha sido verificado con éxito y tu cuenta en Dreamtek está activa.\n\nPuedes acceder a tu portal en cualquier momento.\n\n— Equipo Dreamtek`;
    const bodyHtml = `
    <h2 style="color: #f9fafb; font-size: 18px; margin-top: 0;">¡Cuenta Verificada con Éxito!</h2>
    <p style="color: #9ca3af; font-size: 14px; line-height: 1.6;">Hola <strong style="color: #e5e7eb;">${safeName}</strong>, tu correo electrónico ha sido validado correctamente. Ya tienes acceso completo a la plataforma soberana de Dreamtek.</p>
    <div style="background: #08101e; border: 1px solid #1e293b; border-radius: 8px; padding: 18px; margin: 24px 0; color: #cbd5e1;">
      <p style="margin: 0 0 8px 0; font-weight: 600; color: #38bdf8;">Servicios Habilitados en tu Cuenta:</p>
      <ul style="margin: 0; padding-left: 20px; font-size: 13px; line-height: 1.7; color: #94a3b8;">
        <li>Acceso al Portal de Clientes y Tableros Operativos</li>
        <li>Monitoreo de Proyectos y Finiquitos en Tiempo Real</li>
        <li>Soporte Técnico de Arquitectura y Ciberdefensa</li>
      </ul>
    </div>
  `;
    const html = renderSovereignEmailWrapper({
        title: subject,
        badge: 'Cuenta Activa',
        preheader: 'Tu cuenta Dreamtek ha sido verificada con éxito',
        bodyHtml,
        cta: {
            label: 'Acceder al Portal de Clientes',
            url: 'https://dreamtek.tech/client/dashboard',
        },
    });
    await sendMail({
        to,
        subject,
        text,
        html,
        from: exports.OFFICIAL_GENERAL_FROM,
    });
}
/**
 * Builds Contact Form OTP Email Content (FC 050 / C-050.1 / C-050.2)
 */
function buildContactOtpEmail(code) {
    const safeCode = (0, crm_js_1.escapeHtml)(code);
    const subject = `Código de verificación: ${code} - Dreamtek`;
    const text = `Tu código de verificación para enviar el formulario de contacto en Dreamtek es: ${code}\n\nEste código es válido durante 10 minutos.\n\n— Dreamtek Security`;
    const bodyHtml = `
    <h2 style="color: #f9fafb; font-size: 18px; margin-top: 0;">Verificación de Contacto</h2>
    <p style="color: #9ca3af; font-size: 14px; line-height: 1.6;">Para validar la autenticidad de tu mensaje en Dreamtek, ingresa el siguiente código de verificación de 6 dígitos:</p>
    <div style="background: #08101e; border: 1px dashed #38bdf8; border-radius: 8px; text-align: center; padding: 20px; margin: 24px 0;">
      <span style="font-family: monospace; font-size: 34px; font-weight: bold; letter-spacing: 8px; color: #38bdf8;">${safeCode}</span>
    </div>
    <p style="color: #9ca3af; font-size: 13px; line-height: 1.5;">Este código es de un solo uso y expira en <strong style="color: #d1d5db;">10 minutos</strong>. Si tú no solicitaste este contacto, puedes ignorar este mensaje.</p>
  `;
    const html = renderSovereignEmailWrapper({
        title: subject,
        badge: 'Verificación de Identidad',
        preheader: `Código de verificación de contacto: ${code}`,
        bodyHtml,
    });
    return { subject, text, html };
}
/**
 * Dispatches Contact Form OTP Email (FC 050)
 */
async function sendContactOtpEmail(to, code) {
    const content = buildContactOtpEmail(code);
    await sendMail({
        to,
        subject: content.subject,
        text: content.text,
        html: content.html,
        from: exports.OFFICIAL_SECURITY_FROM,
    });
}
/**
 * Builds Contact Notification Email Content (FC 050 / C-050.1 / C-050.2)
 */
function buildContactNotificationEmail(data) {
    const safeName = (0, crm_js_1.escapeHtml)(data.name);
    const safeEmail = (0, crm_js_1.escapeHtml)(data.email);
    const safePhone = (0, crm_js_1.escapeHtml)(data.phone || 'N/A');
    const safeCompany = (0, crm_js_1.escapeHtml)(data.company || 'N/A');
    const safeService = (0, crm_js_1.escapeHtml)(data.service || 'General');
    const safeMessage = (0, crm_js_1.escapeHtml)(data.message);
    const subject = `Nuevo mensaje de contacto de ${data.name} - Dreamtek`;
    const text = `Nuevo Mensaje de Contacto\n\nNombre: ${data.name}\nEmail: ${data.email}\nTeléfono: ${data.phone || 'N/A'}\nEmpresa: ${data.company || 'N/A'}\nServicio: ${data.service || 'General'}\nMensaje:\n${data.message}`;
    const bodyHtml = `
    <h2 style="color: #f9fafb; font-size: 18px; margin-top: 0;">Nuevo Mensaje de Contacto</h2>
    <div style="background: #08101e; border: 1px solid #1e293b; border-radius: 8px; padding: 20px; margin: 20px 0;">
      <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
        <tr>
          <td style="padding: 6px 0; color: #94a3b8; width: 110px;"><strong>Nombre:</strong></td>
          <td style="padding: 6px 0; color: #f3f4f6;">${safeName}</td>
        </tr>
        <tr>
          <td style="padding: 6px 0; color: #94a3b8;"><strong>Email:</strong></td>
          <td style="padding: 6px 0; color: #38bdf8;"><a href="mailto:${safeEmail}" style="color: #38bdf8; text-decoration: none;">${safeEmail}</a></td>
        </tr>
        <tr>
          <td style="padding: 6px 0; color: #94a3b8;"><strong>Teléfono:</strong></td>
          <td style="padding: 6px 0; color: #f3f4f6;">${safePhone}</td>
        </tr>
        <tr>
          <td style="padding: 6px 0; color: #94a3b8;"><strong>Empresa:</strong></td>
          <td style="padding: 6px 0; color: #f3f4f6;">${safeCompany}</td>
        </tr>
        <tr>
          <td style="padding: 6px 0; color: #94a3b8;"><strong>Servicio:</strong></td>
          <td style="padding: 6px 0; color: #f3f4f6;">${safeService}</td>
        </tr>
      </table>
    </div>
    <div style="margin-top: 20px;">
      <p style="color: #94a3b8; font-size: 13px; margin-bottom: 8px;"><strong>Mensaje del Prospecto:</strong></p>
      <div style="background: #0d1527; border-left: 3px solid #38bdf8; padding: 14px 16px; border-radius: 4px; color: #e2e8f0; font-size: 13px; line-height: 1.6; white-space: pre-wrap;">${safeMessage}</div>
    </div>
  `;
    const html = renderSovereignEmailWrapper({
        title: subject,
        badge: 'Lead Entrante',
        preheader: `Nuevo contacto de ${data.name} (${data.email})`,
        bodyHtml,
        footerNotice: 'Notificación administrativa interna de Dreamtek.',
    });
    return { subject, text, html };
}
/**
 * Dispatches Contact Notification Email (FC 050)
 */
async function sendContactNotificationEmail(data) {
    const content = buildContactNotificationEmail(data);
    await sendMail({
        to: exports.OFFICIAL_SENDER,
        subject: content.subject,
        text: content.text,
        html: content.html,
        from: exports.OFFICIAL_CONTACT_FROM,
    });
}
/**
 * Builds Quote Notification Email Content (FC 050 / C-050.1 / C-050.2)
 */
function buildQuoteNotificationEmail(data) {
    const safeService = (0, crm_js_1.escapeHtml)(data.serviceLabel);
    const safeVertical = (0, crm_js_1.escapeHtml)(data.vertical);
    const safeScale = (0, crm_js_1.escapeHtml)(data.scaleLabel);
    const safeScaleKey = (0, crm_js_1.escapeHtml)(data.scale);
    const safeCurrency = (0, crm_js_1.escapeHtml)(data.currency);
    const safeLocale = (0, crm_js_1.escapeHtml)(data.locale.toUpperCase());
    const safeName = (0, crm_js_1.escapeHtml)(data.fullName);
    const safeEmail = (0, crm_js_1.escapeHtml)(data.email);
    const safePhone = (0, crm_js_1.escapeHtml)(data.phone);
    const safeCompany = (0, crm_js_1.escapeHtml)(data.companyName || 'N/A');
    const safeNotes = (0, crm_js_1.escapeHtml)(data.notes || 'Ninguna');
    const budgetRange = `$${data.estimatedBudgetMin.toLocaleString()} - $${data.estimatedBudgetMax.toLocaleString()} ${safeCurrency}`;
    const weeksRange = `${data.estimatedWeeksMin} - ${data.estimatedWeeksMax} semanas`;
    const subject = `Nueva Cotización [${data.currency}]: ${data.serviceLabel} - ${data.fullName}`;
    const text = `Nueva Solicitud de Cotización\n\nVertical: ${data.serviceLabel} (${data.vertical})\nAlcance: ${data.scaleLabel} (${data.scale})\nMoneda / Idioma: ${data.currency} (${data.locale.toUpperCase()})\nRango Estimado: ${budgetRange}\nPlazo Estimado: ${weeksRange}\nContacto: ${data.fullName} (${data.email})\nTeléfono: ${data.phone}\nEmpresa: ${data.companyName || 'N/A'}\nNotas: ${data.notes || 'Ninguna'}`;
    const bodyHtml = `
    <h2 style="color: #f9fafb; font-size: 18px; margin-top: 0;">Nueva Solicitud de Cotización</h2>
    <div style="background: #08101e; border: 1px solid #1e293b; border-radius: 8px; padding: 20px; margin: 20px 0;">
      <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
        <tr>
          <td style="padding: 6px 0; color: #94a3b8; width: 130px;"><strong>Vertical / Servicio:</strong></td>
          <td style="padding: 6px 0; color: #f3f4f6;">${safeService} (${safeVertical})</td>
        </tr>
        <tr>
          <td style="padding: 6px 0; color: #94a3b8;"><strong>Alcance:</strong></td>
          <td style="padding: 6px 0; color: #f3f4f6;">${safeScale} (${safeScaleKey})</td>
        </tr>
        <tr>
          <td style="padding: 6px 0; color: #94a3b8;"><strong>Moneda / Idioma:</strong></td>
          <td style="padding: 6px 0; color: #f3f4f6;">${safeCurrency} (${safeLocale})</td>
        </tr>
        <tr>
          <td style="padding: 6px 0; color: #94a3b8;"><strong>Rango Estimado:</strong></td>
          <td style="padding: 6px 0; color: #38bdf8; font-weight: 700;">${budgetRange}</td>
        </tr>
        <tr>
          <td style="padding: 6px 0; color: #94a3b8;"><strong>Plazo Estimado:</strong></td>
          <td style="padding: 6px 0; color: #f3f4f6;">${weeksRange}</td>
        </tr>
        <tr>
          <td style="padding: 6px 0; color: #94a3b8;"><strong>Contacto:</strong></td>
          <td style="padding: 6px 0; color: #f3f4f6;">${safeName} (<a href="mailto:${safeEmail}" style="color: #38bdf8; text-decoration: none;">${safeEmail}</a>)</td>
        </tr>
        <tr>
          <td style="padding: 6px 0; color: #94a3b8;"><strong>Teléfono:</strong></td>
          <td style="padding: 6px 0; color: #f3f4f6;">${safePhone}</td>
        </tr>
        <tr>
          <td style="padding: 6px 0; color: #94a3b8;"><strong>Empresa:</strong></td>
          <td style="padding: 6px 0; color: #f3f4f6;">${safeCompany}</td>
        </tr>
      </table>
    </div>
    <div style="margin-top: 16px;">
      <p style="color: #94a3b8; font-size: 13px; margin-bottom: 6px;"><strong>Notas Adicionales:</strong></p>
      <div style="background: #0d1527; border-left: 3px solid #38bdf8; padding: 12px 16px; border-radius: 4px; color: #cbd5e1; font-size: 13px; line-height: 1.5;">${safeNotes}</div>
    </div>
  `;
    const html = renderSovereignEmailWrapper({
        title: subject,
        badge: 'Cotizador Paramétrico',
        preheader: `Nueva cotización: ${data.serviceLabel} (${budgetRange})`,
        bodyHtml,
        footerNotice: 'Notificación interna para soluciones comerciales y arquitectura Dreamtek.',
    });
    return { subject, text, html };
}
/**
 * Dispatches Quote Notification Email (FC 050)
 */
async function sendQuoteNotificationEmail(data) {
    const content = buildQuoteNotificationEmail(data);
    await sendMail({
        to: exports.OFFICIAL_SENDER,
        subject: content.subject,
        text: content.text,
        html: content.html,
        from: exports.OFFICIAL_SOLUTIONS_FROM,
    });
}
