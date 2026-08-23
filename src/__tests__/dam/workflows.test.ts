import { describe, it, expect, vi, beforeEach } from 'vitest';
import supertest from 'supertest';
import express, { Request, Response, NextFunction } from 'express';
import * as db from '../../../server/src/db';
import * as webhookDispatcher from '../../../server/src/utils/webhookDispatcher';
import * as aiVisionEngine from '../../../server/src/utils/aiVisionEngine';
import * as auditLogger from '../../../server/src/middleware/auditLogger';
import {
  evaluateCondition,
  evaluateWorkflowConditions,
  buildAssetContext,
  executeWorkflowAction,
  executeWorkflow,
  dispatchWorkflowsForEvent,
  parseJsonArray,
  AssetContext,
} from '../../../server/src/utils/workflowEngine';
import {
  createWorkflowBodySchema,
  updateWorkflowBodySchema,
  workflowExecutionsQuerySchema,
  workflowConditionSchema,
  ConditionOperator,
  ActionType,
} from '../../../server/src/schemas/workflow.schema';
import { AnalyzeResult } from '../../../server/src/utils/aiVisionEngine';
import { workflowsRateLimiter } from '../../../server/src/middleware/rateLimiter';
import { AuthenticatedRequest } from '../../../server/src/middleware/auth';
import workflowsRouter from '../../../server/src/routes/workflows';

// Mock DB
vi.mock('../../../server/src/db', () => ({
  query: vi.fn(),
  pool: {
    getConnection: vi.fn(),
  },
}));

// Mock Audit Logger
vi.mock('../../../server/src/middleware/auditLogger', () => ({
  logSecurityEvent: vi.fn().mockResolvedValue(undefined),
}));

// Mock Auth Middleware
vi.mock('../../../server/src/middleware/auth', () => ({
  requireAuth: (req: Request, _res: Response, next: NextFunction) => {
    (req as AuthenticatedRequest).user = {
      userId: 42,
      tenantId: 100,
      role: 'ADMIN',
    };
    next();
  },
}));

describe('FC 017 — DAM Custom Dynamic Workflows & Automation Engine', () => {
  const dummyContext: AssetContext = {
    id: 10,
    tenant_id: 100,
    title: 'Brand Hero Image',
    mime_type: 'image/jpeg',
    byte_size: 2048500,
    storage_tier: 'HOT',
    tags: ['marketing', 'hero', '2026'],
    ai_labels: ['landscape', 'sunset', 'mountains'],
    dominant_colors: ['orange', 'purple'],
  };

  beforeEach(() => {
    vi.resetAllMocks();
    vi.spyOn(webhookDispatcher, 'dispatchWebhookEvent').mockResolvedValue(true);
    vi.spyOn(aiVisionEngine, 'analyzeAssetVisuals').mockResolvedValue({
      success: true,
      data: {
        asset_id: 10,
        version_id: 1,
        provider: 'SHARP_LOCAL',
        status: 'COMPLETED',
        labels: [{ label: 'Nature', confidence: 0.95 }],
        dominant_colors: [],
        detected_objects: [],
        analyzed_at: new Date().toISOString(),
      },
    } as unknown as AnalyzeResult);
  });

  describe('1. Zod Schemas Validation & Helpers', () => {
    it('parseJsonArray parses strings, arrays, and nullish values', () => {
      expect(parseJsonArray('["tag1", "tag2"]')).toEqual(['tag1', 'tag2']);
      expect(parseJsonArray(['item1', 'item2'])).toEqual(['item1', 'item2']);
      expect(parseJsonArray(null)).toEqual([]);
      expect(parseJsonArray(undefined)).toEqual([]);
    });

    it('validates correct createWorkflowBodySchema', () => {
      const validBody = {
        name: 'Auto Tag Images',
        description: 'Applies marketing tags',
        trigger_event: 'ASSET_CREATED',
        conditions: [{ field: 'mime_type', operator: 'STARTS_WITH', value: 'image/' }],
        actions: [{ type: 'APPLY_TAGS', params: { tags: ['auto-image'] } }],
        is_active: true,
      };

      const parsed = createWorkflowBodySchema.safeParse(validBody);
      expect(parsed.success).toBe(true);
    });

    it('rejects invalid createWorkflowBodySchema', () => {
      const invalid = {
        name: 'A', // too short
        trigger_event: 'INVALID_EVENT',
        actions: [], // min 1
      };
      const parsed = createWorkflowBodySchema.safeParse(invalid);
      expect(parsed.success).toBe(false);
    });

    it('validates updateWorkflowBodySchema optional fields', () => {
      const parsed = updateWorkflowBodySchema.safeParse({
        name: 'Updated Name',
        is_active: false,
      });
      expect(parsed.success).toBe(true);
    });

    it('validates workflowExecutionsQuerySchema transforms and bounds', () => {
      const parsed = workflowExecutionsQuerySchema.safeParse({
        limit: '25',
        status: 'SUCCESS',
      });
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.limit).toBe(25);
        expect(parsed.data.status).toBe('SUCCESS');
      }

      const invalid = workflowExecutionsQuerySchema.safeParse({ limit: '100' });
      expect(invalid.success).toBe(false);
    });

    it('validates workflowConditionSchema constraints', () => {
      const valid = workflowConditionSchema.safeParse({
        field: 'byte_size',
        operator: 'GREATER_THAN',
        value: 1000000,
      });
      expect(valid.success).toBe(true);

      const invalid = workflowConditionSchema.safeParse({
        field: '',
        operator: 'INVALID_OP',
        value: 'test',
      });
      expect(invalid.success).toBe(false);
    });
  });

  describe('2. Workflow Engine Condition Evaluation', () => {
    it('evaluates EQUALS and NOT_EQUALS operators', () => {
      expect(
        evaluateCondition(dummyContext, {
          field: 'mime_type',
          operator: 'EQUALS',
          value: 'IMAGE/JPEG',
        }),
      ).toBe(true);
      expect(
        evaluateCondition(dummyContext, {
          field: 'mime_type',
          operator: 'EQUALS',
          value: 'image/png',
        }),
      ).toBe(false);

      expect(
        evaluateCondition(dummyContext, {
          field: 'mime_type',
          operator: 'NOT_EQUALS',
          value: 'video/mp4',
        }),
      ).toBe(true);
      expect(
        evaluateCondition(dummyContext, {
          field: 'mime_type',
          operator: 'NOT_EQUALS',
          value: 'image/jpeg',
        }),
      ).toBe(false);
    });

    it('evaluates CONTAINS operator for strings and arrays', () => {
      expect(
        evaluateCondition(dummyContext, { field: 'title', operator: 'CONTAINS', value: 'Hero' }),
      ).toBe(true);
      expect(
        evaluateCondition(dummyContext, { field: 'title', operator: 'CONTAINS', value: 'Video' }),
      ).toBe(false);

      expect(
        evaluateCondition(dummyContext, { field: 'tags', operator: 'CONTAINS', value: 'market' }),
      ).toBe(true);
      expect(
        evaluateCondition(dummyContext, { field: 'tags', operator: 'CONTAINS', value: 'finance' }),
      ).toBe(false);

      const emptyFieldCtx = { ...dummyContext, title: '' };
      expect(
        evaluateCondition(emptyFieldCtx, {
          field: 'title',
          operator: 'CONTAINS',
          value: 'something',
        }),
      ).toBe(false);
    });

    it('evaluates STARTS_WITH operator', () => {
      expect(
        evaluateCondition(dummyContext, {
          field: 'mime_type',
          operator: 'STARTS_WITH',
          value: 'image/',
        }),
      ).toBe(true);
      expect(
        evaluateCondition(dummyContext, {
          field: 'mime_type',
          operator: 'STARTS_WITH',
          value: 'video/',
        }),
      ).toBe(false);

      const emptyFieldCtx = { ...dummyContext, mime_type: '' };
      expect(
        evaluateCondition(emptyFieldCtx, {
          field: 'mime_type',
          operator: 'STARTS_WITH',
          value: 'image/',
        }),
      ).toBe(false);
    });

    it('evaluates GREATER_THAN and LESS_THAN operators', () => {
      expect(
        evaluateCondition(dummyContext, {
          field: 'byte_size',
          operator: 'GREATER_THAN',
          value: 1000000,
        }),
      ).toBe(true);
      expect(
        evaluateCondition(dummyContext, {
          field: 'byte_size',
          operator: 'GREATER_THAN',
          value: 5000000,
        }),
      ).toBe(false);

      expect(
        evaluateCondition(dummyContext, {
          field: 'byte_size',
          operator: 'LESS_THAN',
          value: 5000000,
        }),
      ).toBe(true);
      expect(
        evaluateCondition(dummyContext, {
          field: 'byte_size',
          operator: 'LESS_THAN',
          value: 1000000,
        }),
      ).toBe(false);
    });

    it('evaluates IN_ARRAY operator for array and scalar values', () => {
      expect(
        evaluateCondition(dummyContext, {
          field: 'mime_type',
          operator: 'IN_ARRAY',
          value: ['image/jpeg', 'image/png'],
        }),
      ).toBe(true);
      expect(
        evaluateCondition(dummyContext, {
          field: 'mime_type',
          operator: 'IN_ARRAY',
          value: ['video/mp4'],
        }),
      ).toBe(false);

      expect(
        evaluateCondition(dummyContext, {
          field: 'tags',
          operator: 'IN_ARRAY',
          value: ['marketing', 'sales'],
        }),
      ).toBe(true);
      expect(
        evaluateCondition(dummyContext, { field: 'tags', operator: 'IN_ARRAY', value: 'hero' }),
      ).toBe(true);
      expect(
        evaluateCondition(dummyContext, { field: 'tags', operator: 'IN_ARRAY', value: ['legal'] }),
      ).toBe(false);
    });

    it('returns false for unknown operator', () => {
      expect(
        evaluateCondition(dummyContext, {
          field: 'title',
          operator: 'UNKNOWN' as unknown as ConditionOperator,
          value: 'test',
        }),
      ).toBe(false);
    });

    it('evaluates multiple workflow conditions', () => {
      expect(evaluateWorkflowConditions(dummyContext, [])).toBe(true);
      expect(
        evaluateWorkflowConditions(dummyContext, [
          { field: 'mime_type', operator: 'STARTS_WITH', value: 'image/' },
          { field: 'byte_size', operator: 'GREATER_THAN', value: 1000 },
        ]),
      ).toBe(true);

      expect(
        evaluateWorkflowConditions(dummyContext, [
          { field: 'mime_type', operator: 'STARTS_WITH', value: 'image/' },
          { field: 'byte_size', operator: 'GREATER_THAN', value: 100000000 },
        ]),
      ).toBe(false);
    });
  });

  describe('3. Build Asset Context', () => {
    it('returns null if asset does not exist or is inactive', async () => {
      vi.mocked(db.query).mockResolvedValueOnce([]);

      const ctx = await buildAssetContext(100, 999);
      expect(ctx).toBeNull();
    });

    it('builds context with tags and AI metadata (JSON string and parsed objects)', async () => {
      // 1. Asset row
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 10,
          tenant_id: 100,
          title: 'Forest',
          mime_type: 'image/png',
          status: 'ACTIVE',
          deleted_at: null,
          storage_tier: 'HOT',
          byte_size: 5000,
        },
      ]);
      // 2. Tags
      vi.mocked(db.query).mockResolvedValueOnce([{ name: 'nature' }, { name: 'trees' }]);
      // 3. AI Metadata
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          labels: JSON.stringify([{ label: 'Forest' }, { label: 'Green' }]),
          dominant_colors: JSON.stringify([{ name: 'Green' }]),
        },
      ]);

      const ctx = await buildAssetContext(100, 10);
      expect(ctx).not.toBeNull();
      expect(ctx?.title).toBe('Forest');
      expect(ctx?.tags).toEqual(['nature', 'trees']);
      expect(ctx?.ai_labels).toEqual(['Forest', 'Green']);
      expect(ctx?.dominant_colors).toEqual(['Green']);
    });

    it('handles AI metadata already parsed as array objects', async () => {
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 10,
          tenant_id: 100,
          title: 'Ocean',
          mime_type: 'image/jpeg',
          status: 'ACTIVE',
          deleted_at: null,
          storage_tier: null,
          byte_size: null,
        },
      ]);
      vi.mocked(db.query).mockResolvedValueOnce(null as unknown as unknown[]);
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          labels: [{ label: 'Sea' }, {}],
          dominant_colors: [{ name: 'Blue' }, {}],
        },
      ]);

      const ctx = await buildAssetContext(100, 10);
      expect(ctx).not.toBeNull();
      expect(ctx?.storage_tier).toBe('HOT');
      expect(ctx?.byte_size).toBe(0);
      expect(ctx?.tags).toEqual([]);
      expect(ctx?.ai_labels).toEqual(['Sea']);
      expect(ctx?.dominant_colors).toEqual(['Blue']);
    });
  });

  describe('4. Execute Workflow Action', () => {
    it('executes APPLY_TAGS action (existing, new, and whitespace tags)', async () => {
      // Existing tag
      vi.mocked(db.query).mockResolvedValueOnce([{ id: 5 }]);
      vi.mocked(db.query).mockResolvedValueOnce({ affectedRows: 1 });
      // New tag
      vi.mocked(db.query).mockResolvedValueOnce([]);
      vi.mocked(db.query).mockResolvedValueOnce({ insertId: 6 });
      vi.mocked(db.query).mockResolvedValueOnce({ affectedRows: 1 });

      const res = await executeWorkflowAction(
        100,
        10,
        { type: 'APPLY_TAGS', params: { tags: ['existing-tag', 'new-tag', '   '] } },
        42,
      );

      expect(res.success).toBe(true);
      expect(res.actionType).toBe('APPLY_TAGS');
      expect(res.details.applied_tags).toEqual(['existing-tag', 'new-tag']);
    });

    it('executes MOVE_TO_COLLECTION action (valid and invalid ID)', async () => {
      // Valid
      vi.mocked(db.query).mockResolvedValueOnce({ affectedRows: 1 });
      const valid = await executeWorkflowAction(
        100,
        10,
        { type: 'MOVE_TO_COLLECTION', params: { collection_id: 3 } },
        42,
      );
      expect(valid.success).toBe(true);
      expect(valid.details.collection_id).toBe(3);

      // Invalid
      const invalid = await executeWorkflowAction(
        100,
        10,
        { type: 'MOVE_TO_COLLECTION', params: { collection_id: -1 } },
        42,
      );
      expect(invalid.success).toBe(false);
      expect(invalid.error).toContain('ID de colección inválido');
    });

    it('executes SET_RIGHTS action with custom and default params', async () => {
      vi.mocked(db.query).mockResolvedValueOnce({ affectedRows: 1 });
      const custom = await executeWorkflowAction(
        100,
        10,
        {
          type: 'SET_RIGHTS',
          params: {
            license_type: 'CC-BY-4.0',
            copyright_owner: 'Dreamtek Corp',
            embargo_until: '2026-12-31',
            expires_at: '2027-12-31',
          },
        },
        42,
      );
      expect(custom.success).toBe(true);
      expect(custom.details.license_type).toBe('CC-BY-4.0');

      // Defaults
      vi.mocked(db.query).mockResolvedValueOnce({ affectedRows: 1 });
      const def = await executeWorkflowAction(100, 10, { type: 'SET_RIGHTS' }, 42);
      expect(def.success).toBe(true);
      expect(def.details.license_type).toBe('PROPRIETARY');
    });

    it('executes ARCHIVE_ASSET action with custom and default reason', async () => {
      vi.mocked(db.query).mockResolvedValueOnce({ affectedRows: 1 });
      vi.mocked(db.query).mockResolvedValueOnce({ insertId: 1 });
      const res = await executeWorkflowAction(
        100,
        10,
        { type: 'ARCHIVE_ASSET', params: { reason: 'Lifecycle expiration' } },
        42,
      );
      expect(res.success).toBe(true);
      expect(res.details.reason).toBe('Lifecycle expiration');

      // Default reason
      vi.mocked(db.query).mockResolvedValueOnce({ affectedRows: 1 });
      vi.mocked(db.query).mockResolvedValueOnce({ insertId: 2 });
      const resDef = await executeWorkflowAction(100, 10, { type: 'ARCHIVE_ASSET' }, 42);
      expect(resDef.success).toBe(true);
      expect(resDef.details.reason).toBe('Automated workflow archival');
    });

    it('executes TRIGGER_WEBHOOK action with custom and default event', async () => {
      const res = await executeWorkflowAction(
        100,
        10,
        { type: 'TRIGGER_WEBHOOK', params: { event_name: 'asset.custom_alert' } },
        42,
      );
      expect(res.success).toBe(true);
      expect(webhookDispatcher.dispatchWebhookEvent).toHaveBeenCalled();

      // Default event
      const resDef = await executeWorkflowAction(100, 10, { type: 'TRIGGER_WEBHOOK' }, 42);
      expect(resDef.success).toBe(true);
    });

    it('executes TRIGGER_AI_ANALYSIS action with custom and default params', async () => {
      const res = await executeWorkflowAction(
        100,
        10,
        { type: 'TRIGGER_AI_ANALYSIS', params: { auto_tag: true, min_confidence: 0.8 } },
        42,
      );
      expect(res.success).toBe(true);
      expect(aiVisionEngine.analyzeAssetVisuals).toHaveBeenCalled();

      // Default params
      const resDef = await executeWorkflowAction(100, 10, { type: 'TRIGGER_AI_ANALYSIS' }, 42);
      expect(resDef.success).toBe(true);
    });

    it('returns failure for unsupported action type', async () => {
      const res = await executeWorkflowAction(
        100,
        10,
        { type: 'UNKNOWN_ACTION' as unknown as ActionType },
        42,
      );
      expect(res.success).toBe(false);
      expect(res.error).toContain('Tipo de acción no soportado');
    });

    it('catches and handles exceptions gracefully during action execution', async () => {
      vi.mocked(db.query).mockRejectedValueOnce(new Error('DB connection drop'));

      const res = await executeWorkflowAction(
        100,
        10,
        { type: 'MOVE_TO_COLLECTION', params: { collection_id: 5 } },
        42,
      );
      expect(res.success).toBe(false);
      expect(res.error).toBe('DB connection drop');

      // Test raw string rejection
      vi.mocked(db.query).mockRejectedValueOnce('Raw string rejection');
      const resRaw = await executeWorkflowAction(
        100,
        10,
        { type: 'MOVE_TO_COLLECTION', params: { collection_id: 5 } },
        42,
      );
      expect(resRaw.success).toBe(false);
      expect(resRaw.error).toBe('Raw string rejection');
    });
  });

  describe('5. Execute Workflow and Dispatch', () => {
    it('returns error if workflow does not exist', async () => {
      vi.mocked(db.query).mockResolvedValueOnce([]);

      const res = await executeWorkflow(100, 999, 10, 'MANUAL', 42);
      expect(res.success).toBe(false);
      expect(res.status).toBe('FAILED');
      expect(res.error).toContain('El flujo de trabajo no existe');
    });

    it('skips execution if workflow is inactive', async () => {
      vi.mocked(db.query).mockResolvedValueOnce([{ id: 1, tenant_id: 100, is_active: false }]);

      const res = await executeWorkflow(100, 1, 10, 'MANUAL', 42);
      expect(res.success).toBe(false);
      expect(res.status).toBe('SKIPPED');
    });

    it('returns error if asset does not exist', async () => {
      vi.mocked(db.query).mockResolvedValueOnce([
        { id: 1, tenant_id: 100, is_active: true, conditions: '[]', actions: '[]' },
      ]);
      // Asset context query fails
      vi.mocked(db.query).mockResolvedValueOnce([]);

      const res = await executeWorkflow(100, 1, 999, 'MANUAL', 42);
      expect(res.success).toBe(false);
      expect(res.status).toBe('FAILED');
      expect(res.error).toContain('El activo digital no existe');
    });

    it('records SKIPPED execution when conditions do not match', async () => {
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 1,
          tenant_id: 100,
          is_active: true,
          conditions: JSON.stringify([
            { field: 'mime_type', operator: 'EQUALS', value: 'video/mp4' },
          ]),
          actions: JSON.stringify([{ type: 'ARCHIVE_ASSET' }]),
        },
      ]);
      // Asset query
      vi.mocked(db.query).mockResolvedValueOnce([
        { id: 10, tenant_id: 100, title: 'Image', mime_type: 'image/png', status: 'ACTIVE' },
      ]);
      // Tags query
      vi.mocked(db.query).mockResolvedValueOnce([]);
      // AI metadata query
      vi.mocked(db.query).mockResolvedValueOnce([]);
      // Insert execution log
      vi.mocked(db.query).mockResolvedValueOnce({ insertId: 101 });

      const res = await executeWorkflow(100, 1, 10, 'ASSET_CREATED', 42);
      expect(res.success).toBe(true);
      expect(res.status).toBe('SKIPPED');
    });

    it('executes actions and records SUCCESS when conditions match', async () => {
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 1,
          tenant_id: 100,
          is_active: true,
          conditions: JSON.stringify([
            { field: 'mime_type', operator: 'STARTS_WITH', value: 'image/' },
          ]),
          actions: JSON.stringify([
            { type: 'TRIGGER_WEBHOOK', params: { event_name: 'asset.processed' } },
          ]),
        },
      ]);
      // Asset query
      vi.mocked(db.query).mockResolvedValueOnce([
        { id: 10, tenant_id: 100, title: 'Image', mime_type: 'image/png', status: 'ACTIVE' },
      ]);
      // Tags query
      vi.mocked(db.query).mockResolvedValueOnce([]);
      // AI metadata query
      vi.mocked(db.query).mockResolvedValueOnce([]);
      // Insert execution log
      vi.mocked(db.query).mockResolvedValueOnce({ insertId: 102 });

      const res = await executeWorkflow(100, 1, 10, 'ASSET_CREATED', 42);
      expect(res.success).toBe(true);
      expect(res.status).toBe('SUCCESS');
      expect(res.logs.actions_executed).toBe(1);
    });

    it('records FAILED when an action fails', async () => {
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 1,
          tenant_id: 100,
          is_active: true,
          conditions: '[]',
          actions: JSON.stringify([{ type: 'MOVE_TO_COLLECTION', params: { collection_id: -1 } }]),
        },
      ]);
      // Asset query
      vi.mocked(db.query).mockResolvedValueOnce([
        { id: 10, tenant_id: 100, title: 'Image', mime_type: 'image/png', status: 'ACTIVE' },
      ]);
      // Tags query
      vi.mocked(db.query).mockResolvedValueOnce([]);
      // AI metadata query
      vi.mocked(db.query).mockResolvedValueOnce([]);
      // Insert execution log
      vi.mocked(db.query).mockResolvedValueOnce({ insertId: 103 });

      const res = await executeWorkflow(100, 1, 10, 'MANUAL', 42);
      expect(res.success).toBe(false);
      expect(res.status).toBe('FAILED');
    });

    it('dispatchWorkflowsForEvent executes all active matching workflows', async () => {
      // 1. Fetch matching workflows
      vi.mocked(db.query).mockResolvedValueOnce([{ id: 1 }, { id: 2 }]);

      // First workflow execution (SUCCESS)
      vi.mocked(db.query).mockResolvedValueOnce([
        { id: 1, tenant_id: 100, is_active: true, conditions: '[]', actions: '[]' },
      ]);
      vi.mocked(db.query).mockResolvedValueOnce([
        { id: 10, tenant_id: 100, title: 'Doc', mime_type: 'application/pdf', status: 'ACTIVE' },
      ]);
      vi.mocked(db.query).mockResolvedValueOnce([]);
      vi.mocked(db.query).mockResolvedValueOnce([]);
      vi.mocked(db.query).mockResolvedValueOnce({ insertId: 1 });

      // Second workflow execution (SKIPPED)
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 2,
          tenant_id: 100,
          is_active: true,
          conditions: JSON.stringify([
            { field: 'mime_type', operator: 'EQUALS', value: 'video/mp4' },
          ]),
          actions: '[]',
        },
      ]);
      vi.mocked(db.query).mockResolvedValueOnce([
        { id: 10, tenant_id: 100, title: 'Doc', mime_type: 'application/pdf', status: 'ACTIVE' },
      ]);
      vi.mocked(db.query).mockResolvedValueOnce([]);
      vi.mocked(db.query).mockResolvedValueOnce([]);
      vi.mocked(db.query).mockResolvedValueOnce({ insertId: 2 });

      const result = await dispatchWorkflowsForEvent(100, 10, 'ASSET_CREATED', 42);
      expect(result.evaluated).toBe(2);
      expect(result.executed).toBe(1);
    });

    it('dispatchWorkflowsForEvent returns 0 if no matching workflows or on DB error', async () => {
      vi.mocked(db.query).mockResolvedValueOnce([]);
      const res1 = await dispatchWorkflowsForEvent(100, 10, 'ASSET_CREATED', 42);
      expect(res1.evaluated).toBe(0);

      vi.mocked(db.query).mockRejectedValueOnce(new Error('Fatal dispatch error'));
      const res2 = await dispatchWorkflowsForEvent(100, 10, 'ASSET_CREATED', 42);
      expect(res2.evaluated).toBe(0);
    });
  });

  describe('6. REST API Endpoints & Controller', () => {
    let app: express.Express;

    beforeEach(() => {
      app = express();
      app.use(express.json());
      app.use('/api/v1/workflows', workflowsRouter);
    });

    it('POST /api/v1/workflows creates a workflow successfully (201)', async () => {
      vi.mocked(db.query).mockResolvedValueOnce({ insertId: 10 });

      const res = await supertest(app)
        .post('/api/v1/workflows')
        .send({
          name: 'Image Tagger',
          trigger_event: 'ASSET_CREATED',
          conditions: [{ field: 'mime_type', operator: 'STARTS_WITH', value: 'image/' }],
          actions: [{ type: 'APPLY_TAGS', params: { tags: ['auto-tagged'] } }],
          is_active: true,
        });

      expect(res.status).toBe(201);
      expect(res.body.data.id).toBe(10);
      expect(auditLogger.logSecurityEvent).toHaveBeenCalled();
    });

    it('POST /api/v1/workflows handles 500 server error', async () => {
      vi.mocked(db.query).mockRejectedValueOnce(new Error('DB Error'));

      const res = await supertest(app)
        .post('/api/v1/workflows')
        .send({
          name: 'Image Tagger',
          trigger_event: 'ASSET_CREATED',
          actions: [{ type: 'APPLY_TAGS' }],
        });

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Internal Server Error');
    });

    it('GET /api/v1/workflows lists tenant workflows (200)', async () => {
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 1,
          tenant_id: 100,
          name: 'Workflow 1',
          description: null,
          trigger_event: 'ASSET_CREATED',
          conditions: '[]',
          actions: JSON.stringify([{ type: 'ARCHIVE_ASSET' }]),
          is_active: 1,
          created_by: 42,
          created_at: '2026-08-22',
          updated_at: '2026-08-22',
        },
      ]);

      const res = await supertest(app).get('/api/v1/workflows');
      expect(res.status).toBe(200);
      expect(res.body.data.total).toBe(1);
      expect(res.body.data.workflows[0].is_active).toBe(true);
    });

    it('GET /api/v1/workflows handles 500 error', async () => {
      vi.mocked(db.query).mockRejectedValueOnce(new Error('DB Error'));

      const res = await supertest(app).get('/api/v1/workflows');
      expect(res.status).toBe(500);
    });

    it('GET /api/v1/workflows/:id retrieves single workflow or 404', async () => {
      // 400 invalid id
      const resBad = await supertest(app).get('/api/v1/workflows/abc');
      expect(resBad.status).toBe(400);

      // 404 not found
      vi.mocked(db.query).mockResolvedValueOnce([]);
      const res404 = await supertest(app).get('/api/v1/workflows/99');
      expect(res404.status).toBe(404);

      // 200 found
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 1,
          tenant_id: 100,
          name: 'Workflow 1',
          description: 'Desc',
          trigger_event: 'MANUAL',
          conditions: [],
          actions: [{ type: 'ARCHIVE_ASSET' }],
          is_active: true,
          created_by: 42,
        },
      ]);
      const res200 = await supertest(app).get('/api/v1/workflows/1');
      expect(res200.status).toBe(200);
      expect(res200.body.data.name).toBe('Workflow 1');

      // 500 error
      vi.mocked(db.query).mockRejectedValueOnce(new Error('DB Error'));
      const res500 = await supertest(app).get('/api/v1/workflows/1');
      expect(res500.status).toBe(500);
    });

    it('PUT /api/v1/workflows/:id updates workflow with full or partial updates', async () => {
      // 400 invalid id
      const resBad = await supertest(app).put('/api/v1/workflows/abc').send({ name: 'Valid Name' });
      expect(resBad.status).toBe(400);

      // 404 not found
      vi.mocked(db.query).mockResolvedValueOnce([]);
      const res404 = await supertest(app).put('/api/v1/workflows/99').send({ name: 'Valid Name' });
      expect(res404.status).toBe(404);

      // 200 success partial update (fallback to current fields)
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 1,
          tenant_id: 100,
          name: 'Old Name',
          description: 'Old Desc',
          trigger_event: 'MANUAL',
          conditions: '[]',
          actions: '[]',
          is_active: 1,
        },
      ]);
      vi.mocked(db.query).mockResolvedValueOnce({ affectedRows: 1 });

      const res200 = await supertest(app).put('/api/v1/workflows/1').send({
        name: 'New Name',
        is_active: false,
      });
      expect(res200.status).toBe(200);
      expect(res200.body.data.name).toBe('New Name');
      expect(res200.body.data.is_active).toBe(false);

      // 200 partial update without name / is_active
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 1,
          tenant_id: 100,
          name: 'Old Name',
          description: 'Old Desc',
          trigger_event: 'MANUAL',
          conditions: '[]',
          actions: '[]',
          is_active: 1,
        },
      ]);
      vi.mocked(db.query).mockResolvedValueOnce({ affectedRows: 1 });
      const resPartial2 = await supertest(app).put('/api/v1/workflows/1').send({
        description: 'Only new desc',
        trigger_event: 'ASSET_UPDATED',
      });
      expect(resPartial2.status).toBe(200);
      expect(resPartial2.body.data.name).toBe('Old Name');
      expect(resPartial2.body.data.description).toBe('Only new desc');

      // 200 success full update (all explicit fields provided)
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 1,
          tenant_id: 100,
          name: 'Old Name',
          description: 'Old Desc',
          trigger_event: 'MANUAL',
          conditions: '[]',
          actions: '[]',
          is_active: 1,
        },
      ]);
      vi.mocked(db.query).mockResolvedValueOnce({ affectedRows: 1 });

      const resFull = await supertest(app)
        .put('/api/v1/workflows/1')
        .send({
          name: 'Full Name',
          description: 'New Description',
          trigger_event: 'ASSET_CREATED',
          conditions: [{ field: 'mime_type', operator: 'STARTS_WITH', value: 'video/' }],
          actions: [{ type: 'ARCHIVE_ASSET', params: { reason: 'Video archive' } }],
          is_active: true,
        });
      expect(resFull.status).toBe(200);
      expect(resFull.body.data.name).toBe('Full Name');
      expect(resFull.body.data.description).toBe('New Description');
      expect(resFull.body.data.trigger_event).toBe('ASSET_CREATED');

      // 500 error
      vi.mocked(db.query).mockRejectedValueOnce(new Error('DB Error'));
      const res500 = await supertest(app).put('/api/v1/workflows/1').send({ name: 'New Name' });
      expect(res500.status).toBe(500);
    });

    it('DELETE /api/v1/workflows/:id deletes workflow or handles errors', async () => {
      // 400 invalid id
      const resBad = await supertest(app).delete('/api/v1/workflows/abc');
      expect(resBad.status).toBe(400);

      // 404 not found
      vi.mocked(db.query).mockResolvedValueOnce([]);
      const res404 = await supertest(app).delete('/api/v1/workflows/99');
      expect(res404.status).toBe(404);

      // 200 success
      vi.mocked(db.query).mockResolvedValueOnce([{ id: 1, tenant_id: 100 }]);
      vi.mocked(db.query).mockResolvedValueOnce({ affectedRows: 1 });

      const res200 = await supertest(app).delete('/api/v1/workflows/1');
      expect(res200.status).toBe(200);
      expect(res200.body.data.id).toBe(1);

      // 500 error
      vi.mocked(db.query).mockRejectedValueOnce(new Error('DB Error'));
      const res500 = await supertest(app).delete('/api/v1/workflows/1');
      expect(res500.status).toBe(500);
    });

    it('POST /api/v1/workflows/:id/execute/:assetId executes workflow manually', async () => {
      // 400 invalid params
      const resBad = await supertest(app).post('/api/v1/workflows/abc/execute/10');
      expect(resBad.status).toBe(400);

      // 200 Success execution
      vi.mocked(db.query).mockResolvedValueOnce([
        { id: 1, tenant_id: 100, is_active: true, conditions: '[]', actions: '[]' },
      ]);
      vi.mocked(db.query).mockResolvedValueOnce([
        { id: 10, tenant_id: 100, title: 'Photo', mime_type: 'image/jpeg', status: 'ACTIVE' },
      ]);
      vi.mocked(db.query).mockResolvedValueOnce([]);
      vi.mocked(db.query).mockResolvedValueOnce([]);
      vi.mocked(db.query).mockResolvedValueOnce({ insertId: 100 });

      const res200 = await supertest(app).post('/api/v1/workflows/1/execute/10');
      expect(res200.status).toBe(200);
      expect(res200.body.data.status).toBe('SUCCESS');

      // 400 Failed execution (e.g. invalid action param)
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 1,
          tenant_id: 100,
          is_active: true,
          conditions: '[]',
          actions: JSON.stringify([{ type: 'MOVE_TO_COLLECTION', params: { collection_id: -1 } }]),
        },
      ]);
      vi.mocked(db.query).mockResolvedValueOnce([
        { id: 10, tenant_id: 100, title: 'Photo', mime_type: 'image/jpeg', status: 'ACTIVE' },
      ]);
      vi.mocked(db.query).mockResolvedValueOnce([]);
      vi.mocked(db.query).mockResolvedValueOnce([]);
      vi.mocked(db.query).mockResolvedValueOnce({ insertId: 101 });

      const resFail = await supertest(app).post('/api/v1/workflows/1/execute/10');
      expect(resFail.status).toBe(400);

      // 500 error
      vi.mocked(db.query).mockRejectedValueOnce(new Error('Crash'));
      const res500 = await supertest(app).post('/api/v1/workflows/1/execute/10');
      expect(res500.status).toBe(500);
    });

    it('GET /api/v1/workflows/:id/executions retrieves execution logs (with/without status filter)', async () => {
      // 400 invalid id
      const resBad = await supertest(app).get('/api/v1/workflows/abc/executions');
      expect(resBad.status).toBe(400);

      // 200 success with filter
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 1,
          tenant_id: 100,
          workflow_id: 1,
          asset_id: 10,
          trigger_event: 'MANUAL',
          status: 'SUCCESS',
          execution_logs: JSON.stringify({ matched: true }),
          executed_at: '2026-08-22',
        },
      ]);

      const res200 = await supertest(app).get(
        '/api/v1/workflows/1/executions?status=SUCCESS&limit=10',
      );
      expect(res200.status).toBe(200);
      expect(res200.body.data.total).toBe(1);
      expect(res200.body.data.executions[0].status).toBe('SUCCESS');

      // 200 success without status filter
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 2,
          tenant_id: 100,
          workflow_id: 1,
          asset_id: 10,
          trigger_event: 'MANUAL',
          status: 'SKIPPED',
          execution_logs: [{ matched: false }],
          executed_at: '2026-08-22',
        },
      ]);
      const resNoStatus = await supertest(app).get('/api/v1/workflows/1/executions');
      expect(resNoStatus.status).toBe(200);
      expect(resNoStatus.body.data.executions[0].status).toBe('SKIPPED');

      // 500 error
      vi.mocked(db.query).mockRejectedValueOnce(new Error('Crash'));
      const res500 = await supertest(app).get('/api/v1/workflows/1/executions');
      expect(res500.status).toBe(500);
    });
  });

  describe('7. Rate Limiter Handler', () => {
    it('triggers workflowsRateLimiter 429 response handler', async () => {
      const appLimit = express();
      appLimit.use(workflowsRateLimiter);
      appLimit.get('/test-limit', (_req, res) => res.json({ ok: true }));

      for (let i = 0; i < 30; i++) {
        await supertest(appLimit).get('/test-limit');
      }
      const resBlocked = await supertest(appLimit).get('/test-limit');
      expect(resBlocked.status).toBe(429);
      expect(resBlocked.body.message).toMatch(/Límite de operaciones de flujos de trabajo/);
    });
  });
});
