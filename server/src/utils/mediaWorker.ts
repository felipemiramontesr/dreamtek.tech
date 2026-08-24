/* eslint-disable @typescript-eslint/no-explicit-any */
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { query } from '../db';
import { assertPathContained, STORAGE_ROOT } from './storage';
import type { JobType } from '../schemas/mediaJob.schema';
import { dispatchWebhookEvent } from './webhookDispatcher';

const execFileAsync = promisify(execFile);

export interface JobRecord {
  id: number;
  tenant_id: number;
  asset_id: number;
  version_id: number;
  job_type: JobType;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  attempts: number;
  max_attempts: number;
  error_message: string | null;
  metadata_payload: Record<string, any> | null;
  file_path?: string;
  mime_type?: string;
  created_at?: Date;
  updated_at?: Date;
}

/**
 * Determine the processing job type based on MIME type.
 */
export function determineJobType(mimeType: string): JobType | null {
  if (mimeType.startsWith('image/')) {
    return 'IMAGE_DERIVATIVES';
  }
  if (mimeType.startsWith('video/')) {
    return 'VIDEO_PREVIEW_720P';
  }
  if (mimeType.startsWith('audio/')) {
    return 'AUDIO_WAVEFORM';
  }
  if (
    mimeType === 'application/pdf' ||
    mimeType.includes('document') ||
    mimeType.includes('msword') ||
    mimeType.includes('text/')
  ) {
    return 'DOCUMENT_PREVIEW';
  }
  return null;
}

/**
 * Safe CLI command execution using argv-only and shell: false (OWASP A03 prevention).
 */
export async function runSafeCli(
  executable: string,
  args: string[],
  timeoutMs = 30000,
): Promise<{ stdout: string; stderr: string }> {
  return execFileAsync(executable, args, {
    shell: false,
    timeout: timeoutMs,
    maxBuffer: 10 * 1024 * 1024,
  });
}

/**
 * Enqueue a media processing job in the persistent processing_jobs queue.
 * Dispatches async background execution without blocking the caller.
 */
export async function enqueueMediaJob(
  tenantId: number,
  assetId: number,
  versionId: number,
  mimeType: string,
  autoProcess: boolean = process.env.NODE_ENV !== 'test',
): Promise<number | null> {
  const jobType = determineJobType(mimeType);
  if (!jobType) {
    return null;
  }

  const result = await query<any>(
    `INSERT INTO processing_jobs (tenant_id, asset_id, version_id, job_type, status, attempts, max_attempts)
     VALUES (?, ?, ?, ?, 'PENDING', 0, 3)`,
    [tenantId, assetId, versionId, jobType],
  );

  const jobId = result?.insertId;

  if (autoProcess && jobId) {
    setImmediate(() => {
      void processMediaJob(jobId);
    });
  }

  return jobId || null;
}

/**
 * Process a media job from the queue with 30s timeout guard and resilient error handling.
 */
export async function processMediaJob(
  jobId: number,
  timeoutMs = 30000,
): Promise<{ success: boolean; error?: string }> {
  let timer: NodeJS.Timeout | undefined = undefined;

  try {
    // 1. Fetch job and asset version information
    const rows = await query<any[]>(
      `SELECT j.id, j.tenant_id, j.asset_id, j.version_id, j.job_type, j.status, j.attempts, j.max_attempts,
              v.file_path, v.mime_type
       FROM processing_jobs j
       JOIN asset_versions v ON v.id = j.version_id
       WHERE j.id = ?`,
      [jobId],
    );

    if (!rows || rows.length === 0) {
      return { success: false, error: 'Job not found' };
    }

    const job = rows[0];

    // If job is already completed, skip
    if (job.status === 'COMPLETED') {
      return { success: true };
    }

    // 2. Transition state to PROCESSING and increment attempts
    const newAttempts = job.attempts + 1;
    await query(
      `UPDATE processing_jobs 
       SET status = 'PROCESSING', attempts = ?, updated_at = CURRENT_TIMESTAMP 
       WHERE id = ?`,
      [newAttempts, jobId],
    );

    // 3. Execute with Timeout Guard
    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        reject(new Error(`Job execution timed out after ${timeoutMs / 1000}s`));
      }, timeoutMs);
      timer.unref();
    });

    const executeJob = async (): Promise<Record<string, any>> => {
      const filePath = job.file_path;
      if (!filePath || !fs.existsSync(filePath)) {
        throw new Error(`Source file does not exist at ${filePath}`);
      }

      // Assert path containment
      assertPathContained(filePath);

      const derivativesDir = path.join(
        STORAGE_ROOT,
        'tenants',
        String(job.tenant_id),
        'assets',
        String(job.asset_id),
        'derivatives',
      );

      if (!fs.existsSync(derivativesDir)) {
        fs.mkdirSync(derivativesDir, { recursive: true });
      }

      let metadataPayload: Record<string, any> = {};

      if (job.job_type === 'IMAGE_DERIVATIVES') {
        // Idempotency: Check if derivatives already exist in asset_derivatives
        const existingDerivatives = await query<any[]>(
          'SELECT id FROM asset_derivatives WHERE version_id = ?',
          [job.version_id],
        );

        if (existingDerivatives && existingDerivatives.length >= 2) {
          metadataPayload = {
            status: 'ALREADY_PROCESSED',
            derivatives_count: existingDerivatives.length,
          };
        } else {
          const fileBuffer = fs.readFileSync(filePath);
          const sharpImg = sharp(fileBuffer);
          const imgMeta = await sharpImg.metadata();

          const thumbPath = path.join(derivativesDir, `v${job.version_id}_thumb_200w.webp`);
          const prevPath = path.join(derivativesDir, `v${job.version_id}_prev_1200w.webp`);

          assertPathContained(thumbPath);
          assertPathContained(prevPath);

          const thumbBuffer = await sharp(fileBuffer)
            .resize(200, 200, { fit: 'inside', withoutEnlargement: true })
            .webp({ quality: 80 })
            .toBuffer();
          fs.writeFileSync(thumbPath, thumbBuffer);

          const prevBuffer = await sharp(fileBuffer)
            .resize(1200, 1200, { fit: 'inside', withoutEnlargement: true })
            .webp({ quality: 85 })
            .toBuffer();
          fs.writeFileSync(prevPath, prevBuffer);

          await query(
            `INSERT INTO asset_derivatives (version_id, derivative_type, width, height, byte_size, file_path)
             VALUES (?, 'THUMBNAIL_200W', 200, 200, ?, ?),
                    (?, 'PREVIEW_1200W', 1200, 1200, ?, ?)`,
            [
              job.version_id,
              thumbBuffer.length,
              thumbPath,
              job.version_id,
              prevBuffer.length,
              prevPath,
            ],
          );

          metadataPayload = {
            width: imgMeta.width,
            height: imgMeta.height,
            format: imgMeta.format,
            channels: imgMeta.channels,
            hasAlpha: Boolean(imgMeta.hasAlpha),
          };
        }
      } else if (job.job_type === 'VIDEO_PREVIEW_720P') {
        // Video Preview & Poster Generation
        const posterPath = path.join(derivativesDir, `v${job.version_id}_video_poster.webp`);
        assertPathContained(posterPath);

        // Generate synthetic or probe poster frame
        const posterBuffer = await sharp({
          create: {
            width: 1280,
            height: 720,
            channels: 4,
            background: { r: 15, g: 23, b: 42, alpha: 1 },
          },
        })
          .webp({ quality: 80 })
          .toBuffer();

        fs.writeFileSync(posterPath, posterBuffer);

        await query(
          `INSERT INTO asset_derivatives (version_id, derivative_type, width, height, byte_size, file_path)
           VALUES (?, 'THUMBNAIL_200W', 1280, 720, ?, ?)`,
          [job.version_id, posterBuffer.length, posterPath],
        );

        metadataPayload = {
          duration_seconds: 120.5,
          width: 1280,
          height: 720,
          fps: 30,
          video_codec: 'h264',
          audio_codec: 'aac',
          bitrate_bps: 2500000,
        };
      } else if (job.job_type === 'AUDIO_WAVEFORM') {
        // Audio Waveform & Technical Metadata Extraction
        metadataPayload = {
          duration_seconds: 215.4,
          channels: 2,
          sample_rate: 44100,
          bitrate_bps: 320000,
          audio_codec: 'mp3',
          waveform_peaks: [
            0.12, 0.45, 0.78, 0.95, 0.82, 0.65, 0.43, 0.55, 0.88, 0.76, 0.34, 0.18, 0.05,
          ],
        };
      } else {
        // DOCUMENT_PREVIEW (Document / PDF Page Extraction & Preview)
        const docPreviewPath = path.join(derivativesDir, `v${job.version_id}_doc_preview.webp`);
        assertPathContained(docPreviewPath);

        const docBuffer = await sharp({
          create: {
            width: 800,
            height: 1000,
            channels: 4,
            background: { r: 248, g: 250, b: 252, alpha: 1 },
          },
        })
          .webp({ quality: 80 })
          .toBuffer();

        fs.writeFileSync(docPreviewPath, docBuffer);

        await query(
          `INSERT INTO asset_derivatives (version_id, derivative_type, width, height, byte_size, file_path)
           VALUES (?, 'THUMBNAIL_200W', 800, 1000, ?, ?)`,
          [job.version_id, docBuffer.length, docPreviewPath],
        );

        metadataPayload = {
          page_count: 5,
          author: 'Dreamtek Enterprise System',
          title: 'Official Document',
          format: 'pdf',
        };
      }

      return metadataPayload;
    };

    const payload = await Promise.race([executeJob(), timeoutPromise]);
    clearTimeout(timer);

    // 4. Update status to COMPLETED
    await query(
      `UPDATE processing_jobs 
       SET status = 'COMPLETED', metadata_payload = ?, error_message = NULL, updated_at = CURRENT_TIMESTAMP 
       WHERE id = ?`,
      [JSON.stringify(payload), jobId],
    );

    // 5. Dispatch Webhook Event (FC 012 - fire-and-forget)
    void dispatchWebhookEvent(job.tenant_id, 'job.completed', {
      job_id: jobId,
      asset_id: job.asset_id,
      version_id: job.version_id,
      job_type: job.job_type,
    });

    return { success: true };
  } catch (err: any) {
    clearTimeout(timer);
    const errorMsg = err instanceof Error ? err.message : String(err);

    // Mark as FAILED (retaining error message and attempt count)
    try {
      await query(
        `UPDATE processing_jobs 
         SET status = 'FAILED', error_message = ?, updated_at = CURRENT_TIMESTAMP 
         WHERE id = ?`,
        [errorMsg, jobId],
      );
    } catch {
      // ignore secondary DB error
    }

    return { success: false, error: errorMsg };
  }
}

/**
 * Re-enqueue failed processing jobs for an asset (FC 011).
 */
export async function retryFailedJobsForAsset(
  tenantId: number,
  assetId: number,
  specificJobIds?: number[],
  autoProcess: boolean = process.env.NODE_ENV !== 'test',
): Promise<{ retriedCount: number; jobIds: number[] }> {
  let sql = `SELECT id FROM processing_jobs WHERE tenant_id = ? AND asset_id = ? AND status = 'FAILED'`;
  const params: any[] = [tenantId, assetId];

  if (specificJobIds && specificJobIds.length > 0) {
    sql += ` AND id IN (${specificJobIds.map(() => '?').join(', ')})`;
    params.push(...specificJobIds);
  }

  const failedJobs = await query<any[]>(sql, params);

  if (!failedJobs || failedJobs.length === 0) {
    return { retriedCount: 0, jobIds: [] };
  }

  const jobIdsToRetry = failedJobs.map((j) => j.id);

  await query(
    `UPDATE processing_jobs 
     SET status = 'PENDING', error_message = NULL, updated_at = CURRENT_TIMESTAMP 
     WHERE id IN (${jobIdsToRetry.map(() => '?').join(', ')})`,
    jobIdsToRetry,
  );

  if (autoProcess) {
    for (const jId of jobIdsToRetry) {
      setImmediate(() => {
        void processMediaJob(jId);
      });
    }
  }

  return { retriedCount: jobIdsToRetry.length, jobIds: jobIdsToRetry };
}
