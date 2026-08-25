import fs from 'fs';
import path from 'path';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import supertest from 'supertest';
import express from 'express';
import jwt from 'jsonwebtoken';
import {
  createAudioCleaningBodySchema,
  listAudioCleaningQuerySchema,
  audioCleaningJobIdParamSchema,
  AudioCleaningProfileEnum,
} from '../../../server/src/schemas/audioCleaning.schema';
import {
  computeAcousticMetrics,
  generateAudioCleaningDerivative,
  createAudioCleaningJob,
  listAudioCleaningJobs,
  getAudioCleaningJobById,
  deleteAudioCleaningJob,
} from '../../../server/src/utils/audioCleaningEngine';
import { STORAGE_ROOT } from '../../../server/src/utils/storage';
import { audioCleaningRateLimiter } from '../../../server/src/middleware/rateLimiter';
import * as db from '../../../server/src/db';
import { evaluateAclPermission } from '../../../server/src/utils/acl';
import { dispatchWebhookEvent } from '../../../server/src/utils/webhookDispatcher';
import assetsRouter from '../../../server/src/routes/assets';

vi.mock('../../../server/src/db', () => ({
  query: vi.fn(),
  pool: {
    execute: vi.fn(),
    getConnection: vi.fn(),
  },
}));

vi.mock('../../../server/src/middleware/auditLogger', () => ({
  logSecurityEvent: vi.fn().mockResolvedValue(undefined),
  auditLogger: vi.fn((_req, _res, next) => next()),
}));

vi.mock('../../../server/src/utils/acl', () => ({
  evaluateAclPermission: vi.fn().mockResolvedValue({ allowed: true, reason: 'ADMIN_BYPASS' }),
}));

vi.mock('../../../server/src/utils/webhookDispatcher', () => ({
  dispatchWebhookEvent: vi.fn().mockResolvedValue(undefined),
}));

const TEST_SECRET = 'test-jwt-secret-key-super-secure-and-long-enough-for-hs512-compliance-testing';
process.env.JWT_SECRET = TEST_SECRET;

function makeToken(payload: { userId: number; role: string; tenantId: number }): string {
  return jwt.sign(
    {
      userId: payload.userId,
      uid: payload.userId,
      email: `${payload.role.toLowerCase()}@dreamtek.tech`,
      role: payload.role,
      tenantId: payload.tenantId,
    },
    TEST_SECRET,
    { algorithm: 'HS512', expiresIn: '1h' },
  );
}

describe('DAM AI Audio Cleaning & Background Noise Suppression (FC 022)', () => {
  const adminToken = makeToken({ userId: 1, role: 'ADMIN', tenantId: 100 });
  const clientToken = makeToken({ userId: 2, role: 'CLIENT', tenantId: 100 });

  let app: express.Express;

  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(evaluateAclPermission).mockResolvedValue({
      allowed: true,
      reason: 'ADMIN_BYPASS',
    });
    vi.mocked(dispatchWebhookEvent).mockResolvedValue(undefined);
    app = express();
    app.use(express.json());
    app.use('/api/v1/assets', assetsRouter);
  });

  describe('1. Zod Validation Schemas (audioCleaning.schema.ts)', () => {
    it('validates AudioCleaningProfileEnum values', () => {
      expect(AudioCleaningProfileEnum.safeParse('VOICE_ISOLATION').success).toBe(true);
      expect(AudioCleaningProfileEnum.safeParse('NOISE_REDUCTION').success).toBe(true);
      expect(AudioCleaningProfileEnum.safeParse('LOUDNESS_NORMALIZATION').success).toBe(true);
      expect(AudioCleaningProfileEnum.safeParse('DE_HUM').success).toBe(true);
      expect(AudioCleaningProfileEnum.safeParse('UNKNOWN_PROFILE').success).toBe(false);
    });

    it('validates createAudioCleaningBodySchema constraints', () => {
      const valid = createAudioCleaningBodySchema.safeParse({});
      expect(valid.success).toBe(true);
      if (valid.success) {
        expect(valid.data.profile).toBe('NOISE_REDUCTION');
        expect(valid.data.noise_reduction_db).toBe(12);
      }

      const invalidLowDb = createAudioCleaningBodySchema.safeParse({
        noise_reduction_db: 1,
      });
      expect(invalidLowDb.success).toBe(false);

      const invalidHighDb = createAudioCleaningBodySchema.safeParse({
        noise_reduction_db: 50,
      });
      expect(invalidHighDb.success).toBe(false);
    });

    it('validates listAudioCleaningQuerySchema and audioCleaningJobIdParamSchema', () => {
      const listParsed = listAudioCleaningQuerySchema.safeParse({
        limit: 20,
        offset: 0,
        profile: 'VOICE_ISOLATION',
      });
      expect(listParsed.success).toBe(true);

      const paramParsed = audioCleaningJobIdParamSchema.safeParse({
        id: 10,
        jobId: 5,
      });
      expect(paramParsed.success).toBe(true);

      const invalidParam = audioCleaningJobIdParamSchema.safeParse({
        id: -1,
        jobId: 0,
      });
      expect(invalidParam.success).toBe(false);
    });
  });

  describe('2. Audio Cleaning Engine Utilities (audioCleaningEngine.ts)', () => {
    it('computeAcousticMetrics calculates metrics for all profile variants', () => {
      const voiceMetrics = computeAcousticMetrics('VOICE_ISOLATION', 15);
      expect(voiceMetrics.profile_applied).toBe('VOICE_ISOLATION');
      expect(voiceMetrics.hum_attenuated_hz).toBeNull();
      expect(voiceMetrics.loudness_lufs).toBe(-16.5);

      const normMetrics = computeAcousticMetrics('LOUDNESS_NORMALIZATION', 10);
      expect(normMetrics.loudness_lufs).toBe(-14.0);

      const deHumMetrics = computeAcousticMetrics('DE_HUM', 12);
      expect(deHumMetrics.hum_attenuated_hz).toBe(60);
    });

    it('generateAudioCleaningDerivative generates WebP card', async () => {
      const derivativePath = await generateAudioCleaningDerivative(
        100,
        10,
        1,
        'NOISE_REDUCTION',
        12,
      );
      expect(derivativePath).toContain('derivatives');
    });

    it('createAudioCleaningJob creates record and dispatches webhook', async () => {
      vi.mocked(db.query).mockResolvedValueOnce({ insertId: 55 });

      const job = await createAudioCleaningJob(100, 10, 1, 'DE_HUM', 18);
      expect(job.id).toBe(55);
      expect(job.metrics_json.hum_attenuated_hz).toBe(60);
      expect(dispatchWebhookEvent).toHaveBeenCalled();
    });

    it('listAudioCleaningJobs returns records with and without profile filter', async () => {
      vi.mocked(db.query).mockResolvedValue([
        {
          id: 1,
          tenant_id: 100,
          asset_id: 10,
          version_id: 1,
          profile: 'NOISE_REDUCTION',
          noise_reduction_db: 12,
          status: 'COMPLETED',
          output_derivative_path: '/path/waveform.webp',
          metrics_json: JSON.stringify({ snr_before_db: 18.5, snr_after_db: 28.7 }),
          created_at: new Date().toISOString(),
        },
        {
          id: 2,
          tenant_id: 100,
          asset_id: 10,
          version_id: 1,
          profile: 'VOICE_ISOLATION',
          noise_reduction_db: 20,
          status: 'COMPLETED',
          output_derivative_path: null,
          metrics_json: { snr_before_db: 18.5, snr_after_db: 35.5 },
          created_at: new Date().toISOString(),
        },
      ]);

      const allJobs = await listAudioCleaningJobs(100, 10);
      expect(allJobs.length).toBe(2);
      expect(allJobs[0].metrics_json.snr_after_db).toBe(28.7);

      const filteredJobs = await listAudioCleaningJobs(100, 10, 10, 0, 'NOISE_REDUCTION');
      expect(filteredJobs.length).toBe(2);
    });

    it('getAudioCleaningJobById returns job or null', async () => {
      vi.mocked(db.query)
        .mockResolvedValueOnce([]) // not found
        .mockResolvedValueOnce([
          {
            id: 1,
            tenant_id: 100,
            asset_id: 10,
            version_id: 1,
            profile: 'NOISE_REDUCTION',
            noise_reduction_db: 12,
            status: 'COMPLETED',
            output_derivative_path: '/path/waveform.webp',
            metrics_json: JSON.stringify({ snr_before_db: 18.5 }),
          },
        ]);

      const notFound = await getAudioCleaningJobById(100, 10, 999);
      expect(notFound).toBeNull();

      const found = await getAudioCleaningJobById(100, 10, 1);
      expect(found).not.toBeNull();
      expect(found?.id).toBe(1);
    });

    it('deleteAudioCleaningJob handles missing job, missing file and real file unlinking', async () => {
      // 1. Not found
      vi.mocked(db.query).mockResolvedValueOnce([]);
      const notFound = await deleteAudioCleaningJob(100, 10, 999);
      expect(notFound).toBe(false);

      // 2. Found without path
      vi.mocked(db.query)
        .mockResolvedValueOnce([
          {
            id: 1,
            tenant_id: 100,
            asset_id: 10,
            version_id: 1,
            output_derivative_path: null,
            metrics_json: {},
          },
        ])
        .mockResolvedValueOnce([{ affectedRows: 1 }]);
      const deletedNoPath = await deleteAudioCleaningJob(100, 10, 1);
      expect(deletedNoPath).toBe(true);

      // 3. Found with real file
      const derivativesDir = path.join(STORAGE_ROOT, 'derivatives', 'tenant_100');
      fs.mkdirSync(derivativesDir, { recursive: true });
      const testFile = path.join(derivativesDir, `test_audio_clean_${Date.now()}.webp`);
      fs.writeFileSync(testFile, 'dummy-audio-clean-derivative');

      vi.mocked(db.query)
        .mockResolvedValueOnce([
          {
            id: 2,
            tenant_id: 100,
            asset_id: 10,
            version_id: 1,
            output_derivative_path: testFile,
            metrics_json: {},
          },
        ])
        .mockResolvedValueOnce([{ affectedRows: 1 }]);

      const deletedRealFile = await deleteAudioCleaningJob(100, 10, 2);
      expect(deletedRealFile).toBe(true);
      expect(fs.existsSync(testFile)).toBe(false);

      // 4. Found with non-existent file
      const missingFile = path.join(derivativesDir, `non_existent_audio_${Date.now()}.webp`);
      vi.mocked(db.query)
        .mockResolvedValueOnce([
          {
            id: 3,
            tenant_id: 100,
            asset_id: 10,
            version_id: 1,
            output_derivative_path: missingFile,
            metrics_json: {},
          },
        ])
        .mockResolvedValueOnce([{ affectedRows: 1 }]);

      const deletedMissingFile = await deleteAudioCleaningJob(100, 10, 3);
      expect(deletedMissingFile).toBe(true);
      expect(dispatchWebhookEvent).toHaveBeenCalled();
    });
  });

  describe('3. POST /api/v1/assets/:id/audio-cleaning', () => {
    it('returns 400 for invalid asset ID', async () => {
      const res = await supertest(app)
        .post('/api/v1/assets/invalid/audio-cleaning')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('ID de activo inválido');
    });

    it('returns 404 if asset not found in tenant', async () => {
      vi.mocked(db.query).mockResolvedValueOnce([]);

      const res = await supertest(app)
        .post('/api/v1/assets/999/audio-cleaning')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({});

      expect(res.status).toBe(404);
      expect(res.body.message).toContain('Activo digital no encontrado');
    });

    it('returns 400 if asset is not audio or video (Condition C-022.5)', async () => {
      vi.mocked(db.query).mockResolvedValueOnce([
        { id: 10, mime_type: 'image/png', current_version_id: 1 },
      ]);

      const res = await supertest(app)
        .post('/api/v1/assets/10/audio-cleaning')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('no es un archivo de audio o video compatible');
    });

    it('returns 403 if ACL denies EDIT permission', async () => {
      vi.mocked(db.query).mockResolvedValueOnce([
        { id: 10, mime_type: 'audio/mpeg', current_version_id: 1 },
      ]);
      vi.mocked(evaluateAclPermission).mockResolvedValueOnce({
        allowed: false,
        reason: 'FORBIDDEN',
      });

      const res = await supertest(app)
        .post('/api/v1/assets/10/audio-cleaning')
        .set('Authorization', `Bearer ${clientToken}`)
        .send({});

      expect(res.status).toBe(403);
      expect(res.body.message).toContain('Acceso denegado por política de control de acceso');
    });

    it('creates audio cleaning job for audio and video assets returning 201 Created', async () => {
      // Audio asset
      vi.mocked(db.query)
        .mockResolvedValueOnce([{ id: 10, mime_type: 'audio/wav', current_version_id: 1 }])
        .mockResolvedValueOnce({ insertId: 101 });

      const resAudio = await supertest(app)
        .post('/api/v1/assets/10/audio-cleaning')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          profile: 'NOISE_REDUCTION',
          noise_reduction_db: 15,
        });

      expect(resAudio.status).toBe(201);
      expect(resAudio.body.data.id).toBe(101);

      // Video asset
      vi.mocked(db.query)
        .mockResolvedValueOnce([{ id: 11, mime_type: 'video/mp4', current_version_id: 1 }])
        .mockResolvedValueOnce({ insertId: 102 });

      const resVideo = await supertest(app)
        .post('/api/v1/assets/11/audio-cleaning')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          profile: 'VOICE_ISOLATION',
          noise_reduction_db: 20,
        });

      expect(resVideo.status).toBe(201);
      expect(resVideo.body.data.id).toBe(102);
    });
  });

  describe('4. GET /api/v1/assets/:id/audio-cleaning', () => {
    it('returns 400 for invalid asset ID', async () => {
      const res = await supertest(app)
        .get('/api/v1/assets/0/audio-cleaning')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(400);
    });

    it('returns 404 if asset not found', async () => {
      vi.mocked(db.query).mockResolvedValueOnce([]);

      const res = await supertest(app)
        .get('/api/v1/assets/999/audio-cleaning')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(404);
    });

    it('returns 403 if ACL denies VIEW permission', async () => {
      vi.mocked(db.query).mockResolvedValueOnce([{ id: 10 }]);
      vi.mocked(evaluateAclPermission).mockResolvedValueOnce({
        allowed: false,
        reason: 'FORBIDDEN',
      });

      const res = await supertest(app)
        .get('/api/v1/assets/10/audio-cleaning')
        .set('Authorization', `Bearer ${clientToken}`);

      expect(res.status).toBe(403);
    });

    it('returns 200 with list of cleaning jobs', async () => {
      vi.mocked(db.query)
        .mockResolvedValueOnce([{ id: 10 }]) // asset query
        .mockResolvedValueOnce([
          {
            id: 1,
            tenant_id: 100,
            asset_id: 10,
            version_id: 1,
            profile: 'NOISE_REDUCTION',
            noise_reduction_db: 12,
            status: 'COMPLETED',
            output_derivative_path: '/path/waveform.webp',
            metrics_json: { snr_before_db: 18.5 },
          },
        ]);

      const res = await supertest(app)
        .get('/api/v1/assets/10/audio-cleaning?limit=10&offset=0&profile=NOISE_REDUCTION')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(1);
    });
  });

  describe('5. GET /api/v1/assets/:id/audio-cleaning/:jobId', () => {
    it('returns 400 for invalid params', async () => {
      const res = await supertest(app)
        .get('/api/v1/assets/invalid/audio-cleaning/0')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(400);
    });

    it('returns 403 if ACL denies VIEW permission', async () => {
      vi.mocked(evaluateAclPermission).mockResolvedValueOnce({
        allowed: false,
        reason: 'FORBIDDEN',
      });

      const res = await supertest(app)
        .get('/api/v1/assets/10/audio-cleaning/1')
        .set('Authorization', `Bearer ${clientToken}`);

      expect(res.status).toBe(403);
    });

    it('returns 404 if cleaning job not found', async () => {
      vi.mocked(db.query).mockResolvedValueOnce([]);

      const res = await supertest(app)
        .get('/api/v1/assets/10/audio-cleaning/999')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(404);
    });

    it('returns 200 with cleaning job detail on success', async () => {
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 1,
          tenant_id: 100,
          asset_id: 10,
          version_id: 1,
          profile: 'NOISE_REDUCTION',
          noise_reduction_db: 12,
          status: 'COMPLETED',
          output_derivative_path: '/path/waveform.webp',
          metrics_json: { snr_before_db: 18.5 },
        },
      ]);

      const res = await supertest(app)
        .get('/api/v1/assets/10/audio-cleaning/1')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(1);
    });
  });

  describe('6. DELETE /api/v1/assets/:id/audio-cleaning/:jobId', () => {
    it('returns 400 for invalid params', async () => {
      const res = await supertest(app)
        .delete('/api/v1/assets/0/audio-cleaning/invalid')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(400);
    });

    it('returns 403 if ACL denies EDIT permission', async () => {
      vi.mocked(evaluateAclPermission).mockResolvedValueOnce({
        allowed: false,
        reason: 'FORBIDDEN',
      });

      const res = await supertest(app)
        .delete('/api/v1/assets/10/audio-cleaning/1')
        .set('Authorization', `Bearer ${clientToken}`);

      expect(res.status).toBe(403);
    });

    it('returns 404 if job not found on delete', async () => {
      vi.mocked(db.query).mockResolvedValueOnce([]);

      const res = await supertest(app)
        .delete('/api/v1/assets/10/audio-cleaning/999')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(404);
    });

    it('deletes job and returns 200 OK on success', async () => {
      vi.mocked(db.query)
        .mockResolvedValueOnce([
          {
            id: 1,
            tenant_id: 100,
            asset_id: 10,
            version_id: 1,
            output_derivative_path: null,
            metrics_json: {},
          },
        ]) // get by id
        .mockResolvedValueOnce([{ affectedRows: 1 }]); // delete query

      const res = await supertest(app)
        .delete('/api/v1/assets/10/audio-cleaning/1')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.message).toContain('eliminada exitosamente');
    });
  });

  describe('7. Rate Limiting & Server Error Handlers', () => {
    it('handles unexpected exceptions with 500 status', async () => {
      vi.mocked(db.query).mockRejectedValue(new Error('Fatal DB Crash'));

      const res1 = await supertest(app)
        .post('/api/v1/assets/10/audio-cleaning')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({});
      expect(res1.status).toBe(500);

      const res2 = await supertest(app)
        .get('/api/v1/assets/10/audio-cleaning')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res2.status).toBe(500);

      const res3 = await supertest(app)
        .get('/api/v1/assets/10/audio-cleaning/1')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res3.status).toBe(500);

      const res4 = await supertest(app)
        .delete('/api/v1/assets/10/audio-cleaning/1')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res4.status).toBe(500);
    });

    it('triggers audioCleaningRateLimiter 429 response handler', async () => {
      const appLimit = express();
      appLimit.use(audioCleaningRateLimiter);
      appLimit.post('/test-audio-clean-limit', (_req, res) => res.json({ ok: true }));

      for (let i = 0; i < 30; i++) {
        await supertest(appLimit).post('/test-audio-clean-limit');
      }
      const resBlocked = await supertest(appLimit).post('/test-audio-clean-limit');
      expect(resBlocked.status).toBe(429);
      expect(resBlocked.body.message).toMatch(/Límite de operaciones de limpieza de audio/);
    });
  });
});
