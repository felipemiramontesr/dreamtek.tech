import { z } from 'zod';

export const SummaryTypeEnum = z.enum([
  'EXECUTIVE',
  'DETAILED',
  'BULLET_POINTS',
  'TOPICS_LIST',
]);

export type SummaryType = z.infer<typeof SummaryTypeEnum>;

/**
 * Body schema for generating/regenerating video chapters and summaries
 */
export const createVideoChaptersBodySchema = z.object({
  summary_type: SummaryTypeEnum.default('EXECUTIVE'),
  target_chapter_count: z.coerce.number().int().min(1).max(50).default(5),
  min_chapter_duration_seconds: z.coerce.number().min(5).max(3600).default(10),
  custom_prompt: z.string().max(500).optional(),
});

export type CreateVideoChaptersBody = z.infer<typeof createVideoChaptersBodySchema>;

/**
 * Query schema for listing video chapters
 */
export const listVideoChaptersQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export type ListVideoChaptersQuery = z.infer<typeof listVideoChaptersQuerySchema>;

/**
 * Query schema for getting video summary
 */
export const getVideoSummaryQuerySchema = z.object({
  summary_type: SummaryTypeEnum.optional(),
});

export type GetVideoSummaryQuery = z.infer<typeof getVideoSummaryQuerySchema>;

/**
 * Body schema for manually updating a video chapter
 */
export const updateVideoChapterBodySchema = z
  .object({
    title: z.string().min(1).max(255).optional(),
    description: z.string().max(2000).optional(),
    start_time_seconds: z.coerce.number().min(0).optional(),
    end_time_seconds: z.coerce.number().min(0).optional(),
    confidence: z.coerce.number().min(0).max(1).optional(),
  })
  .refine(
    (data) => {
      if (
        data.start_time_seconds !== undefined &&
        data.end_time_seconds !== undefined
      ) {
        return data.start_time_seconds < data.end_time_seconds;
      }
      return true;
    },
    {
      message:
        'El tiempo de inicio (start_time_seconds) debe ser estrictamente menor al tiempo de fin (end_time_seconds).',
      path: ['end_time_seconds'],
    },
  );

export type UpdateVideoChapterBody = z.infer<typeof updateVideoChapterBodySchema>;

/**
 * Params schema for chapter endpoints
 */
export const videoChapterParamSchema = z.object({
  id: z.coerce.number().int().positive({ message: 'ID de activo inválido' }),
  chapterId: z.coerce.number().int().positive({ message: 'ID de capítulo inválido' }).optional(),
});

export type VideoChapterParams = z.infer<typeof videoChapterParamSchema>;
