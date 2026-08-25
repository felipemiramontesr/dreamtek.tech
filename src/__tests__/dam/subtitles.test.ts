import fs from 'fs';
import path from 'path';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import supertest from 'supertest';
import express from 'express';
import jwt from 'jsonwebtoken';
import {
  createSubtitleBodySchema,
  listSubtitlesQuerySchema,
  subtitleParamSchema,
  SubtitleFormatEnum,
  SubtitleLanguageEnum,
  SubtitleCueInputSchema,
} from '../../../server/src/schemas/subtitle.schema';
import {
  sanitizeCueText,
  formatTimeVTT,
  formatTimeSRT,
  translateLexicon,
  generateVTTContent,
  generateSRTContent,
  generateSubtitleDerivative,
  createAssetSubtitles,
  listAssetSubtitles,
  getAssetSubtitleById,
  deleteAssetSubtitle,
} from '../../../server/src/utils/subtitleEngine';
import { STORAGE_ROOT } from '../../../server/src/utils/storage';
import { subtitlesRateLimiter } from '../../../server/src/middleware/rateLimiter';
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

describe('DAM AI Automated Subtitling & Multi-Language Translation (FC 023)', () => {
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

  describe('1. Zod Validation Schemas (subtitle.schema.ts)', () => {
    it('validates SubtitleFormatEnum and SubtitleLanguageEnum', () => {
      expect(SubtitleFormatEnum.safeParse('VTT').success).toBe(true);
      expect(SubtitleFormatEnum.safeParse('SRT').success).toBe(true);
      expect(SubtitleFormatEnum.safeParse('JSON').success).toBe(true);
      expect(SubtitleFormatEnum.safeParse('TXT').success).toBe(false);

      const validLangs = ['es', 'en', 'fr', 'de', 'pt', 'it', 'ja', 'zh'];
      validLangs.forEach((lang) => {
        expect(SubtitleLanguageEnum.safeParse(lang).success).toBe(true);
      });
      expect(SubtitleLanguageEnum.safeParse('ru').success).toBe(false);
    });

    it('validates SubtitleCueInputSchema', () => {
      const validCue = SubtitleCueInputSchema.safeParse({
        start_time_seconds: 0,
        end_time_seconds: 3.5,
        text: 'Hola mundo',
        speaker: 'Speaker 1',
      });
      expect(validCue.success).toBe(true);

      const invalidStart = SubtitleCueInputSchema.safeParse({
        start_time_seconds: -1,
        end_time_seconds: 3,
        text: 'Test',
      });
      expect(invalidStart.success).toBe(false);

      const invalidEnd = SubtitleCueInputSchema.safeParse({
        start_time_seconds: 0,
        end_time_seconds: 0,
        text: 'Test',
      });
      expect(invalidEnd.success).toBe(false);

      const emptyText = SubtitleCueInputSchema.safeParse({
        start_time_seconds: 0,
        end_time_seconds: 5,
        text: '',
      });
      expect(emptyText.success).toBe(false);
    });

    it('validates createSubtitleBodySchema, listSubtitlesQuerySchema, subtitleParamSchema', () => {
      const defaultBody = createSubtitleBodySchema.safeParse({});
      expect(defaultBody.success).toBe(true);
      if (defaultBody.success) {
        expect(defaultBody.data.language_code).toBe('es');
        expect(defaultBody.data.format).toBe('VTT');
      }

      const listQuery = listSubtitlesQuerySchema.safeParse({
        limit: 10,
        offset: 0,
        language_code: 'en',
        format: 'SRT',
      });
      expect(listQuery.success).toBe(true);

      const params = subtitleParamSchema.safeParse({
        id: 15,
        subtitleId: 3,
      });
      expect(params.success).toBe(true);

      const invalidParams = subtitleParamSchema.safeParse({
        id: -1,
        subtitleId: 0,
      });
      expect(invalidParams.success).toBe(false);
    });
  });

  describe('2. Subtitle Engine Utilities (subtitleEngine.ts)', () => {
    it('sanitizeCueText cleans timing arrows and HTML tags', () => {
      expect(sanitizeCueText('')).toBe('');
      expect(sanitizeCueText('00:00:01 --> 00:00:05 test')).toBe('00:00:01 -> 00:00:05 test');
      expect(sanitizeCueText('<b>Important</b> <script>alert(1)</script> text')).toBe(
        'Important  text',
      );
    });

    it('formatTimeVTT and formatTimeSRT format timestamps correctly', () => {
      const vtt = formatTimeVTT(65.432);
      expect(vtt).toBe('00:01:05.432');

      const srt = formatTimeSRT(3665.008);
      expect(srt).toBe('01:01:05,008');
    });

    it('translateLexicon translates across all supported languages and handles fallbacks', () => {
      expect(translateLexicon('hola producto', 'es')).toBe('hola producto');
      expect(translateLexicon('', 'en')).toBe('');
      expect(translateLexicon('hola bienvenidos producto tecnologia gracias', 'en')).toBe(
        'hello welcome product technology thank you',
      );
      expect(translateLexicon('hola bienvenidos producto', 'fr')).toBe('bonjour bienvenue produit');
      expect(translateLexicon('hola bienvenidos producto', 'de')).toBe('hallo willkommen produkt');
      expect(translateLexicon('hola bienvenidos producto', 'pt')).toBe('olá bem-vindos produto');
      expect(translateLexicon('hola bienvenidos producto', 'it')).toBe('ciao benvenuti prodotto');
      expect(translateLexicon('hola bienvenidos producto', 'ja')).toBe('こんにちは ようこそ 製品');
      expect(translateLexicon('hola bienvenidos producto', 'zh')).toBe('你好 欢迎 产品');

      // Fallback for unknown words
      expect(translateLexicon('untranslatable sentence', 'fr')).toBe(
        '[FR] untranslatable sentence',
      );
    });

    it('generateVTTContent and generateSRTContent generate valid formatted tracks', () => {
      const cues = [
        {
          start_time_seconds: 0,
          end_time_seconds: 2.5,
          text: 'Hello world',
          speaker: 'Speaker 1',
        },
        {
          start_time_seconds: 2.5,
          end_time_seconds: 5.0,
          text: 'Second subtitle without speaker',
        },
      ];

      const vtt = generateVTTContent(cues);
      expect(vtt).toContain('WEBVTT');
      expect(vtt).toContain('<v Speaker 1>Hello world');

      const srt = generateSRTContent(cues);
      expect(srt).toContain('1\n00:00:00,000 --> 00:00:02,500\nSpeaker 1: Hello world');
      expect(srt).toContain('2\n00:00:02,500 --> 00:00:05,000\nSecond subtitle without speaker');
    });

    it('generateSubtitleDerivative writes VTT, SRT and JSON derivative files', async () => {
      const cues = [{ start_time_seconds: 0, end_time_seconds: 3, text: 'Test' }];

      const vttPath = await generateSubtitleDerivative(100, 10, 1, 'es', 'VTT', cues);
      expect(vttPath.endsWith('.vtt')).toBe(true);

      const srtPath = await generateSubtitleDerivative(100, 10, 1, 'en', 'SRT', cues);
      expect(srtPath.endsWith('.srt')).toBe(true);

      const jsonPath = await generateSubtitleDerivative(100, 10, 1, 'fr', 'JSON', cues);
      expect(jsonPath.endsWith('.json')).toBe(true);
    });

    it('createAssetSubtitles creates subtitles with custom cues and with database transcripts', async () => {
      // 1. With custom cues
      vi.mocked(db.query).mockResolvedValueOnce({ insertId: 77 });

      const customResult = await createAssetSubtitles(100, 10, 1, 'en', 'VTT', [
        { start_time_seconds: 0, end_time_seconds: 3, text: 'hola', speaker: 'Speaker A' },
      ]);
      expect(customResult.success).toBe(true);
      expect(customResult.subtitle?.id).toBe(77);
      expect(customResult.subtitle?.cues_json[0].text).toBe('hello');
      expect(dispatchWebhookEvent).toHaveBeenCalled();

      // 2. With database transcript sentences array (with and without speaker)
      vi.mocked(db.query)
        .mockResolvedValueOnce([
          {
            transcript_text: 'hola producto',
            sentences_json: JSON.stringify([
              { start_time_seconds: 1, end_time_seconds: 4, text: 'hola', speaker: 'Speaker B' },
              { start_time_seconds: 5, end_time_seconds: 8, text: 'producto' }, // without speaker
            ]),
          },
        ]) // select transcript
        .mockResolvedValueOnce({ insertId: 78 }); // insert subtitle

      const dbArrayResult = await createAssetSubtitles(100, 10, 1, 'es', 'SRT');
      expect(dbArrayResult.success).toBe(true);
      expect(dbArrayResult.subtitle?.cues_count).toBe(2);
      expect(dbArrayResult.subtitle?.id).toBe(78);

      // 3. With database transcript text string only (sentences empty)
      vi.mocked(db.query)
        .mockResolvedValueOnce([
          {
            transcript_text: 'Solo texto plano',
            sentences_json: [],
          },
        ])
        .mockResolvedValueOnce({ insertId: 79 });

      const dbTextResult = await createAssetSubtitles(100, 10, 1, 'es', 'JSON');
      expect(dbTextResult.success).toBe(true);
      expect(dbTextResult.subtitle?.cues_count).toBe(1);

      // 4. Missing transcripts in DB and no custom cues (Condition C-023.3)
      vi.mocked(db.query).mockResolvedValueOnce([]);
      const failResult = await createAssetSubtitles(100, 10, 1, 'es', 'VTT');
      expect(failResult.success).toBe(false);
      expect(failResult.message).toContain('No hay transcripciones disponibles');
    });

    it('listAssetSubtitles returns list with optional filters', async () => {
      const mockRow = {
        id: 1,
        tenant_id: 100,
        asset_id: 10,
        version_id: 1,
        language_code: 'es',
        format: 'VTT',
        cues_count: 2,
        output_derivative_path: '/path/sub.vtt',
        cues_json: JSON.stringify([{ start_time_seconds: 0, end_time_seconds: 2, text: 'Hola' }]),
        created_at: new Date().toISOString(),
      };

      vi.mocked(db.query)
        .mockResolvedValueOnce([mockRow]) // both filters
        .mockResolvedValueOnce([mockRow]) // lang only
        .mockResolvedValueOnce([mockRow]) // format only
        .mockResolvedValueOnce([mockRow]); // no filters

      const listBoth = await listAssetSubtitles(100, 10, 10, 0, 'es', 'VTT');
      expect(listBoth.length).toBe(1);

      const listLang = await listAssetSubtitles(100, 10, 10, 0, 'es', undefined);
      expect(listLang.length).toBe(1);

      const listFmt = await listAssetSubtitles(100, 10, 10, 0, undefined, 'VTT');
      expect(listFmt.length).toBe(1);

      const listNone = await listAssetSubtitles(100, 10, 10, 0, undefined, undefined);
      expect(listNone.length).toBe(1);
    });

    it('getAssetSubtitleById returns single subtitle or null', async () => {
      vi.mocked(db.query)
        .mockResolvedValueOnce([]) // not found
        .mockResolvedValueOnce([
          {
            id: 1,
            tenant_id: 100,
            asset_id: 10,
            version_id: 1,
            language_code: 'es',
            format: 'VTT',
            cues_count: 1,
            output_derivative_path: '/path/sub.vtt',
            cues_json: JSON.stringify([
              { start_time_seconds: 0, end_time_seconds: 2, text: 'Hola' },
            ]),
          },
        ]) // string cues_json
        .mockResolvedValueOnce([
          {
            id: 2,
            tenant_id: 100,
            asset_id: 10,
            version_id: 1,
            language_code: 'es',
            format: 'VTT',
            cues_count: 1,
            output_derivative_path: '/path/sub.vtt',
            cues_json: [{ start_time_seconds: 0, end_time_seconds: 2, text: 'Hola' }],
          },
        ]); // object cues_json

      const notFound = await getAssetSubtitleById(100, 10, 999);
      expect(notFound).toBeNull();

      const foundString = await getAssetSubtitleById(100, 10, 1);
      expect(foundString).not.toBeNull();
      expect(foundString?.cues_json.length).toBe(1);

      const foundObject = await getAssetSubtitleById(100, 10, 2);
      expect(foundObject).not.toBeNull();
      expect(foundObject?.cues_json.length).toBe(1);
    });

    it('deleteAssetSubtitle handles missing record, missing file and physical unlinking', async () => {
      // 1. Not found
      vi.mocked(db.query).mockResolvedValueOnce([]);
      const notFound = await deleteAssetSubtitle(100, 10, 999);
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
            cues_json: [],
          },
        ])
        .mockResolvedValueOnce([{ affectedRows: 1 }]);
      const deletedNoPath = await deleteAssetSubtitle(100, 10, 1);
      expect(deletedNoPath).toBe(true);

      // 3. Found with real file
      const derivativesDir = path.join(STORAGE_ROOT, 'derivatives', 'tenant_100');
      fs.mkdirSync(derivativesDir, { recursive: true });
      const testFile = path.join(derivativesDir, `test_sub_${Date.now()}.vtt`);
      fs.writeFileSync(testFile, 'WEBVTT\n\n');

      vi.mocked(db.query)
        .mockResolvedValueOnce([
          {
            id: 2,
            tenant_id: 100,
            asset_id: 10,
            version_id: 1,
            output_derivative_path: testFile,
            cues_json: [],
          },
        ])
        .mockResolvedValueOnce([{ affectedRows: 1 }]);

      const deletedRealFile = await deleteAssetSubtitle(100, 10, 2);
      expect(deletedRealFile).toBe(true);
      expect(fs.existsSync(testFile)).toBe(false);

      // 4. Found with non-existent file
      const missingFile = path.join(derivativesDir, `non_existent_sub_${Date.now()}.vtt`);
      vi.mocked(db.query)
        .mockResolvedValueOnce([
          {
            id: 3,
            tenant_id: 100,
            asset_id: 10,
            version_id: 1,
            output_derivative_path: missingFile,
            cues_json: [],
          },
        ])
        .mockResolvedValueOnce([{ affectedRows: 1 }]);

      const deletedMissingFile = await deleteAssetSubtitle(100, 10, 3);
      expect(deletedMissingFile).toBe(true);
      expect(dispatchWebhookEvent).toHaveBeenCalled();
    });
  });

  describe('3. POST /api/v1/assets/:id/subtitles', () => {
    it('returns 400 for invalid asset ID', async () => {
      const res = await supertest(app)
        .post('/api/v1/assets/invalid/subtitles')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('ID de activo inválido');
    });

    it('returns 404 if asset not found in tenant', async () => {
      vi.mocked(db.query).mockResolvedValueOnce([]);

      const res = await supertest(app)
        .post('/api/v1/assets/999/subtitles')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({});

      expect(res.status).toBe(404);
      expect(res.body.message).toContain('Activo digital no encontrado');
    });

    it('returns 400 if asset is not video or audio', async () => {
      vi.mocked(db.query).mockResolvedValueOnce([
        { id: 10, mime_type: 'image/jpeg', current_version_id: 1 },
      ]);

      const res = await supertest(app)
        .post('/api/v1/assets/10/subtitles')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('no es un archivo de video o audio compatible');
    });

    it('returns 403 if ACL denies EDIT permission', async () => {
      vi.mocked(db.query).mockResolvedValueOnce([
        { id: 10, mime_type: 'video/mp4', current_version_id: 1 },
      ]);
      vi.mocked(evaluateAclPermission).mockResolvedValueOnce({
        allowed: false,
        reason: 'FORBIDDEN',
      });

      const res = await supertest(app)
        .post('/api/v1/assets/10/subtitles')
        .set('Authorization', `Bearer ${clientToken}`)
        .send({});

      expect(res.status).toBe(403);
      expect(res.body.message).toContain('Acceso denegado por política de control de acceso');
    });

    it('returns 400 if no transcripts in DB and no custom cues provided', async () => {
      vi.mocked(db.query)
        .mockResolvedValueOnce([{ id: 10, mime_type: 'video/mp4', current_version_id: 1 }]) // asset query
        .mockResolvedValueOnce([]); // transcripts query

      const res = await supertest(app)
        .post('/api/v1/assets/10/subtitles')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('No hay transcripciones disponibles');
    });

    it('creates subtitles returning 201 Created for video and audio assets', async () => {
      // Video asset with custom cues
      vi.mocked(db.query)
        .mockResolvedValueOnce([{ id: 10, mime_type: 'video/mp4', current_version_id: 1 }])
        .mockResolvedValueOnce({ insertId: 88 });

      const resVideo = await supertest(app)
        .post('/api/v1/assets/10/subtitles')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          language_code: 'en',
          format: 'VTT',
          cues: [{ start_time_seconds: 0, end_time_seconds: 4, text: 'hola' }],
        });

      expect(resVideo.status).toBe(201);
      expect(resVideo.body.data.id).toBe(88);

      // Audio asset with custom cues
      vi.mocked(db.query)
        .mockResolvedValueOnce([{ id: 11, mime_type: 'audio/mp3', current_version_id: 1 }])
        .mockResolvedValueOnce({ insertId: 89 });

      const resAudio = await supertest(app)
        .post('/api/v1/assets/11/subtitles')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          language_code: 'fr',
          format: 'SRT',
          cues: [{ start_time_seconds: 0, end_time_seconds: 4, text: 'bienvenidos' }],
        });

      expect(resAudio.status).toBe(201);
      expect(resAudio.body.data.id).toBe(89);
    });
  });

  describe('4. GET /api/v1/assets/:id/subtitles', () => {
    it('returns 400 for invalid asset ID', async () => {
      const res = await supertest(app)
        .get('/api/v1/assets/0/subtitles')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(400);
    });

    it('returns 404 if asset not found in tenant', async () => {
      vi.mocked(db.query).mockResolvedValueOnce([]);

      const res = await supertest(app)
        .get('/api/v1/assets/999/subtitles')
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
        .get('/api/v1/assets/10/subtitles')
        .set('Authorization', `Bearer ${clientToken}`);

      expect(res.status).toBe(403);
    });

    it('returns 200 with list of subtitles', async () => {
      vi.mocked(db.query)
        .mockResolvedValueOnce([{ id: 10 }])
        .mockResolvedValueOnce([
          {
            id: 1,
            tenant_id: 100,
            asset_id: 10,
            version_id: 1,
            language_code: 'es',
            format: 'VTT',
            cues_count: 1,
            output_derivative_path: '/path/sub.vtt',
            cues_json: [{ start_time_seconds: 0, end_time_seconds: 2, text: 'Hola' }],
          },
        ]);

      const res = await supertest(app)
        .get('/api/v1/assets/10/subtitles?limit=10&offset=0&language_code=es&format=VTT')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(1);
    });
  });

  describe('5. GET /api/v1/assets/:id/subtitles/:subtitleId', () => {
    it('returns 400 for invalid params', async () => {
      const res = await supertest(app)
        .get('/api/v1/assets/invalid/subtitles/0')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(400);
    });

    it('returns 403 if ACL denies VIEW permission', async () => {
      vi.mocked(evaluateAclPermission).mockResolvedValueOnce({
        allowed: false,
        reason: 'FORBIDDEN',
      });

      const res = await supertest(app)
        .get('/api/v1/assets/10/subtitles/1')
        .set('Authorization', `Bearer ${clientToken}`);

      expect(res.status).toBe(403);
    });

    it('returns 404 if subtitle not found', async () => {
      vi.mocked(db.query).mockResolvedValueOnce([]);

      const res = await supertest(app)
        .get('/api/v1/assets/10/subtitles/999')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(404);
    });

    it('returns 200 with subtitle details', async () => {
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 1,
          tenant_id: 100,
          asset_id: 10,
          version_id: 1,
          language_code: 'es',
          format: 'VTT',
          cues_count: 1,
          output_derivative_path: '/path/sub.vtt',
          cues_json: [{ start_time_seconds: 0, end_time_seconds: 2, text: 'Hola' }],
        },
      ]);

      const res = await supertest(app)
        .get('/api/v1/assets/10/subtitles/1')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(1);
    });
  });

  describe('6. DELETE /api/v1/assets/:id/subtitles/:subtitleId', () => {
    it('returns 400 for invalid params', async () => {
      const res = await supertest(app)
        .delete('/api/v1/assets/0/subtitles/invalid')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(400);
    });

    it('returns 403 if ACL denies EDIT permission', async () => {
      vi.mocked(evaluateAclPermission).mockResolvedValueOnce({
        allowed: false,
        reason: 'FORBIDDEN',
      });

      const res = await supertest(app)
        .delete('/api/v1/assets/10/subtitles/1')
        .set('Authorization', `Bearer ${clientToken}`);

      expect(res.status).toBe(403);
    });

    it('returns 404 if subtitle not found on delete', async () => {
      vi.mocked(db.query).mockResolvedValueOnce([]);

      const res = await supertest(app)
        .delete('/api/v1/assets/10/subtitles/999')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(404);
    });

    it('deletes subtitle and returns 200 OK on success', async () => {
      vi.mocked(db.query)
        .mockResolvedValueOnce([
          {
            id: 1,
            tenant_id: 100,
            asset_id: 10,
            version_id: 1,
            output_derivative_path: null,
            cues_json: [],
          },
        ])
        .mockResolvedValueOnce([{ affectedRows: 1 }]);

      const res = await supertest(app)
        .delete('/api/v1/assets/10/subtitles/1')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.message).toContain('eliminada exitosamente');
    });
  });

  describe('7. Rate Limiting & Server Error Handlers', () => {
    it('handles unexpected exceptions with 500 status', async () => {
      vi.mocked(db.query).mockRejectedValue(new Error('Fatal Subtitle DB Crash'));

      const res1 = await supertest(app)
        .post('/api/v1/assets/10/subtitles')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({});
      expect(res1.status).toBe(500);

      const res2 = await supertest(app)
        .get('/api/v1/assets/10/subtitles')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res2.status).toBe(500);

      const res3 = await supertest(app)
        .get('/api/v1/assets/10/subtitles/1')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res3.status).toBe(500);

      const res4 = await supertest(app)
        .delete('/api/v1/assets/10/subtitles/1')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res4.status).toBe(500);
    });

    it('triggers subtitlesRateLimiter 429 response handler', async () => {
      const appLimit = express();
      appLimit.use(subtitlesRateLimiter);
      appLimit.post('/test-sub-limit', (_req, res) => res.json({ ok: true }));

      for (let i = 0; i < 30; i++) {
        await supertest(appLimit).post('/test-sub-limit');
      }
      const resBlocked = await supertest(appLimit).post('/test-sub-limit');
      expect(resBlocked.status).toBe(429);
      expect(resBlocked.body.message).toMatch(
        /Límite de operaciones de generación y traducción de subtítulos/,
      );
    });
  });
});
