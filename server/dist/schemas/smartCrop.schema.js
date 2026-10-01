"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.smartCropParamSchema = exports.listSmartCropsQuerySchema = exports.createSmartCropBodySchema = exports.SmartCropStrategyEnum = exports.SmartCropAspectRatioEnum = void 0;
const zod_1 = require("zod");
exports.SmartCropAspectRatioEnum = zod_1.z.enum([
    '1:1',
    '16:9',
    '9:16',
    '4:5',
    '4:3',
    '3:2',
    '2:3',
]);
exports.SmartCropStrategyEnum = zod_1.z.enum(['entropy', 'attention']);
exports.createSmartCropBodySchema = zod_1.z.object({
    aspect_ratio: exports.SmartCropAspectRatioEnum.default('1:1'),
    strategy: exports.SmartCropStrategyEnum.default('entropy'),
    focal_x: zod_1.z.number().min(0).max(1).optional(),
    focal_y: zod_1.z.number().min(0).max(1).optional(),
    target_width: zod_1.z.number().int().min(10).max(4096).optional(),
    target_height: zod_1.z.number().int().min(10).max(4096).optional(),
});
exports.listSmartCropsQuerySchema = zod_1.z.object({
    limit: zod_1.z.coerce.number().int().min(1).max(100).default(50),
    offset: zod_1.z.coerce.number().int().min(0).default(0),
    aspect_ratio: exports.SmartCropAspectRatioEnum.optional(),
});
exports.smartCropParamSchema = zod_1.z.object({
    id: zod_1.z.coerce.number().int().positive('ID de activo inválido'),
    cropId: zod_1.z.coerce.number().int().positive('ID de recorte inválido'),
});
