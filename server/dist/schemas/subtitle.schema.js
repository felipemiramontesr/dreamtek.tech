"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.subtitleParamSchema = exports.listSubtitlesQuerySchema = exports.createSubtitleBodySchema = exports.SubtitleCueInputSchema = exports.SubtitleLanguageEnum = exports.SubtitleFormatEnum = void 0;
const zod_1 = require("zod");
exports.SubtitleFormatEnum = zod_1.z.enum(['SRT', 'VTT', 'JSON']);
exports.SubtitleLanguageEnum = zod_1.z.enum([
    'es',
    'en',
    'fr',
    'de',
    'pt',
    'it',
    'ja',
    'zh',
]);
exports.SubtitleCueInputSchema = zod_1.z.object({
    start_time_seconds: zod_1.z.coerce.number().min(0, 'El tiempo inicial debe ser mayor o igual a 0'),
    end_time_seconds: zod_1.z.coerce.number().positive('El tiempo final debe ser mayor a 0'),
    text: zod_1.z.string().min(1, 'El texto del cue no puede estar vacío').max(1000),
    speaker: zod_1.z.string().max(100).optional(),
});
exports.createSubtitleBodySchema = zod_1.z.object({
    language_code: exports.SubtitleLanguageEnum.optional().default('es'),
    format: exports.SubtitleFormatEnum.optional().default('VTT'),
    cues: zod_1.z.array(exports.SubtitleCueInputSchema).optional(),
});
exports.listSubtitlesQuerySchema = zod_1.z.object({
    limit: zod_1.z.coerce.number().int().positive().max(100).optional().default(50),
    offset: zod_1.z.coerce.number().int().nonnegative().optional().default(0),
    language_code: exports.SubtitleLanguageEnum.optional(),
    format: exports.SubtitleFormatEnum.optional(),
});
exports.subtitleParamSchema = zod_1.z.object({
    id: zod_1.z.coerce.number().int().positive('ID de activo inválido'),
    subtitleId: zod_1.z.coerce.number().int().positive('ID de subtítulo inválido'),
});
