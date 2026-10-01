"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.adminHandoverSchema = exports.adminUpsertHandoverSchema = exports.adminUpdateInvoiceStatusSchema = exports.adminUpdateTaxInvoiceSchema = exports.taxInvoiceRequestSchema = exports.requestInvoiceSchema = exports.clientTaxProfileSchema = void 0;
const zod_1 = require("zod");
const crm_js_1 = require("../utils/crm.js");
var tax_schema_js_1 = require("./tax.schema.js");
Object.defineProperty(exports, "clientTaxProfileSchema", { enumerable: true, get: function () { return tax_schema_js_1.clientTaxProfileSchema; } });
Object.defineProperty(exports, "requestInvoiceSchema", { enumerable: true, get: function () { return tax_schema_js_1.requestInvoiceSchema; } });
Object.defineProperty(exports, "taxInvoiceRequestSchema", { enumerable: true, get: function () { return tax_schema_js_1.taxInvoiceRequestSchema; } });
Object.defineProperty(exports, "adminUpdateTaxInvoiceSchema", { enumerable: true, get: function () { return tax_schema_js_1.adminUpdateTaxInvoiceSchema; } });
Object.defineProperty(exports, "adminUpdateInvoiceStatusSchema", { enumerable: true, get: function () { return tax_schema_js_1.adminUpdateInvoiceStatusSchema; } });
const httpsUrlSchema = zod_1.z
    .string()
    .trim()
    .max(500, 'URL no puede exceder 500 caracteres')
    .refine((url) => !url || /^https:\/\/[a-zA-Z0-9\-._~:/?#[\]@!$&'()*+,;=]+$/.test(url), 'La URL debe ser un enlace seguro comenzando con https://')
    .optional()
    .nullable();
exports.adminUpsertHandoverSchema = zod_1.z
    .object({
    access_credentials: zod_1.z.string().max(10000).optional().nullable(),
    accessCredentials: zod_1.z.string().max(10000).optional().nullable(),
    deployment_url: httpsUrlSchema,
    deploymentUrl: httpsUrlSchema,
    documentation_url: httpsUrlSchema,
    documentationUrl: httpsUrlSchema,
    handover_notes: zod_1.z.string().max(5000).optional().nullable(),
    handoverNotes: zod_1.z.string().max(5000).optional().nullable(),
    repository_url: httpsUrlSchema,
    repositoryUrl: httpsUrlSchema,
})
    .transform((data) => {
    const rawNotes = (data.handover_notes || data.handoverNotes || '').trim();
    const safeNotes = rawNotes.length > 0 ? (0, crm_js_1.escapeHtml)(rawNotes) : null;
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
exports.adminHandoverSchema = exports.adminUpsertHandoverSchema;
