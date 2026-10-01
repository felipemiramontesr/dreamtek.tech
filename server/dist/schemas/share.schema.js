"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.shareTokenParamSchema = exports.createShareSchema = void 0;
const zod_1 = require("zod");
exports.createShareSchema = zod_1.z.object({
    permission: zod_1.z.enum(['VIEW', 'DOWNLOAD']).default('VIEW'),
    expires_in_days: zod_1.z.number().int().min(1).max(30).default(7),
    max_uses: zod_1.z.number().int().min(1).max(10000).optional(),
});
exports.shareTokenParamSchema = zod_1.z.object({
    token: zod_1.z.string().min(16).max(128),
});
