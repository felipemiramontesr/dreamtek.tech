"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.retryJobsSchema = exports.JobStatusEnum = exports.JobTypeEnum = void 0;
const zod_1 = require("zod");
exports.JobTypeEnum = zod_1.z.enum([
    'IMAGE_DERIVATIVES',
    'VIDEO_PREVIEW_720P',
    'AUDIO_WAVEFORM',
    'DOCUMENT_PREVIEW',
]);
exports.JobStatusEnum = zod_1.z.enum([
    'PENDING',
    'PROCESSING',
    'COMPLETED',
    'FAILED',
]);
exports.retryJobsSchema = zod_1.z.object({
    job_ids: zod_1.z.array(zod_1.z.number().int().positive()).optional(),
});
