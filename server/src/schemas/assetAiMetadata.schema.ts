import { z } from 'zod';

export const aiVisionStatusEnum = z.enum(['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED']);
export type AiVisionStatus = z.infer<typeof aiVisionStatusEnum>;

export const aiVisionProviderEnum = z.enum([
  'BUILTIN_VISION',
  'AWS_REKOGNITION',
  'OPENAI_CLIP',
  'GOOGLE_VISION',
]);
export type AiVisionProvider = z.infer<typeof aiVisionProviderEnum>;

export const analyzeAssetBodySchema = z.object({
  auto_tag: z.boolean().optional().default(false),
  min_confidence: z.number().min(0.0).max(1.0).optional().default(0.75),
  force_refresh: z.boolean().optional().default(false),
});

export type AnalyzeAssetInput = z.infer<typeof analyzeAssetBodySchema>;

export const applyAiTagsBodySchema = z.object({
  labels: z
    .array(z.string().trim().min(1, 'La etiqueta no puede estar vacía').max(50, 'Máximo 50 caracteres'))
    .min(1, 'Debe especificar al menos una etiqueta a aplicar')
    .max(50, 'Máximo 50 etiquetas por operación'),
});

export type ApplyAiTagsInput = z.infer<typeof applyAiTagsBodySchema>;

export interface AiVisionLabel {
  label: string;
  confidence: number;
  applied_as_tag?: boolean;
}

export interface AiVisionDominantColor {
  hex: string;
  name: string;
  percent: number;
}

export interface AiMetadataResult {
  asset_id: number;
  version_id: number;
  provider: AiVisionProvider;
  status: AiVisionStatus;
  labels: AiVisionLabel[];
  dominant_colors: AiVisionDominantColor[];
  detected_faces: number;
  detected_objects: string[];
  ocr_text: string | null;
  min_confidence_applied: number;
  auto_tagged: boolean;
  tags_applied_count: number;
  analyzed_at: string | null;
}
