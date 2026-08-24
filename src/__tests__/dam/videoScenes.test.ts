/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import supertest from 'supertest';
import express, { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import {
  videoAnalysisBodySchema,
  videoScenesQuerySchema,
  videoTranscriptQuerySchema,
  searchVideoScenesBodySchema,
  SearchTypeEnum,
} from '../../../server/src/schemas/videoScene.schema';
import {
  generateDeterministicScenes,
  generateDeterministicTranscripts,
  analyzeVideoAsset,
  getVideoScenes,
  getVideoTranscript,
  searchVideoContent,
} from '../../../server/src/utils/videoAiEngine';
import { videoAiRateLimiter } from '../../../server/src/middleware/rateLimiter';
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

describe('DAM AI Semantic Video Scene Search & Speech Transcription (FC 020)', () => {
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

  describe('1. Zod Validation Schemas (videoScene.schema.ts)', () => {
    it('validates videoAnalysisBodySchema with defaults and custom options', () => {
      const parsedDefault = videoAnalysisBodySchema.safeParse({});
      expect(parsedDefault.success).toBe(true);
      if (parsedDefault.success) {
        expect(parsedDefault.data.force_refresh).toBe(false);
        expect(parsedDefault.data.language_code).toBe('es');
        expect(parsedDefault.data.scene_duration_target_seconds).toBe(10);
      }

      const parsedCustom = videoAnalysisBodySchema.safeParse({
        force_refresh: true,
        language_code: 'en-US',
        scene_duration_target_seconds: 15,
      });
      expect(parsedCustom.success).toBe(true);

      const parsedInvalid = videoAnalysisBodySchema.safeParse({
        scene_duration_target_seconds: 0,
      });
      expect(parsedInvalid.success).toBe(false);
    });

    it('validates videoScenesQuerySchema constraints', () => {
      const parsed = videoScenesQuerySchema.safeParse({ limit: 10, offset: 5 });
      expect(parsed.success).toBe(true);

      const parsedExcessive = videoScenesQuerySchema.safeParse({ limit: 200 });
      expect(parsedExcessive.success).toBe(false);
    });

    it('validates videoTranscriptQuerySchema and SearchTypeEnum', () => {
      const parsed = videoTranscriptQuerySchema.safeParse({
        speaker: 'Speaker 1',
        language_code: 'es',
      });
      expect(parsed.success).toBe(true);

      expect(SearchTypeEnum.safeParse('ALL').success).toBe(true);
      expect(SearchTypeEnum.safeParse('SCENES').success).toBe(true);
      expect(SearchTypeEnum.safeParse('TRANSCRIPT').success).toBe(true);
      expect(SearchTypeEnum.safeParse('INVALID').success).toBe(false);

      const searchParsed = searchVideoScenesBodySchema.safeParse({
        query: 'presentación',
        search_type: 'SCENES',
      });
      expect(searchParsed.success).toBe(true);

      const searchEmpty = searchVideoScenesBodySchema.safeParse({
        query: '',
      });
      expect(searchEmpty.success).toBe(false);
    });
  });

  describe('2. Video AI Engine Utilities (videoAiEngine.ts)', () => {
    it('generateDeterministicScenes generates scenes and keyframes with default parameters', async () => {
      const scenesDefault = await generateDeterministicScenes(100, 10, 1);
      expect(scenesDefault.length).toBeGreaterThan(0);

      const scenes = await generateDeterministicScenes(100, 10, 1, 30, 5);
      expect(scenes.length).toBeGreaterThan(0);
      expect(scenes[0].scene_index).toBe(1);
      expect(scenes[0].keyframe_path).toContain('derivatives');
      expect(scenes[0].visual_description.length).toBeGreaterThan(0);
    });

    it('generateDeterministicTranscripts supports default parameters and es/en languages', () => {
      const transcriptsDefault = generateDeterministicTranscripts(100, 10, 1);
      expect(transcriptsDefault.length).toBeGreaterThan(0);

      const transcriptsEs = generateDeterministicTranscripts(100, 10, 1, 60, 'es');
      expect(transcriptsEs.length).toBeGreaterThan(0);
      expect(transcriptsEs[0].language_code).toBe('es');
      expect(transcriptsEs[0].speaker_label).toBe('Speaker 1');

      const transcriptsEn = generateDeterministicTranscripts(100, 10, 1, 60, 'en');
      expect(transcriptsEn.length).toBeGreaterThan(0);
      expect(transcriptsEn[0].language_code).toBe('en');
    });

    it('analyzeVideoAsset handles default options when generating new scenes and transcripts', async () => {
      vi.mocked(db.query)
        .mockResolvedValueOnce([{ count: 0 }]) // scenes count
        .mockResolvedValueOnce([{ count: 0 }]) // transcripts count
        .mockResolvedValue([{ affectedRows: 1 }] as any);

      const res = await analyzeVideoAsset(100, 10, 1);
      expect(res.scene_count).toBeGreaterThan(0);
      expect(res.transcript_count).toBeGreaterThan(0);
      expect(res.duration_seconds).toBe(60);
    });

    it('analyzeVideoAsset returns existing counts when already analyzed and forceRefresh is false', async () => {
      vi.mocked(db.query)
        .mockResolvedValueOnce([{ count: 3 }]) // scenes count
        .mockResolvedValueOnce([{ count: 4 }]); // transcripts count

      const res = await analyzeVideoAsset(100, 10, 1, { forceRefresh: false, durationSeconds: 45 });
      expect(res.scene_count).toBe(3);
      expect(res.transcript_count).toBe(4);
      expect(res.duration_seconds).toBe(45);
    });

    it('analyzeVideoAsset deletes old records and executes full analysis when forceRefresh is true', async () => {
      vi.mocked(db.query)
        .mockResolvedValueOnce([{ count: 3 }]) // scenes count
        .mockResolvedValueOnce([{ count: 4 }]) // transcripts count
        .mockResolvedValueOnce([]) // DELETE scenes
        .mockResolvedValueOnce([]) // DELETE transcripts
        .mockResolvedValue([{ affectedRows: 1 }] as any); // INSERT queries

      const res = await analyzeVideoAsset(100, 10, 1, { forceRefresh: true, durationSeconds: 20 });
      expect(res.scene_count).toBeGreaterThan(0);
      expect(res.transcript_count).toBeGreaterThan(0);
      expect(dispatchWebhookEvent).toHaveBeenCalled();
    });

    it('getVideoScenes returns formatted scene rows with custom and default pagination', async () => {
      vi.mocked(db.query).mockResolvedValue([
        {
          id: 1,
          tenant_id: 100,
          asset_id: 10,
          version_id: 1,
          scene_index: 1,
          start_time_seconds: '0.00',
          end_time_seconds: '10.00',
          visual_description: 'Scene 1',
          detected_objects_json: '["person"]',
          confidence: '0.95',
          keyframe_path: '/storage/keyframe.webp',
        },
      ]);

      const scenesDefault = await getVideoScenes(100, 10);
      expect(scenesDefault.length).toBe(1);

      const scenes = await getVideoScenes(100, 10, 10, 0);
      expect(scenes.length).toBe(1);
      expect(scenes[0].start_time_seconds).toBe(0);
      expect(scenes[0].end_time_seconds).toBe(10);
      expect(scenes[0].confidence).toBe(0.95);
    });

    it('getVideoTranscript returns transcripts and handles default/filtered queries', async () => {
      vi.mocked(db.query).mockResolvedValue([
        {
          id: 1,
          tenant_id: 100,
          asset_id: 10,
          version_id: 1,
          segment_index: 1,
          start_time_seconds: '0.00',
          end_time_seconds: '12.00',
          transcript_text: 'Hello world',
          speaker_label: 'Speaker 1',
          confidence: '0.98',
          language_code: 'en',
        },
      ]);

      const transcriptsDefault = await getVideoTranscript(100, 10);
      expect(transcriptsDefault.length).toBe(1);

      const transcripts = await getVideoTranscript(100, 10, {
        speaker: 'Speaker 1',
        languageCode: 'en',
      });
      expect(transcripts.length).toBe(1);
      expect(transcripts[0].speaker_label).toBe('Speaker 1');
      expect(transcripts[0].start_time_seconds).toBe(0);
    });

    it('searchVideoContent searches scenes and transcripts with SCENES, TRANSCRIPT, and default options', async () => {
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          asset_id: 10,
          start_time_seconds: '0.00',
          end_time_seconds: '10.00',
          visual_description: 'Escena visual única',
          detected_objects_json: '["logo"]',
          title: 'Logo Video',
          mime_type: 'video/mp4',
        },
        {
          asset_id: 10,
          start_time_seconds: '10.00',
          end_time_seconds: '20.00',
          visual_description: 'Segunda escena visual del mismo activo',
          detected_objects_json: '["branding"]',
          title: 'Logo Video',
          mime_type: 'video/mp4',
        },
      ]);

      const sceneOnly = await searchVideoContent(100, 'visual', 'SCENES');
      expect(sceneOnly.length).toBe(1);
      expect(sceneOnly[0].match_type).toBe('SCENE');
      expect(sceneOnly[0].timestamp_matches.length).toBe(2);

      vi.mocked(db.query).mockResolvedValueOnce([
        {
          asset_id: 30,
          start_time_seconds: '0.00',
          end_time_seconds: '10.00',
          transcript_text: 'Texto exclusivo hablado',
          speaker_label: 'Speaker 1',
          title: 'Audio Video',
          mime_type: 'video/mp4',
        },
      ]);

      const transcriptOnly = await searchVideoContent(100, 'exclusivo', 'TRANSCRIPT');
      expect(transcriptOnly.length).toBe(1);
      expect(transcriptOnly[0].match_type).toBe('TRANSCRIPT');
    });

    it('searchVideoContent searches scenes and transcripts and returns hybrid ranking', async () => {
      vi.mocked(db.query)
        .mockResolvedValueOnce([
          {
            asset_id: 10,
            start_time_seconds: '0.00',
            end_time_seconds: '10.00',
            visual_description: 'Demostración de producto',
            detected_objects_json: '["product"]',
            title: 'Demo Video',
            mime_type: 'video/mp4',
          },
        ]) // sceneRows
        .mockResolvedValueOnce([
          {
            asset_id: 10,
            start_time_seconds: '5.00',
            end_time_seconds: '15.00',
            transcript_text: 'Demostración del sistema',
            speaker_label: 'Speaker 1',
            title: 'Demo Video',
            mime_type: 'video/mp4',
          },
          {
            asset_id: 20,
            start_time_seconds: '0.00',
            end_time_seconds: '12.00',
            transcript_text: 'Otra demostración',
            speaker_label: 'Speaker 2',
            title: 'Second Video',
            mime_type: 'video/mp4',
          },
        ]); // transcriptRows

      const results = await searchVideoContent(100, 'demostración', 'ALL', 10, 0);
      expect(results.length).toBe(2);
      expect(results[0].asset_id).toBe(10);
      expect(results[0].match_type).toBe('HYBRID');
      expect(results[0].relevance_score).toBe(1.0);
      expect(results[1].asset_id).toBe(20);
      expect(results[1].match_type).toBe('TRANSCRIPT');
    });
  });

  describe('3. POST /api/v1/assets/:id/video-analysis', () => {
    it('returns 400 for invalid asset ID', async () => {
      const res = await supertest(app)
        .post('/api/v1/assets/invalid/video-analysis')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('ID de activo inválido');
    });

    it('returns 404 if asset not found in tenant', async () => {
      vi.mocked(db.query).mockResolvedValueOnce([]);

      const res = await supertest(app)
        .post('/api/v1/assets/999/video-analysis')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({});

      expect(res.status).toBe(404);
      expect(res.body.message).toContain('Activo digital no encontrado');
    });

    it('returns 400 if asset is not a video file (Condition C-020.4)', async () => {
      vi.mocked(db.query).mockResolvedValueOnce([
        { id: 10, mime_type: 'image/png', current_version_id: 1 },
      ]);

      const res = await supertest(app)
        .post('/api/v1/assets/10/video-analysis')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('no es un archivo de video compatible');
    });

    it('returns 403 if ACL denies EDIT permission (Condition C-020.3)', async () => {
      vi.mocked(db.query).mockResolvedValueOnce([
        { id: 10, mime_type: 'video/mp4', current_version_id: 1 },
      ]);
      vi.mocked(evaluateAclPermission).mockResolvedValueOnce({
        allowed: false,
        reason: 'FORBIDDEN',
      });

      const res = await supertest(app)
        .post('/api/v1/assets/10/video-analysis')
        .set('Authorization', `Bearer ${clientToken}`)
        .send({});

      expect(res.status).toBe(403);
      expect(res.body.message).toContain('Acceso denegado por política de control de acceso');
    });

    it('executes video analysis and returns 200 OK on success', async () => {
      vi.mocked(db.query)
        .mockResolvedValueOnce([{ id: 10, mime_type: 'video/mp4', current_version_id: 1 }]) // asset query
        .mockResolvedValueOnce([{ count: 0 }]) // scenes count
        .mockResolvedValueOnce([{ count: 0 }]) // transcripts count
        .mockResolvedValue([{ affectedRows: 1 }] as any); // inserts

      const res = await supertest(app)
        .post('/api/v1/assets/10/video-analysis')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          force_refresh: false,
          language_code: 'es',
          scene_duration_target_seconds: 10,
        });

      expect(res.status).toBe(200);
      expect(res.body.data.scene_count).toBeGreaterThan(0);
      expect(res.body.data.transcript_count).toBeGreaterThan(0);
    });
  });

  describe('4. GET /api/v1/assets/:id/scenes', () => {
    it('returns 400 for invalid asset ID', async () => {
      const res = await supertest(app)
        .get('/api/v1/assets/0/scenes')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(400);
    });

    it('returns 404 if asset not found in tenant', async () => {
      vi.mocked(db.query).mockResolvedValueOnce([]);

      const res = await supertest(app)
        .get('/api/v1/assets/999/scenes')
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
        .get('/api/v1/assets/10/scenes')
        .set('Authorization', `Bearer ${clientToken}`);

      expect(res.status).toBe(403);
    });

    it('returns 200 with scenes list on success', async () => {
      vi.mocked(db.query)
        .mockResolvedValueOnce([{ id: 10 }]) // asset query
        .mockResolvedValueOnce([
          {
            id: 1,
            tenant_id: 100,
            asset_id: 10,
            version_id: 1,
            scene_index: 1,
            start_time_seconds: '0.00',
            end_time_seconds: '10.00',
            visual_description: 'Scene 1',
            detected_objects_json: '["screen"]',
            confidence: '0.95',
            keyframe_path: '/path/keyframe.webp',
          },
        ]);

      const res = await supertest(app)
        .get('/api/v1/assets/10/scenes?limit=10&offset=0')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(1);
    });
  });

  describe('5. GET /api/v1/assets/:id/transcript', () => {
    it('returns 400 for invalid asset ID', async () => {
      const res = await supertest(app)
        .get('/api/v1/assets/invalid/transcript')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(400);
    });

    it('returns 404 if asset not found in tenant', async () => {
      vi.mocked(db.query).mockResolvedValueOnce([]);

      const res = await supertest(app)
        .get('/api/v1/assets/999/transcript')
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
        .get('/api/v1/assets/10/transcript')
        .set('Authorization', `Bearer ${clientToken}`);

      expect(res.status).toBe(403);
    });

    it('returns 200 with transcript segments on success', async () => {
      vi.mocked(db.query)
        .mockResolvedValueOnce([{ id: 10 }]) // asset query
        .mockResolvedValueOnce([
          {
            id: 1,
            tenant_id: 100,
            asset_id: 10,
            version_id: 1,
            segment_index: 1,
            start_time_seconds: '0.00',
            end_time_seconds: '12.00',
            transcript_text: 'Test speech',
            speaker_label: 'Speaker 1',
            confidence: '0.98',
            language_code: 'es',
          },
        ]);

      const res = await supertest(app)
        .get('/api/v1/assets/10/transcript?speaker=Speaker 1&language_code=es')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(1);
    });
  });

  describe('6. POST /api/v1/assets/search/video-scenes', () => {
    it('returns 400 if query is invalid or empty', async () => {
      const res = await supertest(app)
        .post('/api/v1/assets/search/video-scenes')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ query: '' });

      expect(res.status).toBe(400);
    });

    it('searches video content and filters results by ACL VIEW', async () => {
      vi.mocked(db.query)
        .mockResolvedValueOnce([
          {
            asset_id: 10,
            start_time_seconds: '0.00',
            end_time_seconds: '10.00',
            visual_description: 'Scene match',
            detected_objects_json: '["logo"]',
            title: 'Video A',
            mime_type: 'video/mp4',
          },
        ]) // sceneRows
        .mockResolvedValueOnce([
          {
            asset_id: 20,
            start_time_seconds: '0.00',
            end_time_seconds: '10.00',
            transcript_text: 'Speech match',
            speaker_label: 'Speaker 1',
            title: 'Video B',
            mime_type: 'video/mp4',
          },
        ]); // transcriptRows

      // ACL allows asset 10, denies asset 20
      vi.mocked(evaluateAclPermission)
        .mockResolvedValueOnce({ allowed: true, reason: 'OK' })
        .mockResolvedValueOnce({ allowed: false, reason: 'DENIED' });

      const res = await supertest(app)
        .post('/api/v1/assets/search/video-scenes')
        .set('Authorization', `Bearer ${clientToken}`)
        .send({ query: 'match', search_type: 'ALL', limit: 10, offset: 0 });

      expect(res.status).toBe(200);
      expect(res.body.data.total_matches).toBe(1);
      expect(res.body.data.matches[0].asset_id).toBe(20);
    });
  });

  describe('7. Rate Limiting & Server Error Handlers', () => {
    it('handles unexpected exceptions with 500 status', async () => {
      vi.mocked(db.query).mockRejectedValue(new Error('Fatal DB Crash'));

      const res1 = await supertest(app)
        .post('/api/v1/assets/10/video-analysis')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({});
      expect(res1.status).toBe(500);

      const res2 = await supertest(app)
        .get('/api/v1/assets/10/scenes')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res2.status).toBe(500);

      const res3 = await supertest(app)
        .get('/api/v1/assets/10/transcript')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res3.status).toBe(500);

      const res4 = await supertest(app)
        .post('/api/v1/assets/search/video-scenes')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ query: 'test' });
      expect(res4.status).toBe(500);
    });

    it('triggers videoAiRateLimiter 429 response handler', async () => {
      const appLimit = express();
      appLimit.use(videoAiRateLimiter);
      appLimit.post('/test-video-limit', (_req, res) => res.json({ ok: true }));

      for (let i = 0; i < 30; i++) {
        await supertest(appLimit).post('/test-video-limit');
      }
      const resBlocked = await supertest(appLimit).post('/test-video-limit');
      expect(resBlocked.status).toBe(429);
      expect(resBlocked.body.message).toMatch(
        /Límite de operaciones de análisis y búsqueda de video/,
      );
    });
  });
});
