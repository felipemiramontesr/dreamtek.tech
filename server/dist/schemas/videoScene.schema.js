"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.searchVideoScenesBodySchema = exports.SearchTypeEnum = exports.videoTranscriptQuerySchema = exports.videoScenesQuerySchema = exports.videoAnalysisBodySchema = void 0;
const zod_1 = require("zod");
exports.videoAnalysisBodySchema = zod_1.z.object({
    force_refresh: zod_1.z.boolean().optional().default(false),
    language_code: zod_1.z.string().min(2).max(12).optional().default('es'),
    scene_duration_target_seconds: zod_1.z.coerce.number().min(1).max(300).optional().default(10),
});
exports.videoScenesQuerySchema = zod_1.z.object({
    limit: zod_1.z.coerce.number().int().positive().max(100).optional().default(50),
    offset: zod_1.z.coerce.number().int().nonnegative().optional().default(0),
});
exports.videoTranscriptQuerySchema = zod_1.z.object({
    speaker: zod_1.z.string().max(64).optional(),
    language_code: zod_1.z.string().min(2).max(12).optional(),
});
exports.SearchTypeEnum = zod_1.z.enum(['ALL', 'SCENES', 'TRANSCRIPT']);
exports.searchVideoScenesBodySchema = zod_1.z.object({
    query: zod_1.z.string().min(1, 'La consulta de búsqueda no puede estar vacía').max(255),
    search_type: exports.SearchTypeEnum.optional().default('ALL'),
    limit: zod_1.z.coerce.number().int().positive().max(50).optional().default(20),
    offset: zod_1.z.coerce.number().int().nonnegative().optional().default(0),
});
