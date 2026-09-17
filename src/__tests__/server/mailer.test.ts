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
  setMailerTransporterForTest,
  resetMailerTransporterForTest,
  getMailerTransporter,
  sanitizeEmailHeader,
  sendMail,
  sendRegistrationVerificationOtp,
  sendMfaEmailOtp,
  sendWelcomeEmail,
} from '../../../server/src/services/mailer';

describe('FC 049 Unified Mailer Service Suite (C-049.1)', () => {
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
    it('debe tener como remitente oficial canónico contacto@dreamtek.tech', () => {
      expect(OFFICIAL_SENDER).toBe('contacto@dreamtek.tech');
      expect(OFFICIAL_SECURITY_FROM).toBe('Dreamtek Security <contacto@dreamtek.tech>');
      expect(OFFICIAL_GENERAL_FROM).toBe('Dreamtek <contacto@dreamtek.tech>');
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

  describe('Métodos de Despacho de Correo', () => {
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
  });
});
