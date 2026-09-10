import { z } from 'zod';
import { escapeHtml } from '../utils/crm.js';

export const SAT_RFC_REGEX = /^[A-Z&Ñ]{3,4}\d{6}[A-Z0-9]{3}$/i;
export const GENERIC_TAX_ID_REGEX = /^[a-zA-Z0-9\-_]{3,32}$/;

export const clientTaxProfileSchema = z
  .object({
    cfdi_use: z.string().trim().min(1).max(10).optional(),
    cfdiUse: z.string().trim().min(1).max(10).optional(),
    invoice_email: z.string().trim().email().max(255).optional(),
    invoiceEmail: z.string().trim().email().max(255).optional(),
    is_international: z.boolean().optional(),
    isInternational: z.boolean().optional(),
    legal_name: z.string().trim().min(1).max(255).optional(),
    legalName: z.string().trim().min(1).max(255).optional(),
    postal_code: z.string().trim().min(1).max(16).optional(),
    postalCode: z.string().trim().min(1).max(16).optional(),
    rfc: z.string().trim().toUpperCase(),
    tax_regime: z.string().trim().min(1).max(10).optional(),
    taxRegime: z.string().trim().min(1).max(10).optional(),
  })
  .refine(
    (data) => {
      const legalName = data.legal_name || data.legalName;
      const taxRegime = data.tax_regime || data.taxRegime;
      const cfdiUse = data.cfdi_use || data.cfdiUse;
      const postalCode = data.postal_code || data.postalCode;
      const invoiceEmail = data.invoice_email || data.invoiceEmail;
      return Boolean(legalName && taxRegime && cfdiUse && postalCode && invoiceEmail);
    },
    { message: 'Todos los campos fiscales (razón social, régimen, uso CFDI, C.P., email) son obligatorios' },
  )
  .refine(
    (data) => {
      const isIntl = data.is_international ?? data.isInternational ?? false;
      if (!isIntl) {
        return SAT_RFC_REGEX.test(data.rfc);
      }
      return GENERIC_TAX_ID_REGEX.test(data.rfc);
    },
    (data) => {
      const isIntl = data.is_international ?? data.isInternational ?? false;
      return {
        message: isIntl
          ? 'El identificador fiscal internacional (Tax ID) no es válido'
          : 'Para empresas nacionales el RFC debe cumplir el formato oficial válido del SAT (12 o 13 caracteres)',
        path: ['rfc'],
      };
    },
  )
  .transform((data) => {
    const rawLegalName = (data.legal_name || data.legalName) as string;
    const isIntl = Boolean(data.is_international || data.isInternational);
    const cfdi = (data.cfdi_use || data.cfdiUse) as string;
    const email = ((data.invoice_email || data.invoiceEmail) as string).toLowerCase();
    const cp = (data.postal_code || data.postalCode) as string;
    const regime = (data.tax_regime || data.taxRegime) as string;
    const escapedLegalName = escapeHtml(rawLegalName);
    return {
      cfdi_use: cfdi,
      cfdiUse: cfdi,
      invoice_email: email,
      invoiceEmail: email,
      is_international: isIntl,
      isInternational: isIntl,
      legal_name: escapedLegalName,
      legalName: escapedLegalName,
      postal_code: cp,
      postalCode: cp,
      rfc: data.rfc.trim().toUpperCase(),
      tax_regime: regime,
      taxRegime: regime,
    };
  });

export type ClientTaxProfileInput = z.infer<typeof clientTaxProfileSchema>;

export const taxInvoiceRequestSchema = z
  .object({
    invoice_notes: z.string().max(1000, 'Las notas no pueden exceder 1000 caracteres').optional().nullable(),
    invoiceNotes: z.string().max(1000, 'Las notas no pueden exceder 1000 caracteres').optional().nullable(),
  })
  .transform((data) => {
    const raw = (data.invoice_notes || data.invoiceNotes || '').trim();
    const safe = raw.length > 0 ? escapeHtml(raw) : null;
    return {
      invoice_notes: safe,
      invoiceNotes: safe,
    };
  });

export type TaxInvoiceRequestInput = z.infer<typeof taxInvoiceRequestSchema>;
export const requestInvoiceSchema = taxInvoiceRequestSchema;

export const adminUpdateTaxInvoiceSchema = z
  .object({
    cfdi_uuid: z.string().trim().max(64).optional().nullable(),
    cfdiUuid: z.string().trim().max(64).optional().nullable(),
    invoice_notes: z.string().max(2000).optional().nullable(),
    invoiceNotes: z.string().max(2000).optional().nullable(),
    status: z.enum(['REQUESTED', 'ISSUED', 'REJECTED']),
  })
  .transform((data) => {
    const rawUuid = (data.cfdi_uuid || data.cfdiUuid || '').trim();
    const rawNotes = (data.invoice_notes || data.invoiceNotes || '').trim();
    return {
      cfdi_uuid: rawUuid.length > 0 ? rawUuid : null,
      cfdiUuid: rawUuid.length > 0 ? rawUuid : null,
      invoice_notes: rawNotes.length > 0 ? escapeHtml(rawNotes) : null,
      invoiceNotes: rawNotes.length > 0 ? escapeHtml(rawNotes) : null,
      status: data.status,
    };
  });

export type AdminUpdateTaxInvoiceInput = z.infer<typeof adminUpdateTaxInvoiceSchema>;
export const adminUpdateInvoiceStatusSchema = adminUpdateTaxInvoiceSchema;
