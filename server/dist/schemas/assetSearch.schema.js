"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.assetSearchQuerySchema = void 0;
const zod_1 = require("zod");
exports.assetSearchQuerySchema = zod_1.z.object({
    q: zod_1.z.string().trim().max(255).optional(),
    workspace_id: zod_1.z.coerce.number().int().positive().optional(),
    collection_id: zod_1.z.coerce.number().int().positive().optional(),
    mime_type: zod_1.z.string().trim().max(100).optional(),
    tag: zod_1.z.string().trim().max(64).optional(),
    min_size: zod_1.z.coerce.number().int().nonnegative().optional(),
    max_size: zod_1.z.coerce.number().int().positive().optional(),
    from_date: zod_1.z.string().trim().optional(),
    to_date: zod_1.z.string().trim().optional(),
    sort_by: zod_1.z.enum(['created_at', 'title', 'byte_size']).default('created_at'),
    sort_order: zod_1.z
        .enum(['ASC', 'DESC', 'asc', 'desc'])
        .default('DESC')
        .transform((val) => val.toUpperCase()),
    page: zod_1.z.coerce.number().int().min(1).default(1),
    limit: zod_1.z.coerce.number().int().min(1).max(100).default(20),
});
