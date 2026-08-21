import { z } from 'zod';

export const JobTypeEnum = z.enum([
  'IMAGE_DERIVATIVES',
  'VIDEO_PREVIEW_720P',
  'AUDIO_WAVEFORM',
  'DOCUMENT_PREVIEW',
]);

export const JobStatusEnum = z.enum([
  'PENDING',
  'PROCESSING',
  'COMPLETED',
  'FAILED',
]);

export type JobType = z.infer<typeof JobTypeEnum>;
export type JobStatus = z.infer<typeof JobStatusEnum>;

export const retryJobsSchema = z.object({
  job_ids: z.array(z.number().int().positive()).optional(),
});

export type RetryJobsInput = z.infer<typeof retryJobsSchema>;
