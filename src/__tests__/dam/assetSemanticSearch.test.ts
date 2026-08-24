/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import supertest from 'supertest';
import express from 'express';
import jwt from 'jsonwebtoken';
import {
  generateEmbeddingBodySchema,
  semanticSearchBodySchema,
  similarAssetsQuerySchema,
} from '../../../server/src/schemas/assetSemanticSearch.schema';
import {
  cosineSimilarity,
  computeTextEmbedding,
  generateAssetEmbedding,
  searchSemantic,
  findSimilarAssets,
  parseJsonArray,
  extractConceptsFromText,
  DEFAULT_EMBEDDING_DIMENSIONS,
  DEFAULT_MODEL_NAME,
} from '../../../server/src/utils/vectorSearchEngine';
import { semanticSearchRateLimiter } from '../../../server/src/middleware/rateLimiter';
import * as db from '../../../server/src/db';

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

import { evaluateAclPermission } from '../../../server/src/utils/acl';
import { dispatchWebhookEvent } from '../../../server/src/utils/webhookDispatcher';
import assetsRouter from '../../../server/src/routes/assets';

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

describe('DAM Advanced Semantic & Vector Similarity Search (FC 016)', () => {
  const adminToken = makeToken({ userId: 1, role: 'ADMIN', tenantId: 100 });

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

  describe('1. Zod Validation Schemas (assetSemanticSearch.schema.ts)', () => {
    it('generateEmbeddingBodySchema validates defaults and constraints', () => {
      const validDefault = generateEmbeddingBodySchema.safeParse({});
      expect(validDefault.success).toBe(true);
      if (validDefault.success) {
        expect(validDefault.data.model_name).toBe('dreamtek-multimodal-v1');
        expect(validDefault.data.force_refresh).toBe(false);
      }

      const validCustom = generateEmbeddingBodySchema.safeParse({
        model_name: 'custom-clip-v2',
        force_refresh: true,
      });
      expect(validCustom.success).toBe(true);

      const invalidShort = generateEmbeddingBodySchema.safeParse({
        model_name: 'a',
      });
      expect(invalidShort.success).toBe(false);

      const invalidLong = generateEmbeddingBodySchema.safeParse({
        model_name: 'a'.repeat(70),
      });
      expect(invalidLong.success).toBe(false);
    });

    it('semanticSearchBodySchema validates natural language queries and score thresholds', () => {
      const valid = semanticSearchBodySchema.safeParse({
        query: 'futuristic dashboard UI',
        min_score: 0.7,
        limit: 20,
      });
      expect(valid.success).toBe(true);

      const validDefaults = semanticSearchBodySchema.safeParse({
        query: 'sunset landscape',
      });
      expect(validDefaults.success).toBe(true);
      if (validDefaults.success) {
        expect(validDefaults.data.min_score).toBe(0.55);
        expect(validDefaults.data.limit).toBe(10);
      }

      const invalidQueryShort = semanticSearchBodySchema.safeParse({
        query: 'a',
      });
      expect(invalidQueryShort.success).toBe(false);

      const invalidScoreLow = semanticSearchBodySchema.safeParse({
        query: 'test query',
        min_score: -0.1,
      });
      expect(invalidScoreLow.success).toBe(false);

      const invalidScoreHigh = semanticSearchBodySchema.safeParse({
        query: 'test query',
        min_score: 1.5,
      });
      expect(invalidScoreHigh.success).toBe(false);

      const invalidLimitLow = semanticSearchBodySchema.safeParse({
        query: 'test query',
        limit: 0,
      });
      expect(invalidLimitLow.success).toBe(false);

      const invalidLimitHigh = semanticSearchBodySchema.safeParse({
        query: 'test query',
        limit: 100,
      });
      expect(invalidLimitHigh.success).toBe(false);
    });

    it('similarAssetsQuerySchema validates query parameters transformation', () => {
      const validDefaults = similarAssetsQuerySchema.safeParse({});
      expect(validDefaults.success).toBe(true);
      if (validDefaults.success) {
        expect(validDefaults.data.min_score).toBe(0.55);
        expect(validDefaults.data.limit).toBe(10);
      }

      const validCustom = similarAssetsQuerySchema.safeParse({
        min_score: '0.8',
        limit: '25',
      });
      expect(validCustom.success).toBe(true);
      if (validCustom.success) {
        expect(validCustom.data.min_score).toBe(0.8);
        expect(validCustom.data.limit).toBe(25);
      }

      const invalidScore = similarAssetsQuerySchema.safeParse({
        min_score: 'not-a-number',
      });
      expect(invalidScore.success).toBe(false);

      const invalidLimit = similarAssetsQuerySchema.safeParse({
        limit: '999',
      });
      expect(invalidLimit.success).toBe(false);
    });
  });

  describe('2. Vector Search Engine Unit Tests (vectorSearchEngine.ts)', () => {
    it('cosineSimilarity accurately computes cosine angle between vectors', () => {
      expect(cosineSimilarity([], [])).toBe(0);
      expect(cosineSimilarity([1, 2], [1, 2, 3])).toBe(0);
      expect(cosineSimilarity(null as any, [1, 2])).toBe(0);
      expect(cosineSimilarity([0, 0], [0, 0])).toBe(0);

      // Identical vectors -> cos = 1.0
      expect(cosineSimilarity([1, 0], [1, 0])).toBe(1.0);
      // Orthogonal vectors -> cos = 0.0
      expect(cosineSimilarity([1, 0], [0, 1])).toBe(0.0);
      // Arbitrary vectors
      const score = cosineSimilarity([1, 2, 3], [1, 2, 3]);
      expect(score).toBe(1.0);
    });

    it('computeTextEmbedding projects text into normalized 64-dimensional vector space', () => {
      const emptyVec = computeTextEmbedding('');
      expect(emptyVec.length).toBe(DEFAULT_EMBEDDING_DIMENSIONS);
      expect(emptyVec.every((v) => v === 0)).toBe(true);

      const blankVec = computeTextEmbedding('   ');
      expect(blankVec.every((v) => v === 0)).toBe(true);

      const singleCharVec = computeTextEmbedding('a b c');
      expect(singleCharVec.every((v) => v === 0)).toBe(true);

      const vec = computeTextEmbedding('Sunset over mountain landscape with red clouds');
      expect(vec.length).toBe(DEFAULT_EMBEDDING_DIMENSIONS);

      // L2 norm of non-empty vector should be approximately 1.0
      const norm = Math.sqrt(vec.reduce((acc, v) => acc + v * v, 0));
      expect(norm).toBeCloseTo(1.0, 1);
    });

    it('parseJsonArray safely parses null, string, and raw arrays', () => {
      expect(parseJsonArray(null)).toEqual([]);
      expect(parseJsonArray(undefined)).toEqual([]);
      expect(parseJsonArray('["sunset", "ocean"]')).toEqual(['sunset', 'ocean']);
      expect(parseJsonArray([1, 2, 3])).toEqual([1, 2, 3]);
    });

    it('extractConceptsFromText extracts concepts properly', () => {
      expect(extractConceptsFromText(null)).toEqual([]);
      expect(extractConceptsFromText('')).toEqual([]);
      expect(extractConceptsFromText('Title: Sunset. Tags: ocean, beach. No colon here')).toEqual([
        'Sunset',
        'ocean, beach',
      ]);
      expect(extractConceptsFromText('Empty: . NonEmpty: Value')).toEqual(['Value']);
    });

    it('generateAssetEmbedding returns error when asset does not exist', async () => {
      vi.mocked(db.query).mockResolvedValueOnce([]);

      const result = await generateAssetEmbedding(100, 999);
      expect(result.success).toBe(false);
      expect(result.error).toContain('no existe o no se encuentra activo');
    });

    it('generateAssetEmbedding returns cached vector when force_refresh is false', async () => {
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 10,
          tenant_id: 100,
          title: 'Forest Asset',
          mime_type: 'image/png',
          status: 'ACTIVE',
          deleted_at: null,
          version_id: 1,
        },
      ]);
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 1,
          tenant_id: 100,
          asset_id: 10,
          version_id: 1,
          model_name: DEFAULT_MODEL_NAME,
          dimensions: 64,
          embedding_vector: JSON.stringify(new Array(64).fill(0.1)),
          text_representation: 'Title: Forest Asset. Type: image/png',
        },
      ]);

      const result = await generateAssetEmbedding(100, 10, { force_refresh: false });
      expect(result.success).toBe(true);
      expect(result.data?.asset_id).toBe(10);
      expect(result.data?.embedding_vector.length).toBe(64);
    });

    it('generateAssetEmbedding handles already parsed embedding_vector from database', async () => {
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 10,
          tenant_id: 100,
          title: 'Forest Asset',
          mime_type: 'image/png',
          status: 'ACTIVE',
          deleted_at: null,
          version_id: 1,
        },
      ]);
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 1,
          tenant_id: 100,
          asset_id: 10,
          version_id: 1,
          model_name: DEFAULT_MODEL_NAME,
          dimensions: 64,
          embedding_vector: new Array(64).fill(0.1),
          text_representation: null,
        },
      ]);

      const result = await generateAssetEmbedding(100, 10, { force_refresh: false });
      expect(result.success).toBe(true);
      expect(result.data?.text_representation).toBe('');
    });

    it('generateAssetEmbedding generates new multimodal embedding with tags and AI metadata', async () => {
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 10,
          tenant_id: 100,
          title: 'Futuristic Cyberpunk City',
          mime_type: 'image/png',
          status: 'ACTIVE',
          deleted_at: null,
          version_id: 2,
        },
      ]);
      // Cache check: empty
      vi.mocked(db.query).mockResolvedValueOnce([]);
      // Tags query
      vi.mocked(db.query).mockResolvedValueOnce([{ name: 'Neon' }, { name: 'Cyberpunk' }]);
      // AI metadata query (with JSON string)
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          labels: JSON.stringify([{ label: 'Futuristic Architecture' }]),
          dominant_colors: JSON.stringify([{ name: 'Purple / Violet' }]),
        },
      ]);
      // Insert query
      vi.mocked(db.query).mockResolvedValueOnce([{ affectedRows: 1 }] as any);

      const result = await generateAssetEmbedding(100, 10, { force_refresh: false });
      expect(result.success).toBe(true);
      expect(result.data?.asset_id).toBe(10);
      expect(result.data?.text_representation).toContain('Cyberpunk');
      expect(result.data?.text_representation).toContain('Futuristic Architecture');
      expect(result.data?.text_representation).toContain('Purple / Violet');
    });

    it('generateAssetEmbedding handles parsed AI metadata arrays and force_refresh: true', async () => {
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 10,
          tenant_id: 100,
          title: 'Simple Asset',
          mime_type: 'image/jpeg',
          status: 'ACTIVE',
          deleted_at: null,
          version_id: 1,
        },
      ]);
      // Note: Cache check skipped because force_refresh: true
      // Tags query (empty)
      vi.mocked(db.query).mockResolvedValueOnce([]);
      // AI metadata query (with raw arrays)
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          labels: [{ label: 'Nature' }, { label: '' }],
          dominant_colors: [{ name: 'Emerald' }, { name: '' }],
        },
      ]);
      // Insert query
      vi.mocked(db.query).mockResolvedValueOnce([{ affectedRows: 1 }] as any);

      const result = await generateAssetEmbedding(100, 10, { force_refresh: true });
      expect(result.success).toBe(true);
      expect(result.data?.text_representation).toContain('Nature');
      expect(result.data?.text_representation).toContain('Emerald');
    });

    it('generateAssetEmbedding handles null tag rows and null AI rows with default options', async () => {
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 10,
          tenant_id: 100,
          title: 'Null Meta Asset',
          mime_type: 'image/png',
          status: 'ACTIVE',
          deleted_at: null,
          version_id: 1,
        },
      ]);
      vi.mocked(db.query).mockResolvedValueOnce([]); // Cache: empty
      vi.mocked(db.query).mockResolvedValueOnce(null as any); // Tags query: null
      vi.mocked(db.query).mockResolvedValueOnce(null as any); // AI meta query: null
      vi.mocked(db.query).mockResolvedValueOnce([{ affectedRows: 1 }] as any); // Insert

      const result = await generateAssetEmbedding(100, 10);
      expect(result.success).toBe(true);
      expect(result.data?.text_representation).toBe('Title: Null Meta Asset. Type: image/png');
    });

    it('searchSemantic scores and ranks matching assets correctly', async () => {
      const queryText = 'sunset over mountain lake';
      const vectorQuery = computeTextEmbedding(queryText);
      const vectorPartial = computeTextEmbedding('sunset lake reflections');
      const vectorCity = computeTextEmbedding('futuristic modern city skyscraper');

      vi.mocked(db.query).mockResolvedValueOnce([
        {
          asset_id: 10,
          version_id: 1,
          embedding_vector: JSON.stringify(vectorQuery),
          text_representation: 'Title: Sunset Lake. Tags: sunset, mountain. Visuals: Golden hour',
          title: 'Sunset Lake',
          mime_type: 'image/jpeg',
          byte_size: 1024,
        },
        {
          asset_id: 12,
          version_id: 1,
          embedding_vector: JSON.stringify(vectorPartial),
          text_representation: 'Title: Sunset Reflection. Tags: lake',
          title: 'Sunset Reflection',
          mime_type: 'image/jpeg',
          byte_size: 2048,
        },
        {
          asset_id: 11,
          version_id: 1,
          embedding_vector: vectorCity,
          text_representation: 'No Colon Representation',
          title: 'City Center',
          mime_type: 'image/png',
          byte_size: 4096,
        },
      ]);

      const response = await searchSemantic(100, queryText, {
        min_score: 0.3,
        limit: 5,
      });

      expect(response.total_matches).toBe(2);
      expect(response.results[0].asset_id).toBe(10);
      expect(response.results[1].asset_id).toBe(12);
      expect(response.results[0].matched_concepts.length).toBeGreaterThan(0);
    });

    it('searchSemantic handles empty embeddings rows gracefully', async () => {
      vi.mocked(db.query).mockResolvedValueOnce([]);

      const response = await searchSemantic(100, 'any query', { min_score: 0.5 });
      expect(response.total_matches).toBe(0);
      expect(response.results).toEqual([]);
    });

    it('searchSemantic handles null embeddings rows with default options', async () => {
      vi.mocked(db.query).mockResolvedValueOnce(null as any);

      const response = await searchSemantic(100, 'any query');
      expect(response.total_matches).toBe(0);
      expect(response.results).toEqual([]);
    });

    it('findSimilarAssets fails when target asset embedding cannot be generated', async () => {
      vi.mocked(db.query).mockResolvedValueOnce([]); // Asset not found

      const result = await findSimilarAssets(100, 999);
      expect(result.success).toBe(false);
      expect(result.error).toContain('no existe o no se encuentra activo');
    });

    it('findSimilarAssets computes similar assets within tenant excluding target asset', async () => {
      const vectorTarget = computeTextEmbedding('blue ocean wave beach');
      const vectorPartial = computeTextEmbedding('ocean shoreline waves');
      const vectorUnrelated = computeTextEmbedding('unrelated dark night space astronaut');

      // 1. generateAssetEmbedding queries
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 10,
          tenant_id: 100,
          title: 'Ocean Wave',
          mime_type: 'image/jpeg',
          status: 'ACTIVE',
          deleted_at: null,
          version_id: 1,
        },
      ]);
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 1,
          tenant_id: 100,
          asset_id: 10,
          version_id: 1,
          model_name: DEFAULT_MODEL_NAME,
          dimensions: 64,
          embedding_vector: vectorTarget,
          text_representation: 'Title: Ocean Wave',
        },
      ]);

      // 2. Query other embeddings (two matching for sort coverage, one unrelated below min_score)
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          asset_id: 12,
          embedding_vector: JSON.stringify(vectorTarget),
          text_representation: 'Title: Beach Shore. Tags: sea, ocean',
          title: 'Beach Shore',
          mime_type: 'image/jpeg',
          byte_size: 4096,
        },
        {
          asset_id: 14,
          embedding_vector: JSON.stringify(vectorTarget),
          text_representation: 'Title: Shoreline. Tags: ocean',
          title: 'Shoreline',
          mime_type: 'image/jpeg',
          byte_size: 2048,
        },
        {
          asset_id: 13,
          embedding_vector: JSON.stringify([]),
          text_representation: 'Title: Night Space',
          title: 'Night Space',
          mime_type: 'image/png',
          byte_size: 8192,
        },
      ]);

      const result = await findSimilarAssets(100, 10, { min_score: 0.1, limit: 5 });
      expect(result.success).toBe(true);
      expect(result.total_matches).toBe(2);
      expect(result.results?.[0].asset_id).toBe(12);
      expect(result.results?.[1].asset_id).toBe(14);
    });

    it('findSimilarAssets handles empty neighbor rows gracefully', async () => {
      // 1. Target asset
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 10,
          tenant_id: 100,
          title: 'Ocean Wave',
          mime_type: 'image/jpeg',
          status: 'ACTIVE',
          deleted_at: null,
          version_id: 1,
        },
      ]);
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 1,
          tenant_id: 100,
          asset_id: 10,
          version_id: 1,
          model_name: DEFAULT_MODEL_NAME,
          dimensions: 64,
          embedding_vector: new Array(64).fill(0.1),
          text_representation: 'Title: Ocean Wave',
        },
      ]);
      // 2. Query neighbors: empty
      vi.mocked(db.query).mockResolvedValueOnce([]);

      const result = await findSimilarAssets(100, 10);
      expect(result.success).toBe(true);
      expect(result.total_matches).toBe(0);
      expect(result.results).toEqual([]);
    });

    it('findSimilarAssets handles null neighbor rows gracefully', async () => {
      // 1. Target asset
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 10,
          tenant_id: 100,
          title: 'Ocean Wave',
          mime_type: 'image/jpeg',
          status: 'ACTIVE',
          deleted_at: null,
          version_id: 1,
        },
      ]);
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 1,
          tenant_id: 100,
          asset_id: 10,
          version_id: 1,
          model_name: DEFAULT_MODEL_NAME,
          dimensions: 64,
          embedding_vector: new Array(64).fill(0.1),
          text_representation: 'Title: Ocean Wave',
        },
      ]);
      // 2. Query neighbors: null
      vi.mocked(db.query).mockResolvedValueOnce(null as any);

      const result = await findSimilarAssets(100, 10);
      expect(result.success).toBe(true);
      expect(result.total_matches).toBe(0);
      expect(result.results).toEqual([]);
    });
  });

  describe('3. HTTP Routes Integration Tests (assets.ts)', () => {
    it('POST /api/v1/assets/search/semantic executes successfully with 200 OK', async () => {
      const vectorSunset = computeTextEmbedding('golden sunset');
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          asset_id: 10,
          embedding_vector: vectorSunset,
          text_representation: 'Title: Golden Sunset',
          title: 'Golden Sunset',
          mime_type: 'image/jpeg',
          byte_size: 1024,
        },
      ]);

      const res = await supertest(app)
        .post('/api/v1/assets/search/semantic')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ query: 'golden sunset', min_score: 0.1, limit: 5 });

      expect(res.status).toBe(200);
      expect(res.body.message).toContain('Búsqueda semántica ejecutada exitosamente');
      expect(res.body.data.results.length).toBe(1);
    });

    it('POST /api/v1/assets/search/semantic rejects invalid request with 400', async () => {
      const res = await supertest(app)
        .post('/api/v1/assets/search/semantic')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ query: 'a' }); // Query too short

      expect(res.status).toBe(400);
    });

    it('POST /api/v1/assets/search/semantic returns 500 on unexpected failure', async () => {
      vi.mocked(db.query).mockRejectedValueOnce(new Error('DB Error'));

      const res = await supertest(app)
        .post('/api/v1/assets/search/semantic')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ query: 'valid query' });

      expect(res.status).toBe(500);
      expect(res.body.message).toContain('Error al ejecutar la búsqueda semántica');
    });

    it('POST /api/v1/assets/:id/embedding rejects invalid ID with 400', async () => {
      const res = await supertest(app)
        .post('/api/v1/assets/invalid-id/embedding')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('ID de activo inválido');
    });

    it('POST /api/v1/assets/:id/embedding rejects with 403 when ACL EDIT is denied', async () => {
      const aclModule = await import('../../../server/src/utils/acl');
      vi.mocked(aclModule.evaluateAclPermission).mockResolvedValueOnce({
        allowed: false,
        reason: 'DENIED',
      });

      const res = await supertest(app)
        .post('/api/v1/assets/10/embedding')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({});

      expect(res.status).toBe(403);
      expect(res.body.message).toContain('Acceso denegado por política de control de acceso');
    });

    it('POST /api/v1/assets/:id/embedding generates embedding successfully with 200 OK', async () => {
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 10,
          tenant_id: 100,
          title: 'Forest Landscape',
          mime_type: 'image/png',
          status: 'ACTIVE',
          deleted_at: null,
          version_id: 1,
        },
      ]);
      // Note: Cache check skipped because force_refresh: true
      vi.mocked(db.query).mockResolvedValueOnce([{ name: 'Forest' }]); // Tags
      vi.mocked(db.query).mockResolvedValueOnce([]); // No AI meta
      vi.mocked(db.query).mockResolvedValueOnce([{ affectedRows: 1 }] as any); // Insert

      const res = await supertest(app)
        .post('/api/v1/assets/10/embedding')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ model_name: 'dreamtek-multimodal-v1', force_refresh: true });

      expect(res.status).toBe(200);
      expect(res.body.message).toContain('Vector de embedding generado exitosamente');
      expect(res.body.data.asset_id).toBe(10);
    });

    it('POST /api/v1/assets/:id/embedding returns 400 when generation fails', async () => {
      vi.mocked(db.query).mockResolvedValueOnce([]); // Asset not found

      const res = await supertest(app)
        .post('/api/v1/assets/10/embedding')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('no existe o no se encuentra activo');
    });

    it('POST /api/v1/assets/:id/embedding returns default 400 error message when result.error is undefined', async () => {
      const vectorModule = await import('../../../server/src/utils/vectorSearchEngine');
      const spy = vi.spyOn(vectorModule, 'generateAssetEmbedding').mockResolvedValueOnce({
        success: false,
      });

      const res = await supertest(app)
        .post('/api/v1/assets/10/embedding')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.message).toBe('Error al generar el vector de embedding.');
      spy.mockRestore();
    });

    it('POST /api/v1/assets/:id/embedding returns 500 on unexpected exception', async () => {
      const aclModule = await import('../../../server/src/utils/acl');
      vi.mocked(aclModule.evaluateAclPermission).mockRejectedValueOnce(new Error('ACL Error'));

      const res = await supertest(app)
        .post('/api/v1/assets/10/embedding')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({});

      expect(res.status).toBe(500);
      expect(res.body.message).toContain('Error al generar el embedding del activo');
    });

    it('GET /api/v1/assets/:id/similar rejects invalid ID with 400', async () => {
      const res = await supertest(app)
        .get('/api/v1/assets/invalid-id/similar')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('ID de activo inválido');
    });

    it('GET /api/v1/assets/:id/similar rejects with 403 when ACL VIEW is denied', async () => {
      const aclModule = await import('../../../server/src/utils/acl');
      vi.mocked(aclModule.evaluateAclPermission).mockResolvedValueOnce({
        allowed: false,
        reason: 'DENIED',
      });

      const res = await supertest(app)
        .get('/api/v1/assets/10/similar')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(403);
      expect(res.body.message).toContain('Acceso denegado por política de control de acceso');
    });

    it('GET /api/v1/assets/:id/similar returns 200 OK with similar assets list', async () => {
      const vec = computeTextEmbedding('mountain peak landscape');

      // generate target embedding
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 10,
          tenant_id: 100,
          title: 'Mountain Peak',
          mime_type: 'image/jpeg',
          status: 'ACTIVE',
          deleted_at: null,
          version_id: 1,
        },
      ]);
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 1,
          tenant_id: 100,
          asset_id: 10,
          version_id: 1,
          model_name: DEFAULT_MODEL_NAME,
          dimensions: 64,
          embedding_vector: vec,
          text_representation: 'Mountain Peak',
        },
      ]);

      // query neighbors
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          asset_id: 20,
          embedding_vector: vec,
          text_representation: 'Mountain Sunset',
          title: 'Mountain Sunset',
          mime_type: 'image/jpeg',
          byte_size: 2048,
        },
      ]);

      const res = await supertest(app)
        .get('/api/v1/assets/10/similar?min_score=0.1&limit=5')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.message).toContain('Activos similares recuperados exitosamente');
      expect(res.body.data.results.length).toBe(1);
    });

    it('GET /api/v1/assets/:id/similar returns 400 when findSimilarAssets fails', async () => {
      vi.mocked(db.query).mockResolvedValueOnce([]); // Target asset not found

      const res = await supertest(app)
        .get('/api/v1/assets/10/similar')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('no existe o no se encuentra activo');
    });

    it('GET /api/v1/assets/:id/similar returns default 400 error message when result.error is undefined', async () => {
      const vectorModule = await import('../../../server/src/utils/vectorSearchEngine');
      const spy = vi.spyOn(vectorModule, 'findSimilarAssets').mockResolvedValueOnce({
        success: false,
      });

      const res = await supertest(app)
        .get('/api/v1/assets/10/similar')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(400);
      expect(res.body.message).toBe('Error al buscar activos similares.');
      spy.mockRestore();
    });

    it('GET /api/v1/assets/:id/similar returns 500 on unexpected exception', async () => {
      const aclModule = await import('../../../server/src/utils/acl');
      vi.mocked(aclModule.evaluateAclPermission).mockRejectedValueOnce(new Error('ACL Error'));

      const res = await supertest(app)
        .get('/api/v1/assets/10/similar')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(500);
      expect(res.body.message).toContain('Error al buscar activos similares');
    });
  });

  describe('4. Rate Limiter 429 Handler', () => {
    it('triggers semanticSearchRateLimiter 429 response handler', async () => {
      const appLimit = express();
      appLimit.use(semanticSearchRateLimiter);
      appLimit.get('/test-semantic-limit', (_req, res) => res.json({ ok: true }));

      for (let i = 0; i < 30; i++) {
        await supertest(appLimit).get('/test-semantic-limit');
      }

      const resBlocked = await supertest(appLimit).get('/test-semantic-limit');
      expect(resBlocked.status).toBe(429);
      expect(resBlocked.body.message).toMatch(
        /Límite de búsquedas semánticas y operaciones vectoriales alcanzado/,
      );
    });
  });
});
