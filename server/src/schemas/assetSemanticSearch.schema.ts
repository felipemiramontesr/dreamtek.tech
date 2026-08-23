import { z } from 'zod';

export const generateEmbeddingBodySchema = z.object({
  model_name: z
    .string()
    .trim()
    .min(2, 'El nombre del modelo debe tener al menos 2 caracteres.')
    .max(64, 'El nombre del modelo no puede exceder 64 caracteres.')
    .optional()
    .default('dreamtek-multimodal-v1'),
  force_refresh: z.boolean().optional().default(false),
});

export type GenerateEmbeddingBody = z.infer<typeof generateEmbeddingBodySchema>;

export const semanticSearchBodySchema = z.object({
  query: z
    .string()
    .trim()
    .min(2, 'La consulta de búsqueda semántica debe tener al menos 2 caracteres.')
    .max(500, 'La consulta no puede exceder 500 caracteres.'),
  min_score: z
    .number()
    .min(0, 'El umbral de similitud mínimo no puede ser menor a 0.0')
    .max(1, 'El umbral de similitud mínimo no puede ser mayor a 1.0')
    .optional()
    .default(0.55),
  limit: z
    .number()
    .int()
    .min(1, 'El límite mínimo es 1.')
    .max(50, 'El límite máximo es 50.')
    .optional()
    .default(10),
});

export type SemanticSearchBody = z.infer<typeof semanticSearchBodySchema>;

export const similarAssetsQuerySchema = z.object({
  min_score: z
    .string()
    .optional()
    .transform((val) => (val !== undefined ? parseFloat(val) : 0.55))
    .refine((val) => !isNaN(val) && val >= 0 && val <= 1, {
      message: 'min_score debe ser un número decimal entre 0.0 y 1.0',
    }),
  limit: z
    .string()
    .optional()
    .transform((val) => (val !== undefined ? parseInt(val, 10) : 10))
    .refine((val) => !isNaN(val) && val >= 1 && val <= 50, {
      message: 'limit debe ser un entero entre 1 y 50',
    }),
});

export type SimilarAssetsQuery = z.infer<typeof similarAssetsQuerySchema>;

export interface SemanticSearchResultItem {
  asset_id: number;
  title: string;
  mime_type: string;
  byte_size: number;
  similarity_score: number;
  matched_concepts: string[];
  thumbnail_url: string;
}

export interface SemanticSearchResponse {
  query: string;
  total_matches: number;
  results: SemanticSearchResultItem[];
}
