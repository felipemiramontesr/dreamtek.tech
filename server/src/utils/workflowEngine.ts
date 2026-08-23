import { query } from '../db';
import {
  WorkflowCondition,
  WorkflowAction,
  TriggerEvent,
  ActionType,
} from '../schemas/workflow.schema';
import { dispatchWebhookEvent } from './webhookDispatcher';
import { analyzeAssetVisuals } from './aiVisionEngine';

export interface AssetContext {
  id: number;
  tenant_id: number;
  title: string;
  mime_type: string;
  byte_size: number;
  storage_tier: string;
  tags: string[];
  ai_labels: string[];
  dominant_colors: string[];
  [key: string]: any;
}

export function parseJsonArray(val: any): any[] {
  if (typeof val === 'string') {
    return JSON.parse(val);
  }
  return val || [];
}

/**
 * Evaluates a single workflow condition against the asset context.
 */
export function evaluateCondition(
  assetContext: AssetContext,
  condition: WorkflowCondition,
): boolean {
  const { field, operator, value } = condition;
  const assetVal = assetContext[field];

  switch (operator) {
    case 'EQUALS':
      return String(assetVal).toLowerCase() === String(value).toLowerCase();

    case 'NOT_EQUALS':
      return String(assetVal).toLowerCase() !== String(value).toLowerCase();

    case 'CONTAINS':
      if (Array.isArray(assetVal)) {
        return assetVal.some((item) =>
          String(item).toLowerCase().includes(String(value).toLowerCase()),
        );
      }
      return String(assetVal || '')
        .toLowerCase()
        .includes(String(value).toLowerCase());

    case 'STARTS_WITH':
      return String(assetVal || '')
        .toLowerCase()
        .startsWith(String(value).toLowerCase());

    case 'GREATER_THAN':
      return Number(assetVal) > Number(value);

    case 'LESS_THAN':
      return Number(assetVal) < Number(value);

    case 'IN_ARRAY': {
      const allowed = Array.isArray(value) ? value : [value];
      if (Array.isArray(assetVal)) {
        return assetVal.some((v) =>
          allowed.map((a) => String(a).toLowerCase()).includes(String(v).toLowerCase()),
        );
      }
      return allowed.map((a) => String(a).toLowerCase()).includes(String(assetVal).toLowerCase());
    }

    default:
      return false;
  }
}

/**
 * Evaluates a list of workflow conditions (AND logic).
 */
export function evaluateWorkflowConditions(
  assetContext: AssetContext,
  conditions: WorkflowCondition[],
): boolean {
  if (!conditions || conditions.length === 0) {
    return true;
  }
  return conditions.every((cond) => evaluateCondition(assetContext, cond));
}

/**
 * Builds the complete asset evaluation context for a given asset.
 */
export async function buildAssetContext(
  tenantId: number,
  assetId: number,
): Promise<AssetContext | null> {
  const assetRows = await query<any[]>(
    `SELECT a.id, a.tenant_id, a.title, a.mime_type, a.status, a.deleted_at, a.storage_tier,
            v.byte_size
     FROM assets a
     LEFT JOIN asset_versions v ON v.asset_id = a.id AND v.version_number = (
       SELECT MAX(v2.version_number) FROM asset_versions v2 WHERE v2.asset_id = a.id
     )
     WHERE a.id = ? AND a.tenant_id = ? AND a.deleted_at IS NULL AND a.status = 'ACTIVE'`,
    [assetId, tenantId],
  );

  if (!assetRows || assetRows.length === 0) {
    return null;
  }

  const asset = assetRows[0];

  // Fetch tags
  const tagRows = await query<any[]>(
    `SELECT t.name FROM tags t
     JOIN asset_tags at ON at.tag_id = t.id
     WHERE at.asset_id = ? AND t.tenant_id = ?`,
    [assetId, tenantId],
  );
  const tags = (tagRows || []).map((t) => t.name);

  // Fetch AI labels and dominant colors
  const aiRows = await query<any[]>(
    `SELECT labels, dominant_colors FROM asset_ai_metadata
     WHERE tenant_id = ? AND asset_id = ? AND status = 'COMPLETED'
     ORDER BY id DESC LIMIT 1`,
    [tenantId, assetId],
  );

  const aiLabels: string[] = [];
  const dominantColors: string[] = [];

  if (aiRows && aiRows.length > 0) {
    const aiRow = aiRows[0];
    const parsedLabels = parseJsonArray(aiRow.labels);
    parsedLabels.forEach((l: any) => {
      if (l.label) aiLabels.push(l.label);
    });

    const parsedColors = parseJsonArray(aiRow.dominant_colors);
    parsedColors.forEach((c: any) => {
      if (c.name) dominantColors.push(c.name);
    });
  }

  return {
    id: asset.id,
    tenant_id: asset.tenant_id,
    title: asset.title,
    mime_type: asset.mime_type,
    byte_size: Number(asset.byte_size || 0),
    storage_tier: asset.storage_tier || 'HOT',
    tags,
    ai_labels: aiLabels,
    dominant_colors: dominantColors,
  };
}

/**
 * Executes a single workflow action on an asset.
 */
export async function executeWorkflowAction(
  tenantId: number,
  assetId: number,
  action: WorkflowAction,
  actorId: number,
): Promise<{ success: boolean; error?: string; actionType: ActionType; details?: any }> {
  try {
    switch (action.type) {
      case 'APPLY_TAGS': {
        const rawTags: string[] = parseJsonArray(action.params?.tags);
        const applied: string[] = [];

        for (const tagName of rawTags) {
          const trimmed = String(tagName).trim();
          if (trimmed.length > 0) {
            const tagRows = await query<any[]>(
              'SELECT id FROM tags WHERE tenant_id = ? AND name = ? LIMIT 1',
              [tenantId, trimmed],
            );
            let tagId: number;
            if (tagRows && tagRows.length > 0) {
              tagId = tagRows[0].id;
            } else {
              const insertRes = await query<any>(
                'INSERT INTO tags (tenant_id, name, created_by) VALUES (?, ?, ?)',
                [tenantId, trimmed, actorId],
              );
              tagId = insertRes.insertId;
            }

            await query(
              'INSERT IGNORE INTO asset_tags (tenant_id, asset_id, tag_id, created_by) VALUES (?, ?, ?, ?)',
              [tenantId, assetId, tagId, actorId],
            );
            applied.push(trimmed);
          }
        }
        return { success: true, actionType: 'APPLY_TAGS', details: { applied_tags: applied } };
      }

      case 'MOVE_TO_COLLECTION': {
        const collectionId = Number(action.params?.collection_id);
        if (isNaN(collectionId) || collectionId <= 0) {
          return {
            success: false,
            actionType: 'MOVE_TO_COLLECTION',
            error: 'ID de colección inválido en parámetros de acción.',
          };
        }

        await query('UPDATE assets SET collection_id = ? WHERE id = ? AND tenant_id = ?', [
          collectionId,
          assetId,
          tenantId,
        ]);
        return {
          success: true,
          actionType: 'MOVE_TO_COLLECTION',
          details: { collection_id: collectionId },
        };
      }

      case 'SET_RIGHTS': {
        const licenseType = String(action.params?.license_type || 'PROPRIETARY');
        const copyrightOwner = action.params?.copyright_owner || null;
        const embargoUntil = action.params?.embargo_until || null;
        const expiresAt = action.params?.expires_at || null;

        await query(
          `INSERT INTO asset_rights
            (tenant_id, asset_id, license_type, copyright_owner, embargo_until, expires_at, created_by)
           VALUES (?, ?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE
            license_type = VALUES(license_type),
            copyright_owner = VALUES(copyright_owner),
            embargo_until = VALUES(embargo_until),
            expires_at = VALUES(expires_at)`,
          [tenantId, assetId, licenseType, copyrightOwner, embargoUntil, expiresAt, actorId],
        );
        return {
          success: true,
          actionType: 'SET_RIGHTS',
          details: { license_type: licenseType },
        };
      }

      case 'ARCHIVE_ASSET': {
        const reason = String(action.params?.reason || 'Automated workflow archival');
        await query(
          `UPDATE assets SET storage_tier = 'ARCHIVED', archived_at = NOW()
           WHERE id = ? AND tenant_id = ?`,
          [assetId, tenantId],
        );

        await query(
          `INSERT INTO asset_archival_records
            (tenant_id, asset_id, previous_tier, target_tier, status, reason, requested_by)
           VALUES (?, ?, 'HOT', 'ARCHIVED', 'COMPLETED', ?, ?)`,
          [tenantId, assetId, reason, actorId],
        );
        return { success: true, actionType: 'ARCHIVE_ASSET', details: { reason } };
      }

      case 'TRIGGER_WEBHOOK': {
        const eventName = String(action.params?.event_name || 'asset.workflow_triggered');
        await dispatchWebhookEvent(tenantId, eventName, {
          asset_id: assetId,
          triggered_by_workflow: true,
          timestamp: new Date().toISOString(),
        });
        return {
          success: true,
          actionType: 'TRIGGER_WEBHOOK',
          details: { event_name: eventName },
        };
      }

      case 'TRIGGER_AI_ANALYSIS': {
        const autoTag = Boolean(action.params?.auto_tag ?? true);
        const minConfidence = Number(action.params?.min_confidence ?? 0.7);

        await analyzeAssetVisuals(tenantId, assetId, {
          auto_tag: autoTag,
          min_confidence: minConfidence,
          force_refresh: true,
        });

        return {
          success: true,
          actionType: 'TRIGGER_AI_ANALYSIS',
          details: { auto_tag: autoTag, min_confidence: minConfidence },
        };
      }

      default:
        return {
          success: false,
          actionType: action.type,
          error: `Tipo de acción no soportado: ${action.type}`,
        };
    }
  } catch (err: any) {
    return {
      success: false,
      actionType: action.type,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Executes a specific workflow on an asset.
 */
export async function executeWorkflow(
  tenantId: number,
  workflowId: number,
  assetId: number,
  triggerEvent: TriggerEvent,
  actorId: number,
): Promise<{ success: boolean; status: 'SUCCESS' | 'FAILED' | 'SKIPPED'; logs: any; error?: string }> {
  // 1. Fetch workflow definition
  const workflowRows = await query<any[]>(
    'SELECT * FROM dam_workflows WHERE id = ? AND tenant_id = ? LIMIT 1',
    [workflowId, tenantId],
  );

  if (!workflowRows || workflowRows.length === 0) {
    return {
      success: false,
      status: 'FAILED',
      logs: null,
      error: 'El flujo de trabajo no existe o no pertenece al inquilino.',
    };
  }

  const workflow = workflowRows[0];
  if (!workflow.is_active) {
    return {
      success: false,
      status: 'SKIPPED',
      logs: { message: 'El flujo de trabajo está inactivo.' },
    };
  }

  // 2. Build asset context
  const assetContext = await buildAssetContext(tenantId, assetId);
  if (!assetContext) {
    return {
      success: false,
      status: 'FAILED',
      logs: null,
      error: 'El activo digital no existe o no se encuentra activo.',
    };
  }

  const conditions: WorkflowCondition[] = parseJsonArray(workflow.conditions);
  const actions: WorkflowAction[] = parseJsonArray(workflow.actions);

  // 3. Evaluate conditions
  const matches = evaluateWorkflowConditions(assetContext, conditions);
  if (!matches) {
    const logs = {
      evaluated_conditions: conditions.length,
      matched: false,
      message: 'Las condiciones del flujo de trabajo no se cumplieron para este activo.',
    };

    await query(
      `INSERT INTO dam_workflow_executions
        (tenant_id, workflow_id, asset_id, trigger_event, status, execution_logs)
       VALUES (?, ?, ?, ?, 'SKIPPED', ?)`,
      [tenantId, workflowId, assetId, triggerEvent, JSON.stringify(logs)],
    );

    return {
      success: true,
      status: 'SKIPPED',
      logs,
    };
  }

  // 4. Execute actions
  const executionResults: any[] = [];
  let overallSuccess = true;

  for (const action of actions) {
    const actionResult = await executeWorkflowAction(tenantId, assetId, action, actorId);
    executionResults.push(actionResult);
    if (!actionResult.success) {
      overallSuccess = false;
      break;
    }
  }

  const finalStatus: 'SUCCESS' | 'FAILED' = overallSuccess ? 'SUCCESS' : 'FAILED';
  const executionLogs = {
    evaluated_conditions: conditions.length,
    matched: true,
    actions_executed: executionResults.length,
    results: executionResults,
  };

  await query(
    `INSERT INTO dam_workflow_executions
      (tenant_id, workflow_id, asset_id, trigger_event, status, execution_logs)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [tenantId, workflowId, assetId, triggerEvent, finalStatus, JSON.stringify(executionLogs)],
  );

  return {
    success: overallSuccess,
    status: finalStatus,
    logs: executionLogs,
  };
}

/**
 * Dispatches and evaluates all active workflows for a tenant matching a specific trigger event.
 */
export async function dispatchWorkflowsForEvent(
  tenantId: number,
  assetId: number,
  triggerEvent: TriggerEvent,
  actorId: number,
): Promise<{ evaluated: number; executed: number }> {
  try {
    const rows = await query<any[]>(
      `SELECT id FROM dam_workflows
       WHERE tenant_id = ? AND trigger_event = ? AND is_active = TRUE`,
      [tenantId, triggerEvent],
    );

    if (!rows || rows.length === 0) {
      return { evaluated: 0, executed: 0 };
    }

    let executedCount = 0;
    for (const row of rows) {
      const execRes = await executeWorkflow(tenantId, row.id, assetId, triggerEvent, actorId);
      if (execRes.status === 'SUCCESS') {
        executedCount++;
      }
    }

    return { evaluated: rows.length, executed: executedCount };
  } catch (err: any) {
    console.warn(`[WORKFLOW_DISPATCH_WARNING] Error evaluating workflows: ${err.message}`);
    return { evaluated: 0, executed: 0 };
  }
}
