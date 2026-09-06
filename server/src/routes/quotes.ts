import { Router, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import {
  createQuoteLeadSchema,
  evaluateQuoteMatrix,
} from '../schemas/quotes.schema.js';
import { query } from '../db.js';
import { logSecurityEvent } from '../middleware/auditLogger.js';
import { getTransporter } from './contact.js';

export const quotesRouter = Router();

/**
 * Helper to safely extract client IP behind proxies
 */
export const getQuoteClientIp = (req: Request): string => {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    return forwarded.split(',')[0].trim();
  }
  if (req.ip) {
    return req.ip;
  }
  if (req.socket?.remoteAddress) {
    return req.socket.remoteAddress;
  }
  return '127.0.0.1';
};

/**
 * Dedicated rate limiter for quote diagnostic funnel (C-039.5)
 * 10 requests per 15 minutes per IP
 */
export const quoteRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => getQuoteClientIp(req),
  message: {
    status: 'error',
    error: 'Too Many Requests',
    message: 'Has alcanzado el límite de solicitudes de cotización. Intenta más tarde.',
  },
});

quotesRouter.use(quoteRateLimiter);

/**
 * POST /api/v1/quotes
 * Registers a qualified quote diagnostic lead with server-side SSOT matrix validation
 */
quotesRouter.post('/', async (req: Request, res: Response): Promise<void> => {
  const parseResult = createQuoteLeadSchema.safeParse(req.body);

  if (!parseResult.success) {
    const errorMessages = parseResult.error.errors.map((e) => e.message).join(', ');
    res.status(400).json({
      status: 'error',
      error: 'Validation Error',
      message: errorMessages,
    });
    return;
  }

  const data = parseResult.data;

  // Server-side SSOT matrix evaluation (C-039.2)
  const matrixResult = evaluateQuoteMatrix(data.vertical, data.scale);
  if (!matrixResult) {
    res.status(400).json({
      status: 'error',
      error: 'Invalid Combination',
      message: 'La combinación de vertical y alcance seleccionada no es válida.',
    });
    return;
  }

  const clientIp = getQuoteClientIp(req);

  const requirementsJson = data.requirements ? JSON.stringify(data.requirements) : null;

  try {
    // Atomic UPSERT on email per C-039.1
    await query(
      `INSERT INTO \`leads\` (
        \`email\`, \`full_name\`, \`phone\`, \`company\`,
        \`project_vertical\`, \`complexity_level\`,
        \`estimated_budget_min\`, \`estimated_budget_max\`,
        \`estimated_weeks_min\`, \`estimated_weeks_max\`,
        \`requirements_payload\`, \`ip_address\`
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        \`full_name\` = VALUES(\`full_name\`),
        \`phone\` = VALUES(\`phone\`),
        \`company\` = VALUES(\`company\`),
        \`project_vertical\` = VALUES(\`project_vertical\`),
        \`complexity_level\` = VALUES(\`complexity_level\`),
        \`estimated_budget_min\` = VALUES(\`estimated_budget_min\`),
        \`estimated_budget_max\` = VALUES(\`estimated_budget_max\`),
        \`estimated_weeks_min\` = VALUES(\`estimated_weeks_min\`),
        \`estimated_weeks_max\` = VALUES(\`estimated_weeks_max\`),
        \`requirements_payload\` = VALUES(\`requirements_payload\`),
        \`ip_address\` = VALUES(\`ip_address\`),
        \`updated_at\` = NOW()`,
      [
        data.email,
        data.full_name,
        data.phone,
        data.company_name || null,
        data.vertical,
        data.scale,
        matrixResult.estimatedBudgetMin,
        matrixResult.estimatedBudgetMax,
        matrixResult.estimatedWeeksMin,
        matrixResult.estimatedWeeksMax,
        requirementsJson,
        clientIp,
      ],
    );

    // Security audit log with minimized PII (C-039.5)
    try {
      await logSecurityEvent(req, {
        eventType: 'QUOTE_LEAD_SUBMITTED',
        status: 'SUCCESS',
        details: `vertical=${data.vertical};scale=${data.scale}`,
      });
    } catch {
      // Non-blocking security audit failure
    }

    // Fail-open notification email dispatch (C-039.3)
    if (process.env.NODE_ENV === 'production' && process.env.SMTP_PASS) {
      getTransporter()
        .sendMail({
          from: '"Dreamtek Solutions" <hola@dreamtek.tech>',
          to: 'hola@dreamtek.tech',
          subject: `Nueva Cotización: ${matrixResult.serviceLabel} - ${data.full_name}`,
          html: `
            <h3>Nueva Solicitud de Cotización</h3>
            <p><strong>Vertical:</strong> ${matrixResult.serviceLabel} (${data.vertical})</p>
            <p><strong>Alcance:</strong> ${matrixResult.scaleLabel} (${data.scale})</p>
            <p><strong>Rango Estimado:</strong> $${matrixResult.estimatedBudgetMin.toLocaleString()} - $${matrixResult.estimatedBudgetMax.toLocaleString()} MXN</p>
            <p><strong>Plazo Estimado:</strong> ${matrixResult.estimatedWeeksMin} - ${matrixResult.estimatedWeeksMax} semanas</p>
            <p><strong>Contacto:</strong> ${data.full_name} (${data.email})</p>
            <p><strong>Teléfono:</strong> ${data.phone}</p>
            <p><strong>Empresa:</strong> ${data.company_name || 'N/A'}</p>
            <p><strong>Notas:</strong> ${data.notes || 'Ninguna'}</p>
          `,
        })
        .catch((mailErr: unknown) => {
          console.warn('⚠️ Non-blocking email dispatch warning in quote lead:', mailErr);
        });
    }

    res.status(201).json({
      status: 'success',
      message:
        'Estimación paramétrica registrada exitosamente. Un arquitecto de soluciones de Dreamtek revisará tus requerimientos y te contactará a la brevedad.',
      data: {
        vertical: data.vertical,
        scale: data.scale,
        service_label: matrixResult.serviceLabel,
        scale_label: matrixResult.scaleLabel,
        estimated_budget_min: matrixResult.estimatedBudgetMin,
        estimated_budget_max: matrixResult.estimatedBudgetMax,
        estimated_weeks_min: matrixResult.estimatedWeeksMin,
        estimated_weeks_max: matrixResult.estimatedWeeksMax,
        currency: 'MXN',
        disclaimer:
          'Estimación paramétrica orientativa sujeta a revisión de requerimientos técnicos detallados y formalización contractual.',
      },
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Error inesperado al registrar cotización.';
    res.status(500).json({
      status: 'error',
      message: errorMsg,
    });
  }
});
