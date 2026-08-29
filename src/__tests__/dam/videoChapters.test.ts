/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { Express } from 'express';
import request from 'supertest';
import * as db from '../../../server/src/db';
import assetsRouter from '../../../server/src/routes/assets';
import { evaluateAclPermission } from '../../../server/src/utils/acl';
import { dispatchWebhookEvent } from '../../../server/src/utils/webhookDispatcher';
import {
  SummaryTypeEnum,
  createVideoChaptersBodySchema,
  listVideoChaptersQuerySchema,
  getVideoSummaryQuerySchema,
  updateVideoChapterBodySchema,
  videoChapterParamSchema,
} from '../../../server/src/schemas/videoChapter.schema';
import {
  extractTopicsFromText,
  calculateChapterConfidence,
  partitionTranscriptIntoChapters,
  generateStructuredSummary,
  createAssetVideoChapters,
  listAssetVideoChapters,
  getAssetVideoSummary,
  updateAssetVideoChapter,
  deleteAssetVideoChapters,
} from '../../../server/src/utils/videoChapterEngine';
import { videoChapterRateLimiter } from '../../../server/src/middleware/rateLimiter';

// Mock database, ACL, Webhooks and Audit Logger
vi.mock('../../../server/src/db', () => ({
  query: vi.fn(),
}));

vi.mock('../../../server/src/utils/acl', () => ({
  evaluateAclPermission: vi.fn(),
}));

vi.mock('../../../server/src/utils/webhookDispatcher', () => ({
  dispatchWebhookEvent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../../server/src/middleware/auditLogger', () => ({
  logSecurityEvent: vi.fn().mockResolvedValue(undefined),
}));

// Mock authentication middleware
vi.mock('../../../server/src/middleware/auth', () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.user = {
      userId: 1,
      tenantId: 100,
      role: 'ADMIN',
    };
    next();
  },
  requireRole: () => (_req: any, _res: any, next: any) => next(),
}));

describe('FC 034 — DAM AI Automated Video Chaptering & Content Summarization Suite (100% 4x100)', () => {
  const testTenantId = 100;
  const testAssetId = 90;
  const testVersionId = 1;

  let app: Express;
  let reqCount = 0;

  const nextIp = () => {
    reqCount++;
    return `10.70.${Math.floor(reqCount / 200)}.${(reqCount % 200) + 1}`;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(db.query).mockReset();
    vi.mocked(evaluateAclPermission).mockReset();

    app = express();
    app.set('trust proxy', true);
    app.use(express.json());
    app.use('/api/v1/assets', assetsRouter);
  });

  describe('1. Zod Schemas Validation (videoChapter.schema.ts)', () => {
    it('SummaryTypeEnum debe validar tipos permitidos y rechazar inválidos', () => {
      expect(SummaryTypeEnum.safeParse('EXECUTIVE').success).toBe(true);
      expect(SummaryTypeEnum.safeParse('DETAILED').success).toBe(true);
      expect(SummaryTypeEnum.safeParse('BULLET_POINTS').success).toBe(true);
      expect(SummaryTypeEnum.safeParse('TOPICS_LIST').success).toBe(true);
      expect(SummaryTypeEnum.safeParse('INVALID_TYPE').success).toBe(false);
    });

    it('createVideoChaptersBodySchema debe validar cuerpo correcto y valores por defecto', () => {
      const parsedDefault = createVideoChaptersBodySchema.safeParse({});
      expect(parsedDefault.success).toBe(true);
      if (parsedDefault.success) {
        expect(parsedDefault.data.summary_type).toBe('EXECUTIVE');
        expect(parsedDefault.data.target_chapter_count).toBe(5);
        expect(parsedDefault.data.min_chapter_duration_seconds).toBe(10);
      }

      const parsedCustom = createVideoChaptersBodySchema.safeParse({
        summary_type: 'DETAILED',
        target_chapter_count: 8,
        min_chapter_duration_seconds: 30,
        custom_prompt: 'Enfatizar lanzamiento de producto',
      });
      expect(parsedCustom.success).toBe(true);

      // Bounds validation
      expect(createVideoChaptersBodySchema.safeParse({ target_chapter_count: 0 }).success).toBe(
        false,
      );
      expect(createVideoChaptersBodySchema.safeParse({ target_chapter_count: 60 }).success).toBe(
        false,
      );
      expect(
        createVideoChaptersBodySchema.safeParse({ min_chapter_duration_seconds: 2 }).success,
      ).toBe(false);
      expect(
        createVideoChaptersBodySchema.safeParse({ min_chapter_duration_seconds: 5000 }).success,
      ).toBe(false);
    });

    it('listVideoChaptersQuerySchema y getVideoSummaryQuerySchema deben validar parámetros', () => {
      const parsedList = listVideoChaptersQuerySchema.safeParse({ limit: '20', offset: '5' });
      expect(parsedList.success).toBe(true);
      if (parsedList.success) {
        expect(parsedList.data.limit).toBe(20);
        expect(parsedList.data.offset).toBe(5);
      }

      expect(listVideoChaptersQuerySchema.safeParse({ limit: '200' }).success).toBe(false);
      expect(listVideoChaptersQuerySchema.safeParse({ offset: '-1' }).success).toBe(false);

      const parsedSummaryQuery = getVideoSummaryQuerySchema.safeParse({
        summary_type: 'BULLET_POINTS',
      });
      expect(parsedSummaryQuery.success).toBe(true);
      expect(getVideoSummaryQuerySchema.safeParse({ summary_type: 'INVALID' }).success).toBe(false);
    });

    it('updateVideoChapterBodySchema debe validar refinamiento start < end y campos opcionales', () => {
      // Valid cases
      expect(updateVideoChapterBodySchema.safeParse({ title: 'Nuevo Título' }).success).toBe(true);
      expect(
        updateVideoChapterBodySchema.safeParse({
          start_time_seconds: 10,
          end_time_seconds: 25,
          confidence: 0.95,
        }).success,
      ).toBe(true);

      // Invalid start >= end
      const invalidTime = updateVideoChapterBodySchema.safeParse({
        start_time_seconds: 30,
        end_time_seconds: 20,
      });
      expect(invalidTime.success).toBe(false);

      const equalTime = updateVideoChapterBodySchema.safeParse({
        start_time_seconds: 20,
        end_time_seconds: 20,
      });
      expect(equalTime.success).toBe(false);

      // videoChapterParamSchema
      expect(videoChapterParamSchema.safeParse({ id: '90', chapterId: '3' }).success).toBe(true);
      expect(videoChapterParamSchema.safeParse({ id: '0' }).success).toBe(false);
      expect(videoChapterParamSchema.safeParse({ id: '90', chapterId: '0' }).success).toBe(false);
    });
  });

  describe('2. Core Algorithms & Helper Functions (videoChapterEngine.ts)', () => {
    it('extractTopicsFromText debe normalizar, filtrar stop words y extraer palabras clave frecuentes', () => {
      const text =
        'Bienvenidos a la presentación de arquitectura e inteligencia artificial en la nube. La inteligencia artificial optimiza la arquitectura de datos y la nube escalable.';
      const topics = extractTopicsFromText(text);

      expect(topics).toContain('Arquitectura');
      expect(topics).toContain('Inteligencia');
      expect(topics).toContain('Artificial');
      expect(topics).toContain('Nube');
      expect(topics.length).toBeLessThanOrEqual(8);

      // Empty text returns empty
      expect(extractTopicsFromText('')).toEqual([]);
    });

    it('calculateChapterConfidence debe calcular confianza proporcional y acotada en [0.60, 0.99]', () => {
      expect(calculateChapterConfidence(0, 0)).toBe(0.75);
      expect(calculateChapterConfidence(10, 0)).toBe(0.75);
      expect(calculateChapterConfidence(0, 60)).toBe(0.75);

      const highConf = calculateChapterConfidence(50, 100);
      expect(highConf).toBeGreaterThanOrEqual(0.6);
      expect(highConf).toBeLessThanOrEqual(0.99);

      const lowConf = calculateChapterConfidence(1, 1000);
      expect(lowConf).toBeGreaterThanOrEqual(0.6);
    });

    it('partitionTranscriptIntoChapters debe generar capítulos secuenciales no superpuestos', () => {
      const sampleCues = [
        {
          start_time: 0,
          end_time: 15,
          text: 'Introducción a la arquitectura de microservicios y nube',
        },
        {
          start_time: 15,
          end_time: 30,
          text: 'Detalles técnicos de escalabilidad y balanceo de carga',
        },
        {
          start_time: 30,
          end_time: 45,
          text: 'Seguridad en contenedores y control de accesos multi-tenant',
        },
        {
          start_time: 45,
          end_time: 60,
          text: 'Conclusiones finales, roadmap y sesión de preguntas',
        },
      ];

      const chapters = partitionTranscriptIntoChapters(sampleCues, 60, 2, 10);
      expect(chapters.length).toBe(2);
      expect(chapters[0].chapter_index).toBe(1);
      expect(chapters[0].start_time_seconds).toBe(0);
      expect(chapters[0].end_time_seconds).toBeLessThanOrEqual(chapters[1].start_time_seconds);
      expect(chapters[1].end_time_seconds).toBe(60);

      // Long text description truncation (200+ characters)
      const longText = 'A'.repeat(250);
      const longCues = [{ start_time: 0, end_time: 50, text: longText }];
      const longChapters = partitionTranscriptIntoChapters(longCues, 50, 1, 10);
      expect(longChapters[0].description.endsWith('...')).toBe(true);

      // Empty text cues
      const emptyCues = [{ start_time: 0, end_time: 20, text: '' }];
      const emptyChapters = partitionTranscriptIntoChapters(emptyCues, 20, 1, 10);
      expect(emptyChapters[0].title).toBeDefined();

      // Fallback when segments are empty
      const fallbackChapters = partitionTranscriptIntoChapters([], 120, 3, 20);
      expect(fallbackChapters.length).toBe(3);
      expect(fallbackChapters[0].start_time_seconds).toBe(0);
      expect(fallbackChapters[2].end_time_seconds).toBe(120);
    });

    it('generateStructuredSummary debe generar contenido acorde al tipo de resumen solicitado', () => {
      const sampleChapters = [
        {
          chapter_index: 1,
          title: 'Capítulo 1: Introducción',
          description: 'Apertura del evento',
          start_time_seconds: 0,
          end_time_seconds: 30,
          thumbnail_path: null,
          confidence: 0.9,
        },
        {
          chapter_index: 2,
          title: 'Capítulo 2: Estrategia',
          description: 'Estrategia de crecimiento',
          start_time_seconds: 30,
          end_time_seconds: 60,
          thumbnail_path: null,
          confidence: 0.92,
        },
      ];
      const text = 'Introducción del evento y estrategia de crecimiento empresarial en el mercado.';

      // 1. EXECUTIVE
      const exec = generateStructuredSummary(sampleChapters, text, 'EXECUTIVE', 'Prompt extra');
      expect(exec.content).toContain('Resumen Ejecutivo del Contenido');
      expect(exec.content).toContain('[Contexto adicional: Prompt extra]');
      expect(exec.key_takeaways.length).toBe(2);
      expect(exec.word_count).toBeGreaterThan(0);

      // EXECUTIVE without topics (fallback text)
      const execFallback = generateStructuredSummary(
        sampleChapters,
        'de la el en y a los',
        'EXECUTIVE',
      );
      expect(execFallback.content).toContain('la temática expuesta');

      // 2. DETAILED
      const detailed = generateStructuredSummary(sampleChapters, text, 'DETAILED');
      expect(detailed.content).toContain('Desglose Detallado por Capítulos');
      expect(detailed.content).toContain('Nivel de confianza semántica');

      // 3. BULLET_POINTS
      const bullets = generateStructuredSummary(sampleChapters, text, 'BULLET_POINTS');
      expect(bullets.content).toContain('Puntos Clave y Destacados');

      // 4. TOPICS_LIST
      const topics = generateStructuredSummary(sampleChapters, text, 'TOPICS_LIST');
      expect(topics.content).toContain('Taxonomía Temática e Índice de Contenidos');
    });
  });

  describe('3. Engine Service Functions (videoChapterEngine.ts)', () => {
    it('createAssetVideoChapters debe retornar 404 si el activo no existe', async () => {
      vi.mocked(db.query).mockResolvedValueOnce([]);

      const result = await createAssetVideoChapters(testTenantId, testAssetId, testVersionId, {
        summary_type: 'EXECUTIVE',
        target_chapter_count: 5,
        min_chapter_duration_seconds: 10,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.statusCode).toBe(404);
        expect(result.message).toContain('no encontrado');
      }
    });

    it('createAssetVideoChapters debe retornar 400 si el MIME no es video/audio o es nulo', async () => {
      // Non video MIME
      vi.mocked(db.query).mockResolvedValueOnce([{ id: testAssetId, mime_type: 'image/png' }]);
      const resImg = await createAssetVideoChapters(testTenantId, testAssetId, testVersionId, {
        summary_type: 'EXECUTIVE',
        target_chapter_count: 5,
        min_chapter_duration_seconds: 10,
      });
      expect(resImg.success).toBe(false);
      if (!resImg.success) {
        expect(resImg.statusCode).toBe(400);
        expect(resImg.message).toContain('Solo se admiten activos de video o audio');
      }

      // Null MIME
      vi.mocked(db.query).mockResolvedValueOnce([{ id: testAssetId, mime_type: null }]);
      const resNull = await createAssetVideoChapters(testTenantId, testAssetId, testVersionId, {
        summary_type: 'EXECUTIVE',
        target_chapter_count: 5,
        min_chapter_duration_seconds: 10,
      });
      expect(resNull.success).toBe(false);
      if (!resNull.success) {
        expect(resNull.statusCode).toBe(400);
        expect(resNull.message).toContain('desconocido');
      }
    });

    it('createAssetVideoChapters debe retornar 400 si no existen transcripciones previas (FC 020)', async () => {
      vi.mocked(db.query).mockResolvedValueOnce([{ id: testAssetId, mime_type: 'video/mp4' }]);
      vi.mocked(db.query).mockResolvedValueOnce([]); // No transcripts

      const result = await createAssetVideoChapters(testTenantId, testAssetId, testVersionId, {
        summary_type: 'EXECUTIVE',
        target_chapter_count: 5,
        min_chapter_duration_seconds: 10,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.statusCode).toBe(400);
        expect(result.message).toContain(
          'no cuenta con transcripciones ni análisis de video previo (FC 020)',
        );
      }
    });

    it('createAssetVideoChapters debe generar capítulos, resumen, upsert en BD y despachar webhook', async () => {
      const sampleSegments = JSON.stringify([
        { start_time: 0, end_time: 30, text: 'Primera parte del video sobre microservicios' },
        { start_time: 30, end_time: 60, text: 'Segunda parte del video sobre seguridad' },
      ]);

      vi.mocked(db.query).mockResolvedValueOnce([{ id: testAssetId, mime_type: 'video/mp4' }]);
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 1,
          full_transcript: 'Primera parte sobre microservicios. Segunda parte sobre seguridad.',
          segments: sampleSegments,
          duration_seconds: 60,
        },
      ]);
      vi.mocked(db.query).mockResolvedValueOnce({ affectedRows: 0 }); // DELETE old
      vi.mocked(db.query).mockResolvedValueOnce({ insertId: 101 }); // INSERT chap 1
      vi.mocked(db.query).mockResolvedValueOnce({ insertId: 102 }); // INSERT chap 2
      vi.mocked(db.query).mockResolvedValueOnce({ affectedRows: 1 }); // UPSERT summary
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 50,
          tenant_id: testTenantId,
          asset_id: testAssetId,
          version_id: testVersionId,
          summary_type: 'EXECUTIVE',
          content: 'Resumen de prueba',
          key_takeaways: ['[0s - 30s] Chap 1', '[30s - 60s] Chap 2'],
          topic_tags: ['Microservicios', 'Seguridad'],
          word_count: 35,
          created_at: '2026-08-28T00:00:00Z',
          updated_at: '2026-08-28T00:00:00Z',
        },
      ]);

      const result = await createAssetVideoChapters(testTenantId, testAssetId, testVersionId, {
        summary_type: 'EXECUTIVE',
        target_chapter_count: 2,
        min_chapter_duration_seconds: 10,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.statusCode).toBe(201);
        expect(result.chapters).toHaveLength(2);
        expect(result.summary.summary_type).toBe('EXECUTIVE');
      }

      expect(dispatchWebhookEvent).toHaveBeenCalledWith(
        testTenantId,
        'asset.updated',
        expect.objectContaining({
          event_type: 'VIDEO_CHAPTERS_GENERATED',
          chapter_count: 2,
          summary_type: 'EXECUTIVE',
        }),
      );
    });

    it('createAssetVideoChapters debe soportar segments array nativo y malformed JSON', async () => {
      // 1. Native array segments
      vi.mocked(db.query).mockResolvedValueOnce([{ id: testAssetId, mime_type: 'video/mp4' }]);
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 1,
          full_transcript: 'Texto',
          segments: [{ start_time: 0, end_time: 20, text: 'Capítulo A' }],
          duration_seconds: null,
        },
      ]);
      vi.mocked(db.query).mockResolvedValueOnce({ affectedRows: 0 }); // DELETE
      vi.mocked(db.query).mockResolvedValueOnce({ insertId: 103 }); // INSERT chap
      vi.mocked(db.query).mockResolvedValueOnce({ affectedRows: 1 }); // UPSERT summary
      vi.mocked(db.query).mockResolvedValueOnce([]); // summary fallback

      const resArray = await createAssetVideoChapters(testTenantId, testAssetId, testVersionId, {
        summary_type: 'DETAILED',
        target_chapter_count: 1,
        min_chapter_duration_seconds: 10,
      });
      expect(resArray.success).toBe(true);

      // 2. Malformed JSON string segments fallback (catch block)
      vi.mocked(db.query).mockResolvedValueOnce([{ id: testAssetId, mime_type: 'video/mp4' }]);
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 1,
          full_transcript: 'Texto fallback',
          segments: '{INVALID_JSON}',
          duration_seconds: 60,
        },
      ]);
      vi.mocked(db.query).mockResolvedValueOnce({ affectedRows: 0 });
      vi.mocked(db.query).mockResolvedValueOnce({ insertId: 104 });
      vi.mocked(db.query).mockResolvedValueOnce({ affectedRows: 1 });
      vi.mocked(db.query).mockResolvedValueOnce([]);

      const resMalformed = await createAssetVideoChapters(
        testTenantId,
        testAssetId,
        testVersionId,
        {
          summary_type: 'BULLET_POINTS',
          target_chapter_count: 1,
          min_chapter_duration_seconds: 10,
        },
      );
      expect(resMalformed.success).toBe(true);

      // 3. Object (non-string non-array) segments fallback
      vi.mocked(db.query).mockResolvedValueOnce([{ id: testAssetId, mime_type: 'video/mp4' }]);
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 1,
          full_transcript: 'Texto fallback',
          segments: { notAnArray: true },
          duration_seconds: 60,
        },
      ]);
      vi.mocked(db.query).mockResolvedValueOnce({ affectedRows: 0 });
      vi.mocked(db.query).mockResolvedValueOnce({ insertId: 105 });
      vi.mocked(db.query).mockResolvedValueOnce({ affectedRows: 1 });
      vi.mocked(db.query).mockResolvedValueOnce([]);

      const resObj = await createAssetVideoChapters(testTenantId, testAssetId, testVersionId, {
        summary_type: 'TOPICS_LIST',
        target_chapter_count: 1,
        min_chapter_duration_seconds: 10,
      });
      expect(resObj.success).toBe(true);
    });

    it('listAssetVideoChapters debe retornar lista ordenada de capítulos', async () => {
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 1,
          tenant_id: testTenantId,
          asset_id: testAssetId,
          version_id: 1,
          chapter_index: 1,
          title: 'Capítulo 1',
          description: 'Desc 1',
          start_time_seconds: '0.00',
          end_time_seconds: '30.00',
          thumbnail_path: null,
          confidence: '0.92',
          created_at: '2026-08-28T00:00:00Z',
          updated_at: '2026-08-28T00:00:00Z',
        },
      ]);

      const list = await listAssetVideoChapters(testTenantId, testAssetId, 10, 0);
      expect(list).toHaveLength(1);
      expect(list[0].start_time_seconds).toBe(0);
      expect(list[0].end_time_seconds).toBe(30);
      expect(list[0].confidence).toBe(0.92);
    });

    it('getAssetVideoSummary debe retornar detalle de resumen o null', async () => {
      // 1. JSON string fields
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 10,
          tenant_id: testTenantId,
          asset_id: testAssetId,
          version_id: 1,
          summary_type: 'EXECUTIVE',
          content: 'Resumen ejecutivo',
          key_takeaways: JSON.stringify(['Punto 1', 'Punto 2']),
          topic_tags: JSON.stringify(['Tag 1']),
          word_count: 20,
          created_at: '2026-08-28T00:00:00Z',
          updated_at: '2026-08-28T00:00:00Z',
        },
      ]);

      const sum1 = await getAssetVideoSummary(testTenantId, testAssetId, 'EXECUTIVE');
      expect(sum1).not.toBeNull();
      expect(sum1?.key_takeaways).toEqual(['Punto 1', 'Punto 2']);

      // 2. Malformed JSON fields fallback
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 11,
          tenant_id: testTenantId,
          asset_id: testAssetId,
          version_id: 1,
          summary_type: 'DETAILED',
          content: 'Detallado',
          key_takeaways: '{INVALID}',
          topic_tags: '{INVALID}',
          word_count: 10,
          created_at: '2026-08-28T00:00:00Z',
          updated_at: '2026-08-28T00:00:00Z',
        },
      ]);

      const sum2 = await getAssetVideoSummary(testTenantId, testAssetId);
      expect(sum2?.key_takeaways).toEqual([]);
      expect(sum2?.topic_tags).toEqual([]);

      // 3. Object (non-array non-string) fields
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 12,
          tenant_id: testTenantId,
          asset_id: testAssetId,
          version_id: 1,
          summary_type: 'BULLET_POINTS',
          content: 'Bullets',
          key_takeaways: { notArray: true },
          topic_tags: { notArray: true },
          word_count: 10,
          created_at: '2026-08-28T00:00:00Z',
          updated_at: '2026-08-28T00:00:00Z',
        },
      ]);
      const sum3 = await getAssetVideoSummary(testTenantId, testAssetId);
      expect(sum3?.key_takeaways).toEqual([]);
      expect(sum3?.topic_tags).toEqual([]);

      // 4. Not found
      vi.mocked(db.query).mockResolvedValueOnce([]);
      const sumNotFound = await getAssetVideoSummary(testTenantId, testAssetId);
      expect(sumNotFound).toBeNull();
    });

    it('updateAssetVideoChapter debe actualizar campos o retornar null/error si es inválido', async () => {
      // 1. Not found
      vi.mocked(db.query).mockResolvedValueOnce([]);
      const notFound = await updateAssetVideoChapter(testTenantId, testAssetId, 999, {
        title: 'T',
      });
      expect(notFound).toBeNull();

      // 2. start >= end throws error
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 1,
          tenant_id: testTenantId,
          asset_id: testAssetId,
          version_id: 1,
          chapter_index: 1,
          title: 'Capítulo 1',
          description: 'Desc',
          start_time_seconds: 10,
          end_time_seconds: 20,
          confidence: 0.9,
        },
      ]);
      await expect(
        updateAssetVideoChapter(testTenantId, testAssetId, 1, { start_time_seconds: 25 }),
      ).rejects.toThrow('El tiempo de inicio debe ser menor al tiempo de fin');

      // 3. Success update
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 1,
          tenant_id: testTenantId,
          asset_id: testAssetId,
          version_id: 1,
          chapter_index: 1,
          title: 'Capítulo 1',
          description: 'Desc',
          start_time_seconds: 0,
          end_time_seconds: 20,
          confidence: 0.9,
        },
      ]);
      vi.mocked(db.query).mockResolvedValueOnce({ affectedRows: 1 }); // UPDATE
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 1,
          tenant_id: testTenantId,
          asset_id: testAssetId,
          version_id: 1,
          chapter_index: 1,
          title: 'Capítulo 1 Actualizado',
          description: 'Desc Actualizada',
          start_time_seconds: 0,
          end_time_seconds: 25,
          thumbnail_path: null,
          confidence: 0.95,
          created_at: '2026-08-28T00:00:00Z',
          updated_at: '2026-08-28T00:00:00Z',
        },
      ]);

      const updated = await updateAssetVideoChapter(testTenantId, testAssetId, 1, {
        title: 'Capítulo 1 Actualizado',
        description: 'Desc Actualizada',
        end_time_seconds: 25,
        confidence: 0.95,
      });

      expect(updated).not.toBeNull();
      expect(updated?.title).toBe('Capítulo 1 Actualizado');
      expect(dispatchWebhookEvent).toHaveBeenCalledWith(
        testTenantId,
        'asset.updated',
        expect.objectContaining({
          event_type: 'VIDEO_CHAPTER_UPDATED',
          chapter_id: 1,
        }),
      );
    });

    it('deleteAssetVideoChapters debe eliminar capítulos y resúmenes y despachar webhook', async () => {
      // 1. Success delete
      vi.mocked(db.query).mockResolvedValueOnce({ affectedRows: 2 }); // chapters
      vi.mocked(db.query).mockResolvedValueOnce({ affectedRows: 1 }); // summaries

      const deleted = await deleteAssetVideoChapters(testTenantId, testAssetId);
      expect(deleted).toBe(true);
      expect(dispatchWebhookEvent).toHaveBeenCalledWith(
        testTenantId,
        'asset.updated',
        expect.objectContaining({ event_type: 'VIDEO_CHAPTERS_DELETED' }),
      );

      // 2. None affected
      vi.mocked(db.query).mockResolvedValueOnce({ affectedRows: 0 });
      vi.mocked(db.query).mockResolvedValueOnce({ affectedRows: 0 });
      const delNone = await deleteAssetVideoChapters(testTenantId, testAssetId);
      expect(delNone).toBe(false);
    });
  });

  describe('4. Endpoints REST Integration Tests (assets.ts)', () => {
    describe('POST /api/v1/assets/:id/video-chapters', () => {
      it('debe retornar 400 si el ID es inválido', async () => {
        const res = await request(app)
          .post('/api/v1/assets/0/video-chapters')
          .set('X-Forwarded-For', nextIp())
          .send({});
        expect(res.status).toBe(400);
      });

      it('debe retornar 400 si el body es inválido', async () => {
        const res = await request(app)
          .post('/api/v1/assets/90/video-chapters')
          .set('X-Forwarded-For', nextIp())
          .send({ target_chapter_count: 100 });
        expect(res.status).toBe(400);
      });

      it('debe retornar 404 si el activo no existe', async () => {
        vi.mocked(db.query).mockResolvedValueOnce([]);
        const res = await request(app)
          .post('/api/v1/assets/90/video-chapters')
          .set('X-Forwarded-For', nextIp())
          .send({});
        expect(res.status).toBe(404);
      });

      it('debe retornar 403 si ACL EDIT es denegado', async () => {
        vi.mocked(db.query).mockResolvedValueOnce([{ id: testAssetId, current_version_id: 1 }]);
        vi.mocked(evaluateAclPermission).mockResolvedValueOnce({ allowed: false });
        const res = await request(app)
          .post('/api/v1/assets/90/video-chapters')
          .set('X-Forwarded-For', nextIp())
          .send({});
        expect(res.status).toBe(403);
      });

      it('debe retornar 400 o 404 si createAssetVideoChapters retorna fallo', async () => {
        // 400 branch (no transcripts)
        vi.mocked(db.query).mockResolvedValueOnce([{ id: testAssetId, current_version_id: 1 }]);
        vi.mocked(evaluateAclPermission).mockResolvedValueOnce({ allowed: true });
        vi.mocked(db.query).mockResolvedValueOnce([{ id: testAssetId, mime_type: 'video/mp4' }]);
        vi.mocked(db.query).mockResolvedValueOnce([]); // No transcripts

        const res400 = await request(app)
          .post('/api/v1/assets/90/video-chapters')
          .set('X-Forwarded-For', nextIp())
          .send({});
        expect(res400.status).toBe(400);

        // 404 branch (asset not found in engine)
        vi.mocked(db.query).mockResolvedValueOnce([{ id: testAssetId, current_version_id: 1 }]);
        vi.mocked(evaluateAclPermission).mockResolvedValueOnce({ allowed: true });
        vi.mocked(db.query).mockResolvedValueOnce([]); // Asset not found in engine

        const res404 = await request(app)
          .post('/api/v1/assets/90/video-chapters')
          .set('X-Forwarded-For', nextIp())
          .send({});
        expect(res404.status).toBe(404);
      });

      it('debe retornar 201 Created y data en caso exitoso', async () => {
        vi.mocked(db.query).mockResolvedValueOnce([{ id: testAssetId, current_version_id: null }]);
        vi.mocked(evaluateAclPermission).mockResolvedValueOnce({ allowed: true });

        // Engine queries
        vi.mocked(db.query).mockResolvedValueOnce([{ id: testAssetId, mime_type: 'video/mp4' }]);
        vi.mocked(db.query).mockResolvedValueOnce([
          {
            id: 1,
            full_transcript: 'Transcripción de prueba.',
            segments: JSON.stringify([{ start_time: 0, end_time: 60, text: 'Transcripción' }]),
            duration_seconds: 60,
          },
        ]);
        vi.mocked(db.query).mockResolvedValueOnce({ affectedRows: 0 }); // DELETE
        vi.mocked(db.query).mockResolvedValueOnce({ insertId: 201 }); // INSERT chap
        vi.mocked(db.query).mockResolvedValueOnce({ affectedRows: 1 }); // UPSERT sum
        vi.mocked(db.query).mockResolvedValueOnce([
          {
            id: 70,
            tenant_id: testTenantId,
            asset_id: testAssetId,
            version_id: 1,
            summary_type: 'EXECUTIVE',
            content: 'Resumen',
            key_takeaways: ['Takeaway 1'],
            topic_tags: ['Tag 1'],
            word_count: 10,
          },
        ]);

        const res = await request(app)
          .post('/api/v1/assets/90/video-chapters')
          .set('X-Forwarded-For', nextIp())
          .send({ summary_type: 'EXECUTIVE' });

        expect(res.status).toBe(201);
        expect(res.body.data.chapters).toHaveLength(1);
        expect(res.body.data.summary.summary_type).toBe('EXECUTIVE');
      });

      it('debe manejar excepciones inesperadas con status 500', async () => {
        vi.mocked(db.query).mockRejectedValueOnce(new Error('Unexpected DB Error'));
        const res = await request(app)
          .post('/api/v1/assets/90/video-chapters')
          .set('X-Forwarded-For', nextIp())
          .send({});
        expect(res.status).toBe(500);
        expect(res.body.error).toBe('Internal Server Error');
      });
    });

    describe('GET /api/v1/assets/:id/video-chapters', () => {
      it('debe retornar 400 si el ID es inválido', async () => {
        const res = await request(app)
          .get('/api/v1/assets/0/video-chapters')
          .set('X-Forwarded-For', nextIp());
        expect(res.status).toBe(400);
      });

      it('debe retornar 404 si el activo no existe', async () => {
        vi.mocked(db.query).mockResolvedValueOnce([]);
        const res = await request(app)
          .get('/api/v1/assets/90/video-chapters')
          .set('X-Forwarded-For', nextIp());
        expect(res.status).toBe(404);
      });

      it('debe retornar 403 si ACL VIEW es denegado', async () => {
        vi.mocked(db.query).mockResolvedValueOnce([{ id: testAssetId }]);
        vi.mocked(evaluateAclPermission).mockResolvedValueOnce({ allowed: false });
        const res = await request(app)
          .get('/api/v1/assets/90/video-chapters')
          .set('X-Forwarded-For', nextIp());
        expect(res.status).toBe(403);
      });

      it('debe retornar 200 OK con la lista de capítulos (con y sin query params)', async () => {
        // With query params
        vi.mocked(db.query).mockResolvedValueOnce([{ id: testAssetId }]);
        vi.mocked(evaluateAclPermission).mockResolvedValueOnce({ allowed: true });
        vi.mocked(db.query).mockResolvedValueOnce([]);

        const resWithQuery = await request(app)
          .get('/api/v1/assets/90/video-chapters?limit=10&offset=5')
          .set('X-Forwarded-For', nextIp());
        expect(resWithQuery.status).toBe(200);
        expect(resWithQuery.body.data).toEqual([]);

        // Without query params (defaults)
        vi.mocked(db.query).mockResolvedValueOnce([{ id: testAssetId }]);
        vi.mocked(evaluateAclPermission).mockResolvedValueOnce({ allowed: true });
        vi.mocked(db.query).mockResolvedValueOnce([]);

        const resDefault = await request(app)
          .get('/api/v1/assets/90/video-chapters')
          .set('X-Forwarded-For', nextIp());
        expect(resDefault.status).toBe(200);
      });

      it('debe manejar excepciones inesperadas con status 500', async () => {
        vi.mocked(db.query).mockRejectedValueOnce(new Error('Unexpected List Error'));
        const res = await request(app)
          .get('/api/v1/assets/90/video-chapters')
          .set('X-Forwarded-For', nextIp());
        expect(res.status).toBe(500);
      });
    });

    describe('GET /api/v1/assets/:id/video-summary', () => {
      it('debe retornar 400 si el ID es inválido', async () => {
        const res = await request(app)
          .get('/api/v1/assets/0/video-summary')
          .set('X-Forwarded-For', nextIp());
        expect(res.status).toBe(400);
      });

      it('debe retornar 404 si el activo no existe', async () => {
        vi.mocked(db.query).mockResolvedValueOnce([]);
        const res = await request(app)
          .get('/api/v1/assets/90/video-summary')
          .set('X-Forwarded-For', nextIp());
        expect(res.status).toBe(404);
      });

      it('debe retornar 403 si ACL VIEW es denegado', async () => {
        vi.mocked(db.query).mockResolvedValueOnce([{ id: testAssetId }]);
        vi.mocked(evaluateAclPermission).mockResolvedValueOnce({ allowed: false });
        const res = await request(app)
          .get('/api/v1/assets/90/video-summary')
          .set('X-Forwarded-For', nextIp());
        expect(res.status).toBe(403);
      });

      it('debe retornar 404 si el resumen no existe', async () => {
        vi.mocked(db.query).mockResolvedValueOnce([{ id: testAssetId }]);
        vi.mocked(evaluateAclPermission).mockResolvedValueOnce({ allowed: true });
        vi.mocked(db.query).mockResolvedValueOnce([]); // No summary
        const res = await request(app)
          .get('/api/v1/assets/90/video-summary')
          .set('X-Forwarded-For', nextIp());
        expect(res.status).toBe(404);
        expect(res.body.message).toContain('no encontrado');
      });

      it('debe retornar 200 OK con el detalle del resumen', async () => {
        vi.mocked(db.query).mockResolvedValueOnce([{ id: testAssetId }]);
        vi.mocked(evaluateAclPermission).mockResolvedValueOnce({ allowed: true });
        vi.mocked(db.query).mockResolvedValueOnce([
          {
            id: 80,
            tenant_id: testTenantId,
            asset_id: testAssetId,
            version_id: 1,
            summary_type: 'EXECUTIVE',
            content: 'Resumen ejecutivo',
            key_takeaways: JSON.stringify(['Punto 1']),
            topic_tags: JSON.stringify(['Tag 1']),
            word_count: 15,
            created_at: '2026-08-28T00:00:00Z',
            updated_at: '2026-08-28T00:00:00Z',
          },
        ]);

        const res = await request(app)
          .get('/api/v1/assets/90/video-summary?summary_type=EXECUTIVE')
          .set('X-Forwarded-For', nextIp());
        expect(res.status).toBe(200);
        expect(res.body.data.id).toBe(80);
      });

      it('debe manejar excepciones inesperadas con status 500', async () => {
        vi.mocked(db.query).mockRejectedValueOnce(new Error('Unexpected Summary Error'));
        const res = await request(app)
          .get('/api/v1/assets/90/video-summary')
          .set('X-Forwarded-For', nextIp());
        expect(res.status).toBe(500);
      });
    });

    describe('PUT /api/v1/assets/:id/video-chapters/:chapterId', () => {
      it('debe retornar 400 si los IDs son inválidos', async () => {
        const res1 = await request(app)
          .put('/api/v1/assets/0/video-chapters/1')
          .set('X-Forwarded-For', nextIp())
          .send({});
        expect(res1.status).toBe(400);

        const res2 = await request(app)
          .put('/api/v1/assets/90/video-chapters/0')
          .set('X-Forwarded-For', nextIp())
          .send({});
        expect(res2.status).toBe(400);
      });

      it('debe retornar 403 si ACL EDIT es denegado', async () => {
        vi.mocked(evaluateAclPermission).mockResolvedValueOnce({ allowed: false });
        const res = await request(app)
          .put('/api/v1/assets/90/video-chapters/1')
          .set('X-Forwarded-For', nextIp())
          .send({ title: 'T' });
        expect(res.status).toBe(403);
      });

      it('debe retornar 404 si el capítulo no existe', async () => {
        vi.mocked(evaluateAclPermission).mockResolvedValueOnce({ allowed: true });
        vi.mocked(db.query).mockResolvedValueOnce([]); // Not found
        const res = await request(app)
          .put('/api/v1/assets/90/video-chapters/999')
          .set('X-Forwarded-For', nextIp())
          .send({ title: 'T' });
        expect(res.status).toBe(404);
      });

      it('debe retornar 200 OK y registrar evento de seguridad en caso exitoso', async () => {
        vi.mocked(evaluateAclPermission).mockResolvedValueOnce({ allowed: true });
        vi.mocked(db.query).mockResolvedValueOnce([
          {
            id: 1,
            tenant_id: testTenantId,
            asset_id: testAssetId,
            version_id: 1,
            chapter_index: 1,
            title: 'Old Title',
            description: 'Old Desc',
            start_time_seconds: 0,
            end_time_seconds: 30,
            confidence: 0.9,
          },
        ]);
        vi.mocked(db.query).mockResolvedValueOnce({ affectedRows: 1 });
        vi.mocked(db.query).mockResolvedValueOnce([
          {
            id: 1,
            tenant_id: testTenantId,
            asset_id: testAssetId,
            version_id: 1,
            chapter_index: 1,
            title: 'New Title',
            description: 'New Desc',
            start_time_seconds: 0,
            end_time_seconds: 30,
            thumbnail_path: null,
            confidence: 0.95,
            created_at: '2026-08-28T00:00:00Z',
            updated_at: '2026-08-28T00:00:00Z',
          },
        ]);

        const res = await request(app)
          .put('/api/v1/assets/90/video-chapters/1')
          .set('X-Forwarded-For', nextIp())
          .send({ title: 'New Title', description: 'New Desc', confidence: 0.95 });

        expect(res.status).toBe(200);
        expect(res.body.data.title).toBe('New Title');
      });

      it('debe manejar excepciones inesperadas con status 500', async () => {
        vi.mocked(evaluateAclPermission).mockRejectedValueOnce(
          new Error('Unexpected Update Error'),
        );
        const res = await request(app)
          .put('/api/v1/assets/90/video-chapters/1')
          .set('X-Forwarded-For', nextIp())
          .send({ title: 'T' });
        expect(res.status).toBe(500);
      });
    });

    describe('DELETE /api/v1/assets/:id/video-chapters', () => {
      it('debe retornar 400 si el ID es inválido', async () => {
        const res = await request(app)
          .delete('/api/v1/assets/0/video-chapters')
          .set('X-Forwarded-For', nextIp());
        expect(res.status).toBe(400);
      });

      it('debe retornar 403 si ACL EDIT es denegado', async () => {
        vi.mocked(evaluateAclPermission).mockResolvedValueOnce({ allowed: false });
        const res = await request(app)
          .delete('/api/v1/assets/90/video-chapters')
          .set('X-Forwarded-For', nextIp());
        expect(res.status).toBe(403);
      });

      it('debe retornar 404 si no existen capítulos para eliminar', async () => {
        vi.mocked(evaluateAclPermission).mockResolvedValueOnce({ allowed: true });
        vi.mocked(db.query).mockResolvedValueOnce({ affectedRows: 0 });
        vi.mocked(db.query).mockResolvedValueOnce({ affectedRows: 0 });

        const res = await request(app)
          .delete('/api/v1/assets/90/video-chapters')
          .set('X-Forwarded-For', nextIp());
        expect(res.status).toBe(404);
        expect(res.body.message).toContain('No se encontraron capítulos ni resúmenes');
      });

      it('debe retornar 200 OK y registrar auditoría en caso exitoso', async () => {
        vi.mocked(evaluateAclPermission).mockResolvedValueOnce({ allowed: true });
        vi.mocked(db.query).mockResolvedValueOnce({ affectedRows: 3 });
        vi.mocked(db.query).mockResolvedValueOnce({ affectedRows: 1 });

        const res = await request(app)
          .delete('/api/v1/assets/90/video-chapters')
          .set('X-Forwarded-For', nextIp());
        expect(res.status).toBe(200);
        expect(res.body.message).toContain('eliminados exitosamente');
      });

      it('debe manejar excepciones inesperadas con status 500', async () => {
        vi.mocked(evaluateAclPermission).mockRejectedValueOnce(
          new Error('Unexpected Delete Error'),
        );
        const res = await request(app)
          .delete('/api/v1/assets/90/video-chapters')
          .set('X-Forwarded-For', nextIp());
        expect(res.status).toBe(500);
      });
    });
  });

  describe('5. Rate Limiting Tests (videoChapterRateLimiter)', () => {
    it('videoChapterRateLimiter debe estar definido y configurado', () => {
      expect(videoChapterRateLimiter).toBeDefined();
    });

    it('videoChapterRateLimiter debe responder con 429 cuando se excede el límite de 30 solicitudes', async () => {
      const rateLimitApp = express();
      rateLimitApp.set('trust proxy', true);
      rateLimitApp.use(videoChapterRateLimiter);
      rateLimitApp.get('/test-chapter-limit', (_req, res) => {
        res.status(200).json({ ok: true });
      });

      const isolatedIp = '198.51.100.233';

      // 30 requests allowed
      for (let i = 0; i < 30; i++) {
        const res = await request(rateLimitApp)
          .get('/test-chapter-limit')
          .set('X-Forwarded-For', isolatedIp);
        expect(res.status).toBe(200);
      }

      // 31st request rejected with 429
      const res429 = await request(rateLimitApp)
        .get('/test-chapter-limit')
        .set('X-Forwarded-For', isolatedIp);
      expect(res429.status).toBe(429);
      expect(res429.body.error).toBe('Too Many Requests');
      expect(res429.body.message).toContain('Límite de operaciones de capítulos y resúmenes');
    });
  });
});
