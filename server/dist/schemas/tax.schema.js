"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.adminUpdateInvoiceStatusSchema = exports.adminUpdateTaxInvoiceSchema = exports.requestInvoiceSchema = exports.taxInvoiceRequestSchema = exports.clientTaxProfileSchema = exports.GENERIC_TAX_ID_REGEX = exports.SAT_RFC_REGEX = void 0;
const zod_1 = require("zod");
const crm_js_1 = require("../utils/crm.js");
exports.SAT_RFC_REGEX = /^[A-Z&Ñ]{3,4}\d{6}[A-Z0-9]{3}$/i;
exports.GENERIC_TAX_ID_REGEX = /^[a-zA-Z0-9\-_]{3,32}$/;
exports.clientTaxProfileSchema = zod_1.z
    .object({
    cfdi_use: zod_1.z.string().trim().min(1).max(10).optional(),
    cfdiUse: zod_1.z.string().trim().min(1).max(10).optional(),
    currency: zod_1.z.string().trim().toUpperCase().optional(),
    invoice_email: zod_1.z.string().trim().email().max(255).optional(),
    invoiceEmail: zod_1.z.string().trim().email().max(255).optional(),
    is_international: zod_1.z.boolean().optional(),
    isInternational: zod_1.z.boolean().optional(),
    legal_name: zod_1.z.string().trim().min(1).max(255).optional(),
    legalName: zod_1.z.string().trim().min(1).max(255).optional(),
    locale: zod_1.z.string().trim().toLowerCase().optional(),
    postal_code: zod_1.z.string().trim().min(1).max(16).optional(),
    postalCode: zod_1.z.string().trim().min(1).max(16).optional(),
    rfc: zod_1.z.string().trim().toUpperCase(),
    tax_regime: zod_1.z.string().trim().min(1).max(10).optional(),
    taxRegime: zod_1.z.string().trim().min(1).max(10).optional(),
})
    .refine((data) => {
    const legalName = data.legal_name || data.legalName;
    const taxRegime = data.tax_regime || data.taxRegime;
    const cfdiUse = data.cfdi_use || data.cfdiUse;
    const postalCode = data.postal_code || data.postalCode;
    const invoiceEmail = data.invoice_email || data.invoiceEmail;
    return Boolean(legalName && taxRegime && cfdiUse && postalCode && invoiceEmail);
}, { message: 'Todos los campos fiscales (razón social, régimen, uso CFDI, C.P., email) son obligatorios' })
    .refine((data) => {
    const curr = data.currency?.toUpperCase();
    const loc = data.locale?.toLowerCase();
    // Derivación C-046.5: MXN o 'es' fuerza formato SAT RFC (no se puede saltar RFC en MXN/es)
    const isDomestic = curr === 'MXN' || loc === 'es' || (!data.is_international && !data.isInternational);
    if (isDomestic) {
        return exports.SAT_RFC_REGEX.test(data.rfc);
    }
    return exports.GENERIC_TAX_ID_REGEX.test(data.rfc);
}, (data) => {
    const curr = data.currency?.toUpperCase();
    const loc = data.locale?.toLowerCase();
    const isDomestic = curr === 'MXN' || loc === 'es' || (!data.is_international && !data.isInternational);
    return {
        message: isDomestic
            ? 'Para proyectos en moneda MXN o idioma español el RFC debe cumplir el formato oficial válido del SAT (12 o 13 caracteres)'
            : 'El identificador fiscal internacional (Tax ID) no es válido',
        path: ['rfc'],
    };
})
    .transform((data) => {
    const rawLegalName = (data.legal_name || data.legalName);
    const curr = data.currency?.toUpperCase();
    const loc = data.locale?.toLowerCase();
    const isDomestic = curr === 'MXN' || loc === 'es' || (!data.is_international && !data.isInternational);
    const isIntl = !isDomestic;
    const cfdi = (data.cfdi_use || data.cfdiUse);
    const email = (data.invoice_email || data.invoiceEmail).toLowerCase();
    const cp = (data.postal_code || data.postalCode);
    const regime = (data.tax_regime || data.taxRegime);
    const escapedLegalName = (0, crm_js_1.escapeHtml)(rawLegalName);
    return {
        cfdi_use: cfdi,
        cfdiUse: cfdi,
        currency: curr,
        invoice_email: email,
        invoiceEmail: email,
        is_international: isIntl,
        isInternational: isIntl,
        legal_name: escapedLegalName,
        legalName: escapedLegalName,
        locale: loc,
        postal_code: cp,
        postalCode: cp,
        rfc: data.rfc.trim().toUpperCase(),
        tax_regime: regime,
        taxRegime: regime,
    };
});
exports.taxInvoiceRequestSchema = zod_1.z
    .object({
    invoice_notes: zod_1.z.string().max(1000, 'Las notas no pueden exceder 1000 caracteres').optional().nullable(),
    invoiceNotes: zod_1.z.string().max(1000, 'Las notas no pueden exceder 1000 caracteres').optional().nullable(),
})
    .transform((data) => {
    const raw = (data.invoice_notes || data.invoiceNotes || '').trim();
    const safe = raw.length > 0 ? (0, crm_js_1.escapeHtml)(raw) : null;
    return {
        invoice_notes: safe,
        invoiceNotes: safe,
    };
});
exports.requestInvoiceSchema = exports.taxInvoiceRequestSchema;
exports.adminUpdateTaxInvoiceSchema = zod_1.z
    .object({
    cfdi_uuid: zod_1.z.string().trim().max(64).optional().nullable(),
    cfdiUuid: zod_1.z.string().trim().max(64).optional().nullable(),
    invoice_notes: zod_1.z.string().max(2000).optional().nullable(),
    invoiceNotes: zod_1.z.string().max(2000).optional().nullable(),
    status: zod_1.z.enum(['REQUESTED', 'ISSUED', 'REJECTED']),
})
    .transform((data) => {
    const rawUuid = (data.cfdi_uuid || data.cfdiUuid || '').trim();
    const rawNotes = (data.invoice_notes || data.invoiceNotes || '').trim();
    return {
        cfdi_uuid: rawUuid.length > 0 ? rawUuid : null,
        cfdiUuid: rawUuid.length > 0 ? rawUuid : null,
        invoice_notes: rawNotes.length > 0 ? (0, crm_js_1.escapeHtml)(rawNotes) : null,
        invoiceNotes: rawNotes.length > 0 ? (0, crm_js_1.escapeHtml)(rawNotes) : null,
        status: data.status,
    };
});
exports.adminUpdateInvoiceStatusSchema = exports.adminUpdateTaxInvoiceSchema;
