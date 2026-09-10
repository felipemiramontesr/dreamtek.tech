import { z } from 'zod';
import { escapeHtml } from '../utils/crm.js';

export {
  clientTaxProfileSchema,
  requestInvoiceSchema,
  taxInvoiceRequestSchema,
  adminUpdateTaxInvoiceSchema,
  adminUpdateInvoiceStatusSchema,
} from './tax.schema.js';

const httpsUrlSchema = z
  .string()
  .trim()
  .max(500, 'URL no puede exceder 500 caracteres')
  .refine(
    (url) => !url || /^https:\/\/[a-zA-Z0-9\-._~:/?#[\]@!$&'()*+,;=]+$/.test(url),
    'La URL debe ser un enlace seguro comenzando con https://',
  )
  .optional()
  .nullable();

export const adminUpsertHandoverSchema = z
  .object({
    access_credentials: z.string().max(10000).optional().nullable(),
    accessCredentials: z.string().max(10000).optional().nullable(),
    deployment_url: httpsUrlSchema,
    deploymentUrl: httpsUrlSchema,
    documentation_url: httpsUrlSchema,
    documentationUrl: httpsUrlSchema,
    handover_notes: z.string().max(5000).optional().nullable(),
    handoverNotes: z.string().max(5000).optional().nullable(),
    repository_url: httpsUrlSchema,
    repositoryUrl: httpsUrlSchema,
  })
  .transform((data) => {
    const rawNotes = (data.handover_notes || data.handoverNotes || '').trim();
    const safeNotes = rawNotes.length > 0 ? escapeHtml(rawNotes) : null;
    const creds = (data.access_credentials || data.accessCredentials || '').trim();
    const safeCreds = creds.length > 0 ? creds : null;
    const repo = data.repository_url || data.repositoryUrl || null;
    const deploy = data.deployment_url || data.deploymentUrl || null;
    const docs = data.documentation_url || data.documentationUrl || null;

    return {
      access_credentials: safeCreds,
      accessCredentials: safeCreds,
      deployment_url: deploy,
      deploymentUrl: deploy,
      documentation_url: docs,
      documentationUrl: docs,
      handover_notes: safeNotes,
      handoverNotes: safeNotes,
      repository_url: repo,
      repositoryUrl: repo,
    };
  });

export type AdminUpsertHandoverInput = z.infer<typeof adminUpsertHandoverSchema>;
export const adminHandoverSchema = adminUpsertHandoverSchema;
