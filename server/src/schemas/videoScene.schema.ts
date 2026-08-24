import { z } from 'zod';

export const videoAnalysisBodySchema = z.object({
  force_refresh: z.boolean().optional().default(false),
  language_code: z.string().min(2).max(12).optional().default('es'),
  scene_duration_target_seconds: z.coerce.number().min(1).max(300).optional().default(10),
});

export type VideoAnalysisBodyInput = z.infer<typeof videoAnalysisBodySchema>;

export const videoScenesQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(100).optional().default(50),
  offset: z.coerce.number().int().nonnegative().optional().default(0),
});

export type VideoScenesQueryInput = z.infer<typeof videoScenesQuerySchema>;

export const videoTranscriptQuerySchema = z.object({
  speaker: z.string().max(64).optional(),
  language_code: z.string().min(2).max(12).optional(),
});

export type VideoTranscriptQueryInput = z.infer<typeof videoTranscriptQuerySchema>;

export const SearchTypeEnum = z.enum(['ALL', 'SCENES', 'TRANSCRIPT']);
export type SearchType = z.infer<typeof SearchTypeEnum>;

export const searchVideoScenesBodySchema = z.object({
  query: z.string().min(1, 'La consulta de búsqueda no puede estar vacía').max(255),
  search_type: SearchTypeEnum.optional().default('ALL'),
  limit: z.coerce.number().int().positive().max(50).optional().default(20),
  offset: z.coerce.number().int().nonnegative().optional().default(0),
});

export type SearchVideoScenesBodyInput = z.infer<typeof searchVideoScenesBodySchema>;
