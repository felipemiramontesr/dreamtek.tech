"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.videoChapterParamSchema = exports.updateVideoChapterBodySchema = exports.getVideoSummaryQuerySchema = exports.listVideoChaptersQuerySchema = exports.createVideoChaptersBodySchema = exports.SummaryTypeEnum = void 0;
const zod_1 = require("zod");
exports.SummaryTypeEnum = zod_1.z.enum([
    'EXECUTIVE',
    'DETAILED',
    'BULLET_POINTS',
    'TOPICS_LIST',
]);
/**
 * Body schema for generating/regenerating video chapters and summaries
 */
exports.createVideoChaptersBodySchema = zod_1.z.object({
    summary_type: exports.SummaryTypeEnum.default('EXECUTIVE'),
    target_chapter_count: zod_1.z.coerce.number().int().min(1).max(50).default(5),
    min_chapter_duration_seconds: zod_1.z.coerce.number().min(5).max(3600).default(10),
    custom_prompt: zod_1.z.string().max(500).optional(),
});
/**
 * Query schema for listing video chapters
 */
exports.listVideoChaptersQuerySchema = zod_1.z.object({
    limit: zod_1.z.coerce.number().int().min(1).max(100).default(50),
    offset: zod_1.z.coerce.number().int().min(0).default(0),
});
/**
 * Query schema for getting video summary
 */
exports.getVideoSummaryQuerySchema = zod_1.z.object({
    summary_type: exports.SummaryTypeEnum.optional(),
});
/**
 * Body schema for manually updating a video chapter
 */
exports.updateVideoChapterBodySchema = zod_1.z
    .object({
    title: zod_1.z.string().min(1).max(255).optional(),
    description: zod_1.z.string().max(2000).optional(),
    start_time_seconds: zod_1.z.coerce.number().min(0).optional(),
    end_time_seconds: zod_1.z.coerce.number().min(0).optional(),
    confidence: zod_1.z.coerce.number().min(0).max(1).optional(),
})
    .refine((data) => {
    if (data.start_time_seconds !== undefined &&
        data.end_time_seconds !== undefined) {
        return data.start_time_seconds < data.end_time_seconds;
    }
    return true;
}, {
    message: 'El tiempo de inicio (start_time_seconds) debe ser estrictamente menor al tiempo de fin (end_time_seconds).',
    path: ['end_time_seconds'],
});
/**
 * Params schema for chapter endpoints
 */
exports.videoChapterParamSchema = zod_1.z.object({
    id: zod_1.z.coerce.number().int().positive({ message: 'ID de activo inválido' }),
    chapterId: zod_1.z.coerce.number().int().positive({ message: 'ID de capítulo inválido' }).optional(),
});
