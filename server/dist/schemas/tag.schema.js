"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.assetMetadataSchema = exports.attachTagsSchema = exports.createTagSchema = void 0;
const zod_1 = require("zod");
exports.createTagSchema = zod_1.z.object({
    name: zod_1.z.string().trim().min(1).max(64),
    color: zod_1.z
        .string()
        .regex(/^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/, {
        message: 'Color must be a valid hex color code (e.g. #00bfff)',
    })
        .default('#00bfff')
        .optional(),
});
exports.attachTagsSchema = zod_1.z.object({
    tag_ids: zod_1.z.array(zod_1.z.number().int().positive()).min(1),
});
exports.assetMetadataSchema = zod_1.z.object({
    meta_key: zod_1.z.string().trim().min(1).max(64),
    meta_value: zod_1.z.string().max(2000),
    data_type: zod_1.z.enum(['STRING', 'NUMBER', 'BOOLEAN', 'JSON']).default('STRING'),
});
