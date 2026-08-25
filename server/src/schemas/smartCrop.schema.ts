import { z } from 'zod';

export const SmartCropAspectRatioEnum = z.enum([
  '1:1',
  '16:9',
  '9:16',
  '4:5',
  '4:3',
  '3:2',
  '2:3',
]);
export type SmartCropAspectRatio = z.infer<typeof SmartCropAspectRatioEnum>;

export const SmartCropStrategyEnum = z.enum(['entropy', 'attention']);
export type SmartCropStrategy = z.infer<typeof SmartCropStrategyEnum>;

export const createSmartCropBodySchema = z.object({
  aspect_ratio: SmartCropAspectRatioEnum.default('1:1'),
  strategy: SmartCropStrategyEnum.default('entropy'),
  focal_x: z.number().min(0).max(1).optional(),
  focal_y: z.number().min(0).max(1).optional(),
  target_width: z.number().int().min(10).max(4096).optional(),
  target_height: z.number().int().min(10).max(4096).optional(),
});
export type CreateSmartCropBody = z.infer<typeof createSmartCropBodySchema>;

export const listSmartCropsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  aspect_ratio: SmartCropAspectRatioEnum.optional(),
});
export type ListSmartCropsQuery = z.infer<typeof listSmartCropsQuerySchema>;

export const smartCropParamSchema = z.object({
  id: z.coerce.number().int().positive('ID de activo inválido'),
  cropId: z.coerce.number().int().positive('ID de recorte inválido'),
});
export type SmartCropParams = z.infer<typeof smartCropParamSchema>;
