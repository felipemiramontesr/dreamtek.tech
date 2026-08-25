import { z } from 'zod';

export const SubtitleFormatEnum = z.enum(['SRT', 'VTT', 'JSON']);
export type SubtitleFormat = z.infer<typeof SubtitleFormatEnum>;

export const SubtitleLanguageEnum = z.enum([
  'es',
  'en',
  'fr',
  'de',
  'pt',
  'it',
  'ja',
  'zh',
]);
export type SubtitleLanguage = z.infer<typeof SubtitleLanguageEnum>;

export const SubtitleCueInputSchema = z.object({
  start_time_seconds: z.coerce.number().min(0, 'El tiempo inicial debe ser mayor o igual a 0'),
  end_time_seconds: z.coerce.number().positive('El tiempo final debe ser mayor a 0'),
  text: z.string().min(1, 'El texto del cue no puede estar vacío').max(1000),
  speaker: z.string().max(100).optional(),
});

export type SubtitleCueInput = z.infer<typeof SubtitleCueInputSchema>;

export const createSubtitleBodySchema = z.object({
  language_code: SubtitleLanguageEnum.optional().default('es'),
  format: SubtitleFormatEnum.optional().default('VTT'),
  cues: z.array(SubtitleCueInputSchema).optional(),
});

export type CreateSubtitleBodyInput = z.infer<typeof createSubtitleBodySchema>;

export const listSubtitlesQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(100).optional().default(50),
  offset: z.coerce.number().int().nonnegative().optional().default(0),
  language_code: SubtitleLanguageEnum.optional(),
  format: SubtitleFormatEnum.optional(),
});

export type ListSubtitlesQueryInput = z.infer<typeof listSubtitlesQuerySchema>;

export const subtitleParamSchema = z.object({
  id: z.coerce.number().int().positive('ID de activo inválido'),
  subtitleId: z.coerce.number().int().positive('ID de subtítulo inválido'),
});

export type SubtitleParamInput = z.infer<typeof subtitleParamSchema>;
