/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import supertest from 'supertest';
import express from 'express';
import jwt from 'jsonwebtoken';
import fs from 'fs';
import path from 'path';
import assetsRouter from '../../../server/src/routes/assets';
import * as db from '../../../server/src/db';
import { STORAGE_ROOT } from '../../../server/src/utils/storage';
import {
  determineJobType,
  runSafeCli,
  enqueueMediaJob,
  processMediaJob,
  retryFailedJobsForAsset,
} from '../../../server/src/utils/mediaWorker';
import {
  JobTypeEnum,
  JobStatusEnum,
  retryJobsSchema,
} from '../../../server/src/schemas/mediaJob.schema';
import { jobsRateLimiter } from '../../../server/src/middleware/rateLimiter';

// Mock DB
vi.mock('../../../server/src/db', () => {
  const queryFn = vi.fn();
  const executeFn = vi.fn().mockResolvedValue([{ affectedRows: 1 }]);
  return {
    query: queryFn,
    pool: {
      execute: executeFn,
    },
  };
});

const TEST_SECRET = 'test-jwt-secret-key-super-secure-and-long-enough-for-hs512-compliance-testing';
process.env.JWT_SECRET = TEST_SECRET;

const app = express();
app.use(express.json());
app.use('/assets', assetsRouter);

describe('DAM Video/Audio Preview & Transcoding Worker (FC 011)', () => {
  const testSandbox = path.join(STORAGE_ROOT, 'test_media_sandbox');

  const adminToken = jwt.sign(
    { userId: 1, uid: 1, email: 'admin@dreamtek.tech', role: 'ADMIN', tenantId: 1 },
    TEST_SECRET,
    { algorithm: 'HS512' },
  );

  const clientToken = jwt.sign(
    { userId: 2, uid: 2, email: 'client@dreamtek.tech', role: 'CLIENT', tenantId: 1 },
    TEST_SECRET,
    { algorithm: 'HS512' },
  );

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(db.pool.execute).mockResolvedValue([{ affectedRows: 1 }] as any);
    if (!fs.existsSync(testSandbox)) {
      fs.mkdirSync(testSandbox, { recursive: true });
    }
  });

  afterEach(() => {
    if (fs.existsSync(testSandbox)) {
      fs.rmSync(testSandbox, { recursive: true, force: true });
    }
  });

  describe('1. Zod Schema & Helper Unit Tests', () => {
    it('should validate all JobTypeEnum and JobStatusEnum values', () => {
      const types = [
        'IMAGE_DERIVATIVES',
        'VIDEO_PREVIEW_720P',
        'AUDIO_WAVEFORM',
        'DOCUMENT_PREVIEW',
      ];
      for (const t of types) {
        expect(JobTypeEnum.safeParse(t).success).toBe(true);
      }
      expect(JobTypeEnum.safeParse('INVALID').success).toBe(false);

      const statuses = ['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED'];
      for (const s of statuses) {
        expect(JobStatusEnum.safeParse(s).success).toBe(true);
      }
      expect(JobStatusEnum.safeParse('INVALID').success).toBe(false);
    });

    it('should validate retryJobsSchema', () => {
      expect(retryJobsSchema.safeParse({ job_ids: [1, 2, 3] }).success).toBe(true);
      expect(retryJobsSchema.safeParse({}).success).toBe(true);
      expect(retryJobsSchema.safeParse({ job_ids: ['not-a-number'] }).success).toBe(false);
      expect(retryJobsSchema.safeParse({ job_ids: [-5] }).success).toBe(false);
    });

    it('determineJobType should correctly classify MIME types', () => {
      expect(determineJobType('image/png')).toBe('IMAGE_DERIVATIVES');
      expect(determineJobType('image/jpeg')).toBe('IMAGE_DERIVATIVES');
      expect(determineJobType('video/mp4')).toBe('VIDEO_PREVIEW_720P');
      expect(determineJobType('video/webm')).toBe('VIDEO_PREVIEW_720P');
      expect(determineJobType('audio/mp3')).toBe('AUDIO_WAVEFORM');
      expect(determineJobType('audio/wav')).toBe('AUDIO_WAVEFORM');
      expect(determineJobType('application/pdf')).toBe('DOCUMENT_PREVIEW');
      expect(
        determineJobType('application/vnd.openxmlformats-officedocument.wordprocessingml.document'),
      ).toBe('DOCUMENT_PREVIEW');
      expect(determineJobType('application/msword')).toBe('DOCUMENT_PREVIEW');
      expect(determineJobType('text/plain')).toBe('DOCUMENT_PREVIEW');
      expect(determineJobType('application/octet-stream')).toBeNull();
    });

    it('runSafeCli should execute command without shell', async () => {
      const res = await runSafeCli(process.execPath, ['-e', 'console.log("safe-cli-ok")']);
      expect(res.stdout).toContain('safe-cli-ok');
    });
  });

  describe('2. Media Worker Unit Tests', () => {
    it('enqueueMediaJob returns null for unhandled MIME type', async () => {
      const res = await enqueueMediaJob(1, 1, 1, 'application/octet-stream');
      expect(res).toBeNull();
    });

    it('enqueueMediaJob inserts job in queue and returns jobId', async () => {
      vi.mocked(db.query).mockResolvedValueOnce({ insertId: 101 } as any);

      const jobId = await enqueueMediaJob(1, 10, 5, 'image/png', false);
      expect(jobId).toBe(101);
    });

    it('enqueueMediaJob triggers background execution', async () => {
      vi.mocked(db.query).mockResolvedValueOnce({ insertId: 200 } as any);
      vi.mocked(db.query).mockResolvedValueOnce([]); // processMediaJob: not found

      const jobId = await enqueueMediaJob(1, 10, 5, 'image/png', true);
      expect(jobId).toBe(200);
      await new Promise((r) => setTimeout(r, 60));
    });

    it('processMediaJob returns error if job not found in DB', async () => {
      vi.mocked(db.query).mockResolvedValueOnce([]);

      const res = await processMediaJob(999);
      expect(res.success).toBe(false);
      expect(res.error).toBe('Job not found');
    });

    it('processMediaJob returns success if job is already COMPLETED', async () => {
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 1,
          status: 'COMPLETED',
          attempts: 1,
          max_attempts: 3,
          file_path: '/dummy.png',
        },
      ]);

      const res = await processMediaJob(1);
      expect(res.success).toBe(true);
    });

    it('processMediaJob handles missing source file gracefully', async () => {
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 1,
          tenant_id: 1,
          asset_id: 1,
          version_id: 1,
          job_type: 'IMAGE_DERIVATIVES',
          status: 'PENDING',
          attempts: 0,
          max_attempts: 3,
          file_path: path.join(STORAGE_ROOT, 'non_existent_file.png'),
          mime_type: 'image/png',
        },
      ]);
      // Update status to PROCESSING
      vi.mocked(db.query).mockResolvedValueOnce([{ affectedRows: 1 }] as any);
      // Update status to FAILED
      vi.mocked(db.query).mockResolvedValueOnce([{ affectedRows: 1 }] as any);

      const res = await processMediaJob(1);
      expect(res.success).toBe(false);
      expect(res.error).toContain('Source file does not exist');
    });

    it('processMediaJob processes IMAGE_DERIVATIVES idempotently if already processed', async () => {
      const dummyImgPath = path.join(testSandbox, 'test_img.png');
      fs.writeFileSync(dummyImgPath, Buffer.from('fake-png-data'));

      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 2,
          tenant_id: 1,
          asset_id: 1,
          version_id: 1,
          job_type: 'IMAGE_DERIVATIVES',
          status: 'PENDING',
          attempts: 0,
          max_attempts: 3,
          file_path: dummyImgPath,
          mime_type: 'image/png',
        },
      ]);
      // Update status to PROCESSING
      vi.mocked(db.query).mockResolvedValueOnce([{ affectedRows: 1 }] as any);
      // Query existing derivatives (>= 2 found)
      vi.mocked(db.query).mockResolvedValueOnce([{ id: 1 }, { id: 2 }]);
      // Update status to COMPLETED
      vi.mocked(db.query).mockResolvedValueOnce([{ affectedRows: 1 }] as any);

      const res = await processMediaJob(2);
      expect(res.success).toBe(true);
    });

    it('processMediaJob processes IMAGE_DERIVATIVES and generates new derivatives with sharp', async () => {
      const validPng = Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
        'base64',
      );
      const testImgPath = path.join(testSandbox, 'valid_image.png');
      fs.writeFileSync(testImgPath, validPng);

      // Ensure derivatives directory does not exist to exercise mkdirSync
      const derDir = path.join(STORAGE_ROOT, 'tenants', '1', 'assets', '10', 'derivatives');
      if (fs.existsSync(derDir)) {
        fs.rmSync(derDir, { recursive: true, force: true });
      }

      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 3,
          tenant_id: 1,
          asset_id: 10,
          version_id: 20,
          job_type: 'IMAGE_DERIVATIVES',
          status: 'PENDING',
          attempts: 0,
          max_attempts: 3,
          file_path: testImgPath,
          mime_type: 'image/png',
        },
      ]);
      // Update status to PROCESSING
      vi.mocked(db.query).mockResolvedValueOnce([{ affectedRows: 1 }] as any);
      // Query existing derivatives (0 found)
      vi.mocked(db.query).mockResolvedValueOnce([]);
      // Insert new derivatives
      vi.mocked(db.query).mockResolvedValueOnce([{ affectedRows: 2 }] as any);
      // Update status to COMPLETED
      vi.mocked(db.query).mockResolvedValueOnce([{ affectedRows: 1 }] as any);

      const res = await processMediaJob(3);
      expect(res.success).toBe(true);
    });

    it('processMediaJob processes VIDEO_PREVIEW_720P and generates poster frame', async () => {
      const videoDummyPath = path.join(testSandbox, 'test_video.mp4');
      fs.writeFileSync(videoDummyPath, 'fake-video-bytes');

      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 4,
          tenant_id: 1,
          asset_id: 11,
          version_id: 21,
          job_type: 'VIDEO_PREVIEW_720P',
          status: 'PENDING',
          attempts: 0,
          max_attempts: 3,
          file_path: videoDummyPath,
          mime_type: 'video/mp4',
        },
      ]);
      // Update to PROCESSING
      vi.mocked(db.query).mockResolvedValueOnce([{ affectedRows: 1 }] as any);
      // Insert derivative
      vi.mocked(db.query).mockResolvedValueOnce([{ affectedRows: 1 }] as any);
      // Update to COMPLETED
      vi.mocked(db.query).mockResolvedValueOnce([{ affectedRows: 1 }] as any);

      const res = await processMediaJob(4);
      expect(res.success).toBe(true);
    });

    it('processMediaJob processes AUDIO_WAVEFORM and extracts technical metadata', async () => {
      const audioDummyPath = path.join(testSandbox, 'test_audio.mp3');
      fs.writeFileSync(audioDummyPath, 'fake-audio-bytes');

      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 5,
          tenant_id: 1,
          asset_id: 12,
          version_id: 22,
          job_type: 'AUDIO_WAVEFORM',
          status: 'PENDING',
          attempts: 0,
          max_attempts: 3,
          file_path: audioDummyPath,
          mime_type: 'audio/mp3',
        },
      ]);
      // Update to PROCESSING
      vi.mocked(db.query).mockResolvedValueOnce([{ affectedRows: 1 }] as any);
      // Update to COMPLETED
      vi.mocked(db.query).mockResolvedValueOnce([{ affectedRows: 1 }] as any);

      const res = await processMediaJob(5);
      expect(res.success).toBe(true);
    });

    it('processMediaJob processes DOCUMENT_PREVIEW and generates thumbnail', async () => {
      const docDummyPath = path.join(testSandbox, 'test_doc.pdf');
      fs.writeFileSync(docDummyPath, 'fake-pdf-bytes');

      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 6,
          tenant_id: 1,
          asset_id: 13,
          version_id: 23,
          job_type: 'DOCUMENT_PREVIEW',
          status: 'PENDING',
          attempts: 0,
          max_attempts: 3,
          file_path: docDummyPath,
          mime_type: 'application/pdf',
        },
      ]);
      // Update to PROCESSING
      vi.mocked(db.query).mockResolvedValueOnce([{ affectedRows: 1 }] as any);
      // Insert derivative
      vi.mocked(db.query).mockResolvedValueOnce([{ affectedRows: 1 }] as any);
      // Update to COMPLETED
      vi.mocked(db.query).mockResolvedValueOnce([{ affectedRows: 1 }] as any);

      const res = await processMediaJob(6);
      expect(res.success).toBe(true);
    });

    it('processMediaJob handles execution timeout guard gracefully', async () => {
      const dummyPath = path.join(testSandbox, 'timeout_test.png');
      const validPng = Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
        'base64',
      );
      fs.writeFileSync(dummyPath, validPng);

      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 7,
          tenant_id: 1,
          asset_id: 14,
          version_id: 24,
          job_type: 'IMAGE_DERIVATIVES',
          status: 'PENDING',
          attempts: 0,
          max_attempts: 3,
          file_path: dummyPath,
          mime_type: 'image/png',
        },
      ]);
      // Update to PROCESSING
      vi.mocked(db.query).mockResolvedValueOnce([{ affectedRows: 1 }] as any);
      // Update to FAILED
      vi.mocked(db.query).mockResolvedValueOnce([{ affectedRows: 1 }] as any);

      // Pass timeout of 0ms to immediately trigger timeout
      const res = await processMediaJob(7, 0);
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/Job execution timed out|unsupported image format/);
    });

    it('processMediaJob handles non-Error rejection gracefully', async () => {
      vi.mocked(db.query).mockRejectedValueOnce('raw-string-rejection');

      const res = await processMediaJob(99);
      expect(res.success).toBe(false);
      expect(res.error).toBe('raw-string-rejection');
    });

    it('retryFailedJobsForAsset handles zero failed jobs', async () => {
      vi.mocked(db.query).mockResolvedValueOnce([]);

      const res = await retryFailedJobsForAsset(1, 10, undefined, false);
      expect(res.retriedCount).toBe(0);
      expect(res.jobIds).toEqual([]);
    });

    it('retryFailedJobsForAsset retries all or specific failed jobs and triggers background execution', async () => {
      // 1. Fetch failed jobs with specific IDs
      vi.mocked(db.query).mockResolvedValueOnce([{ id: 101 }, { id: 102 }]);
      // 2. Update status to PENDING
      vi.mocked(db.query).mockResolvedValueOnce([{ affectedRows: 2 }] as any);
      // 3. Background processMediaJob execution
      vi.mocked(db.query).mockResolvedValueOnce([]); // not found
      vi.mocked(db.query).mockResolvedValueOnce([]); // not found

      const res = await retryFailedJobsForAsset(1, 10, [101, 102], true);
      expect(res.retriedCount).toBe(2);
      expect(res.jobIds).toEqual([101, 102]);
      await new Promise((r) => setTimeout(r, 60));
    });
  });

  describe('3. GET /api/v1/assets/:id/jobs', () => {
    it('returns 400 on invalid asset ID parameter', async () => {
      const res = await supertest(app)
        .get('/assets/invalid-id/jobs')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('Los datos enviados en la solicitud');
    });

    it('returns 401 when unauthenticated', async () => {
      const res = await supertest(app).get('/assets/1/jobs');
      expect(res.status).toBe(401);
    });

    it('returns 404 when asset does not exist or is deleted', async () => {
      vi.mocked(db.query).mockResolvedValueOnce([]);

      const res = await supertest(app)
        .get('/assets/999/jobs')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(404);
      expect(res.body.message).toContain('Activo digital no encontrado');
    });

    it('returns 403 when ACL evaluation denies VIEW permission', async () => {
      // 1. Asset check
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 1,
          tenant_id: 1,
          workspace_id: 1,
          collection_id: null,
          status: 'ACTIVE',
          deleted_at: null,
        },
      ]);
      // 2. Mock evaluateAclPermission denying VIEW
      const aclModule = await import('../../../server/src/utils/acl');
      vi.spyOn(aclModule, 'evaluateAclPermission').mockResolvedValueOnce({
        allowed: false,
        reason: 'DEFAULT_DENY',
      });

      const res = await supertest(app)
        .get('/assets/1/jobs')
        .set('Authorization', `Bearer ${clientToken}`);

      expect(res.status).toBe(403);
      expect(res.body.message).toContain('Acceso denegado por política de control de acceso');
    });

    it('returns 200 with list of processing jobs (parsing JSON, null and unparsable metadata)', async () => {
      // 1. Asset check
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 1,
          tenant_id: 1,
          workspace_id: 1,
          collection_id: null,
          status: 'ACTIVE',
          deleted_at: null,
        },
      ]);
      // 2. Query processing jobs
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 10,
          asset_id: 1,
          version_id: 2,
          job_type: 'IMAGE_DERIVATIVES',
          status: 'COMPLETED',
          attempts: 1,
          max_attempts: 3,
          error_message: null,
          metadata_payload: JSON.stringify({ width: 1920, height: 1080 }),
          created_at: '2026-08-21T12:00:00.000Z',
          updated_at: '2026-08-21T12:00:02.000Z',
        },
        {
          id: 11,
          asset_id: 1,
          version_id: 2,
          job_type: 'AUDIO_WAVEFORM',
          status: 'PENDING',
          attempts: 0,
          max_attempts: 3,
          error_message: null,
          metadata_payload: '{unparsable_json',
          created_at: '2026-08-21T12:05:00.000Z',
          updated_at: '2026-08-21T12:05:00.000Z',
        },
        {
          id: 12,
          asset_id: 1,
          version_id: 2,
          job_type: 'DOCUMENT_PREVIEW',
          status: 'PENDING',
          attempts: 0,
          max_attempts: 3,
          error_message: null,
          metadata_payload: null,
          created_at: '2026-08-21T12:06:00.000Z',
          updated_at: '2026-08-21T12:06:00.000Z',
        },
      ]);

      const res = await supertest(app)
        .get('/assets/1/jobs')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(3);
      expect(res.body.data[0].metadata_payload).toEqual({ width: 1920, height: 1080 });
      expect(res.body.data[1].metadata_payload).toBe('{unparsable_json');
      expect(res.body.data[2].metadata_payload).toBeNull();
    });

    it('returns 500 when database error occurs', async () => {
      vi.mocked(db.query).mockRejectedValueOnce(new Error('DB Query Failure'));

      const res = await supertest(app)
        .get('/assets/1/jobs')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(500);
      expect(res.body.message).toContain('Error al obtener los trabajos de procesamiento');
    });
  });

  describe('4. POST /api/v1/assets/:id/jobs/retry', () => {
    it('returns 400 on invalid asset ID or invalid payload', async () => {
      const res1 = await supertest(app)
        .post('/assets/invalid/jobs/retry')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res1.status).toBe(400);

      const res2 = await supertest(app)
        .post('/assets/1/jobs/retry')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ job_ids: ['invalid'] });

      expect(res2.status).toBe(400);
    });

    it('returns 404 when asset does not exist', async () => {
      vi.mocked(db.query).mockResolvedValueOnce([]);

      const res = await supertest(app)
        .post('/assets/999/jobs/retry')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ job_ids: [1] });

      expect(res.status).toBe(404);
    });

    it('returns 403 when user lacks EDIT permission on asset', async () => {
      // 1. Asset check
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 1,
          tenant_id: 1,
          workspace_id: 1,
          collection_id: null,
          status: 'ACTIVE',
          deleted_at: null,
        },
      ]);
      // 2. ACL query (only VIEW, no EDIT for client)
      vi.mocked(db.query).mockResolvedValueOnce([
        { resource_type: 'ASSET', resource_id: 1, permission: 'VIEW', granted_by: 'ADMIN' },
      ]);

      const res = await supertest(app)
        .post('/assets/1/jobs/retry')
        .set('Authorization', `Bearer ${clientToken}`)
        .send({ job_ids: [1] });

      expect(res.status).toBe(403);
    });

    it('returns 200 and re-enqueues failed jobs successfully', async () => {
      // 1. Asset check (ADMIN bypasses ACL)
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 1,
          tenant_id: 1,
          workspace_id: 1,
          collection_id: null,
          status: 'ACTIVE',
          deleted_at: null,
        },
      ]);
      // 2. Query failed jobs in retryFailedJobsForAsset
      vi.mocked(db.query).mockResolvedValueOnce([{ id: 5 }]);
      // 3. Update status to PENDING
      vi.mocked(db.query).mockResolvedValueOnce([{ affectedRows: 1 }] as any);

      const res = await supertest(app)
        .post('/assets/1/jobs/retry')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ job_ids: [5] });

      expect(res.status).toBe(200);
      expect(res.body.data.retried_count).toBe(1);
      expect(res.body.data.job_ids).toEqual([5]);
    });

    it('returns 500 when database error occurs during retry', async () => {
      vi.mocked(db.query).mockRejectedValueOnce(new Error('Retry DB failure'));

      const res = await supertest(app)
        .post('/assets/1/jobs/retry')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({});

      expect(res.status).toBe(500);
      expect(res.body.message).toContain('Error al reintentar los trabajos de procesamiento');
    });
  });

  describe('5. GET /api/v1/assets/:id/derivatives', () => {
    it('returns 400 on invalid asset ID parameter', async () => {
      const res = await supertest(app)
        .get('/assets/invalid-id/derivatives')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(400);
    });

    it('returns 404 when asset does not exist', async () => {
      vi.mocked(db.query).mockResolvedValueOnce([]);

      const res = await supertest(app)
        .get('/assets/999/derivatives')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(404);
    });

    it('returns 403 when ACL evaluation denies VIEW permission', async () => {
      // 1. Asset check
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 1,
          tenant_id: 1,
          workspace_id: 1,
          collection_id: null,
          status: 'ACTIVE',
          deleted_at: null,
        },
      ]);
      // 2. Mock evaluateAclPermission denying VIEW
      const aclModule = await import('../../../server/src/utils/acl');
      vi.spyOn(aclModule, 'evaluateAclPermission').mockResolvedValueOnce({
        allowed: false,
        reason: 'DEFAULT_DENY',
      });

      const res = await supertest(app)
        .get('/assets/1/derivatives')
        .set('Authorization', `Bearer ${clientToken}`);

      expect(res.status).toBe(403);
    });

    it('returns 200 with list of derivatives for asset', async () => {
      // 1. Asset check (ADMIN bypasses ACL)
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 1,
          tenant_id: 1,
          workspace_id: 1,
          collection_id: null,
          status: 'ACTIVE',
          deleted_at: null,
        },
      ]);
      // 2. Query derivatives
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 101,
          version_id: 1,
          derivative_type: 'THUMBNAIL_200W',
          width: 200,
          height: 200,
          byte_size: 4096,
          file_path: '/thumb.webp',
          created_at: '2026-08-21T12:00:00.000Z',
        },
        {
          id: 102,
          version_id: 1,
          derivative_type: 'PREVIEW_1200W',
          width: 1200,
          height: 1200,
          byte_size: 24576,
          file_path: '/prev.webp',
          created_at: '2026-08-21T12:00:01.000Z',
        },
      ]);

      const res = await supertest(app)
        .get('/assets/1/derivatives')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(2);
      expect(res.body.data[0].derivative_type).toBe('THUMBNAIL_200W');
      expect(res.body.data[1].derivative_type).toBe('PREVIEW_1200W');
    });

    it('returns 500 when database error occurs during derivatives query', async () => {
      vi.mocked(db.query).mockRejectedValueOnce(new Error('Derivatives DB failure'));

      const res = await supertest(app)
        .get('/assets/1/derivatives')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(500);
      expect(res.body.message).toContain('Error al obtener las derivadas del activo');
    });
  });

  describe('6. Rate Limiter 429 Handlers', () => {
    it('triggers jobsRateLimiter 429 response handler', async () => {
      const appJobsLimit = express();
      appJobsLimit.use(jobsRateLimiter);
      appJobsLimit.get('/test-jobs', (_req, res) => res.json({ ok: true }));

      for (let i = 0; i < 100; i++) {
        await supertest(appJobsLimit).get('/test-jobs');
      }
      const resBlocked = await supertest(appJobsLimit).get('/test-jobs');
      expect(resBlocked.status).toBe(429);
      expect(resBlocked.body.message).toMatch(/Límite de operaciones de procesamiento multimedia/);
    });
  });
});
