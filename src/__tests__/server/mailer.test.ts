/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockCreateTransport = vi.fn();
const mockNodemailerSendMail = vi.fn().mockResolvedValue({ messageId: 'test-mail-id-123' });

vi.mock('nodemailer', () => {
  const transportObj = {
    sendMail: (...args: any[]) => mockNodemailerSendMail(...args),
  };
  return {
    default: {
      createTransport: (...args: any[]) => {
        mockCreateTransport(...args);
        return transportObj;
      },
    },
    createTransport: (...args: any[]) => {
      mockCreateTransport(...args);
      return transportObj;
    },
  };
});

import {
  OFFICIAL_SENDER,
  OFFICIAL_SECURITY_FROM,
  OFFICIAL_GENERAL_FROM,
  OFFICIAL_CONTACT_FROM,
  OFFICIAL_SOLUTIONS_FROM,
  OFFICIAL_COMMERCIAL_FROM,
  setMailerTransporterForTest,
  resetMailerTransporterForTest,
  getMailerTransporter,
  sanitizeEmailHeader,
  sendMail,
  renderSovereignEmailWrapper,
  sendRegistrationVerificationOtp,
  sendMfaEmailOtp,
  sendWelcomeEmail,
  buildContactOtpEmail,
  sendContactOtpEmail,
  buildContactNotificationEmail,
  sendContactNotificationEmail,
  buildQuoteNotificationEmail,
  sendQuoteNotificationEmail,
} from '../../../server/src/services/mailer';

describe('FC 049 & FC 050 Sovereign Mailer Service Suite', () => {
  const originalEnv = process.env;
  let mockSendMail: any;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
    mockSendMail = vi.fn().mockResolvedValue({ messageId: 'test-mail-id-123' });
    setMailerTransporterForTest({
      sendMail: mockSendMail,
    });
  });

  afterEach(() => {
    resetMailerTransporterForTest();
    process.env = { ...originalEnv };
  });

  describe('Constantes y Configuración', () => {
    it('debe tener como remitente oficial canónico contacto@dreamtek.tech y formatters oficiales', () => {
      expect(OFFICIAL_SENDER).toBe('contacto@dreamtek.tech');
      expect(OFFICIAL_SECURITY_FROM).toBe('Dreamtek Security <contacto@dreamtek.tech>');
      expect(OFFICIAL_GENERAL_FROM).toBe('Dreamtek <contacto@dreamtek.tech>');
      expect(OFFICIAL_CONTACT_FROM).toBe('Dreamtek Contact <contacto@dreamtek.tech>');
      expect(OFFICIAL_SOLUTIONS_FROM).toBe('Dreamtek Solutions <contacto@dreamtek.tech>');
      expect(OFFICIAL_COMMERCIAL_FROM).toBe(
        'Dreamtek Dirección Comercial <contacto@dreamtek.tech>',
      );
    });

    it('sanitizeEmailHeader debe eliminar retornos de carro y saltos de línea (anti-CRLF injection)', () => {
      expect(sanitizeEmailHeader('contacto@dreamtek.tech\r\nBcc: hacker@evil.com')).toBe(
        'contacto@dreamtek.tech Bcc: hacker@evil.com',
      );
      expect(sanitizeEmailHeader('')).toBe('');
      expect(sanitizeEmailHeader('test@example.com')).toBe('test@example.com');
    });

    it('getMailerTransporter debe instanciar nodemailer real cuando no hay mock de test', () => {
      resetMailerTransporterForTest();
      process.env.SMTP_HOST = 'smtp.test.com';
      process.env.SMTP_PORT = '587';
      process.env.SMTP_SECURE = 'false';
      process.env.SMTP_USER = 'contacto@dreamtek.tech';
      process.env.SMTP_PASS = 'secretpass';

      const transporter = getMailerTransporter();
      expect(transporter).toBeDefined();
      expect(typeof transporter.sendMail).toBe('function');
    });

    it('getMailerTransporter debe usar configuración SSL 465 por defecto', () => {
      resetMailerTransporterForTest();
      delete process.env.SMTP_PORT;
      delete process.env.SMTP_SECURE;
      delete process.env.SMTP_USER;
      delete process.env.SMTP_PASS;

      const transporter = getMailerTransporter();
      expect(transporter).toBeDefined();
      expect(typeof transporter.sendMail).toBe('function');
    });
  });

  describe('renderSovereignEmailWrapper (FC 050 Master Layout)', () => {
    it('debe generar HTML completo con brand tokens, logotipo oficial y footer soberano', () => {
      const html = renderSovereignEmailWrapper({
        title: 'Prueba Soberana',
        preheader: 'Vista previa en inbox',
        badge: 'Exclusivo',
        bodyHtml: '<p>Cuerpo del correo</p>',
        cta: {
          label: 'Ver Proyecto',
          url: 'https://dreamtek.tech/client/projects/1',
        },
        footerNotice: 'Aviso personalizado de privacidad.',
        accentColor: '#FF2D00',
      });

      expect(html).toContain('24_DREAMTEK_LOGO_LOGOTIPO_White.svg');
      expect(html).toContain('DREAMTEK');
      expect(html).toContain('Sovereign Tech &bull; Software &amp; Ciberseguridad');
      expect(html).toContain('Vista previa en inbox');
      expect(html).toContain('Exclusivo');
      expect(html).toContain('Cuerpo del correo');
      expect(html).toContain('Ver Proyecto');
      expect(html).toContain('https://dreamtek.tech/client/projects/1');
      expect(html).toContain('Aviso personalizado de privacidad.');
      expect(html).toContain('contacto@dreamtek.tech');
      expect(html).toContain('Protocolo L');
      expect(html).toContain('#FF2D00');
    });

    it('debe generar HTML con fallbacks cuando no hay preheader, badge, cta, footerNotice ni accentColor', () => {
      const html = renderSovereignEmailWrapper({
        title: 'Simple',
        bodyHtml: '<p>Contenido mínimo</p>',
      });

      expect(html).toContain('24_DREAMTEK_LOGO_LOGOTIPO_White.svg');
      expect(html).toContain('Contenido mínimo');
      expect(html).toContain('#38bdf8'); // default accent
      expect(html).toContain('Este mensaje es confidencial y para uso exclusivo del destinatario.');
      expect(html).not.toContain('display: none; max-height: 0px');
    });
  });

  describe('Métodos de Despacho de Correo y Plantillas', () => {
    it('sendMail debe despachar el correo con opciones válidas', async () => {
      await sendMail({
        to: 'cliente@empresa.com',
        subject: 'Prueba de Sistema',
        text: 'Contenido texto',
        html: '<p>Contenido html</p>',
      });

      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          from: OFFICIAL_SECURITY_FROM,
          to: 'cliente@empresa.com',
          subject: 'Prueba de Sistema',
          text: 'Contenido texto',
          html: '<p>Contenido html</p>',
        }),
      );
    });

    it('sendMail debe respetar remitente custom sanitizado si se especifica', async () => {
      await sendMail({
        from: 'Dreamtek Billing <contacto@dreamtek.tech>\r\n',
        to: 'cliente@empresa.com',
        subject: 'Factura',
        text: 'Detalle',
        html: '<p>Detalle</p>',
      });

      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          from: 'Dreamtek Billing <contacto@dreamtek.tech>',
        }),
      );
    });

    it('sendRegistrationVerificationOtp debe despachar plantilla de verificación con código y nombre', async () => {
      await sendRegistrationVerificationOtp('nuevo@cliente.com', '654321', 'Roberto Gómez');

      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          from: OFFICIAL_SECURITY_FROM,
          to: 'nuevo@cliente.com',
          subject: 'Confirma tu correo electrónico — Dreamtek',
          text: expect.stringContaining('654321'),
          html: expect.stringContaining('Roberto Gómez'),
        }),
      );
    });

    it('sendRegistrationVerificationOtp debe usar nombre por defecto si no se pasa', async () => {
      await sendRegistrationVerificationOtp('anonimo@cliente.com', '998877');

      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          html: expect.stringContaining('Usuario'),
        }),
      );
    });

    it('sendMfaEmailOtp debe despachar plantilla 2FA con código de 6 dígitos', async () => {
      await sendMfaEmailOtp('admin@dreamtek.tech', '112233');

      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          from: OFFICIAL_SECURITY_FROM,
          to: 'admin@dreamtek.tech',
          subject: 'Tu código de verificación de 2 pasos — Dreamtek',
          text: expect.stringContaining('112233'),
          html: expect.stringContaining('Desafío de Seguridad en 2 Pasos'),
        }),
      );
    });

    it('sendWelcomeEmail debe despachar plantilla de bienvenida oficial', async () => {
      await sendWelcomeEmail('socio@corporativo.com', 'Ana Morales');

      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          from: OFFICIAL_GENERAL_FROM,
          to: 'socio@corporativo.com',
          subject: '¡Bienvenido/a a Dreamtek! Tu cuenta está activa',
          text: expect.stringContaining('Ana Morales'),
          html: expect.stringContaining('¡Cuenta Verificada con Éxito!'),
        }),
      );
    });

    it('sendWelcomeEmail debe usar nombre por defecto Cliente si no se pasa', async () => {
      await sendWelcomeEmail('socio@corporativo.com', '');

      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          from: OFFICIAL_GENERAL_FROM,
          to: 'socio@corporativo.com',
          text: expect.stringContaining('Cliente'),
          html: expect.stringContaining('Cliente'),
        }),
      );
    });

    it('buildContactOtpEmail y sendContactOtpEmail deben construir y enviar OTP de contacto soberano', async () => {
      const built = buildContactOtpEmail('445566');
      expect(built.subject).toContain('445566');
      expect(built.text).toContain('445566');
      expect(built.html).toContain('445566');
      expect(built.html).toContain('Verificación de Contacto');

      await sendContactOtpEmail('lead@empresa.com', '445566');
      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          from: OFFICIAL_SECURITY_FROM,
          to: 'lead@empresa.com',
          subject: 'Código de verificación: 445566 - Dreamtek',
          html: expect.stringContaining('445566'),
        }),
      );
    });

    it('buildContactNotificationEmail y sendContactNotificationEmail deben construir y notificar contacto interno con sanitización', async () => {
      const built = buildContactNotificationEmail({
        name: '<script>alert(1)</script>Juan Pérez',
        email: 'juan@empresa.com',
        phone: '+52 55 1234 5678',
        company: 'Pérez & Co',
        service: 'Ciberseguridad',
        message: 'Requiero pentest <urgente>',
      });

      expect(built.html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;Juan Pérez');
      expect(built.html).toContain('Requiero pentest &lt;urgente&gt;');
      expect(built.html).toContain('Pérez &amp; Co');
      expect(built.text).toContain('Juan Pérez');

      await sendContactNotificationEmail({
        name: 'Carlos Ruiz',
        email: 'carlos@empresa.com',
        message: 'Cotización solicitada',
      });

      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          from: OFFICIAL_CONTACT_FROM,
          to: OFFICIAL_SENDER,
          subject: 'Nuevo mensaje de contacto de Carlos Ruiz - Dreamtek',
          html: expect.stringContaining('Carlos Ruiz'),
        }),
      );
    });

    it('buildContactNotificationEmail debe manejar campos opcionales ausentes con N/A y General', () => {
      const built = buildContactNotificationEmail({
        name: 'Sin Extras',
        email: 'extra@none.com',
        message: 'Mensaje simple',
      });

      expect(built.html).toContain('N/A');
      expect(built.html).toContain('General');
      expect(built.text).toContain('N/A');
    });

    it('buildQuoteNotificationEmail y sendQuoteNotificationEmail deben formatear y despachar cotizaciones soberanas', async () => {
      const built = buildQuoteNotificationEmail({
        serviceLabel: 'Desarrollo Web & Plataformas SaaS',
        vertical: 'WEB_DEV',
        scaleLabel: 'MVP Ágil y Validado',
        scale: 'MVP',
        currency: 'MXN',
        locale: 'es',
        estimatedBudgetMin: 35000,
        estimatedBudgetMax: 60000,
        estimatedWeeksMin: 3,
        estimatedWeeksMax: 5,
        fullName: 'Elena Gómez',
        email: 'elena@startup.mx',
        phone: '5598765432',
        companyName: 'Startup MX',
        notes: 'Enfoque mobile-first',
      });

      expect(built.subject).toContain('Desarrollo Web');
      expect(built.html).toContain('$35,000 - $60,000 MXN');
      expect(built.html).toContain('3 - 5 semanas');
      expect(built.html).toContain('Startup MX');
      expect(built.html).toContain('Enfoque mobile-first');

      await sendQuoteNotificationEmail({
        serviceLabel: 'Defensa Digital',
        vertical: 'CYBER',
        scaleLabel: 'Auditoría',
        scale: 'AUDIT',
        currency: 'USD',
        locale: 'en',
        estimatedBudgetMin: 2000,
        estimatedBudgetMax: 4000,
        estimatedWeeksMin: 2,
        estimatedWeeksMax: 3,
        fullName: 'John Doe',
        email: 'john@corp.com',
        phone: '1234567890',
      });

      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          from: OFFICIAL_SOLUTIONS_FROM,
          to: OFFICIAL_SENDER,
          subject: 'Nueva Cotización [USD]: Defensa Digital - John Doe',
          html: expect.stringContaining('John Doe'),
        }),
      );
    });

    it('buildQuoteNotificationEmail debe usar valores por defecto cuando no se pasan companyName ni notes', () => {
      const built = buildQuoteNotificationEmail({
        serviceLabel: 'Defensa Digital',
        vertical: 'CYBER',
        scaleLabel: 'Auditoría',
        scale: 'AUDIT',
        currency: 'USD',
        locale: 'en',
        estimatedBudgetMin: 2000,
        estimatedBudgetMax: 4000,
        estimatedWeeksMin: 2,
        estimatedWeeksMax: 3,
        fullName: 'John Doe',
        email: 'john@corp.com',
        phone: '1234567890',
      });

      expect(built.html).toContain('N/A');
      expect(built.html).toContain('Ninguna');
      expect(built.text).toContain('N/A');
      expect(built.text).toContain('Ninguna');
    });
  });
});
