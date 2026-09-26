/* eslint-disable @typescript-eslint/no-explicit-any */
import { query } from '../db.js';
import type { NotificationType, NotificationSeverity } from '../schemas/notification.schema.js';

export interface CreateNotificationParams {
  tenantId?: number;
  userId: number | string;
  type: NotificationType;
  severity?: NotificationSeverity;
  title: string;
  message: string;
  actionUrl?: string | null;
}

/**
 * Resuelve de forma segura el tenant_id de la base de datos (C-053.1).
 * Verifica en client_projects, client_sites o tenants. Si no existe, recurre al tenant por defecto.
 */
export async function resolveTenantForUser(userId: number | string): Promise<number> {
  const numericUserId = Number(userId);

  // 1. Buscar en client_projects
  const projectRows = await query<any[]>(
    'SELECT tenant_id FROM client_projects WHERE user_id = ? AND tenant_id IS NOT NULL LIMIT 1',
    [numericUserId],
  );
  if (projectRows.length > 0 && projectRows[0].tenant_id) {
    return Number(projectRows[0].tenant_id);
  }

  // 2. Buscar en client_sites
  const siteRows = await query<any[]>(
    'SELECT tenant_id FROM client_sites WHERE user_id = ? AND tenant_id IS NOT NULL LIMIT 1',
    [numericUserId],
  );
  if (siteRows.length > 0 && siteRows[0].tenant_id) {
    return Number(siteRows[0].tenant_id);
  }

  // 3. Buscar en tenants por owner_user_id
  const tenantRows = await query<any[]>(
    'SELECT id FROM tenants WHERE owner_user_id = ? LIMIT 1',
    [numericUserId],
  );
  if (tenantRows.length > 0 && tenantRows[0].id) {
    return Number(tenantRows[0].id);
  }

  // Sin fallback global a tenant ajeno: fail-closed anti-cross-tenant (C-053.1)
  const err: any = new Error('Cuenta de usuario sin tenant asignado.');
  err.statusCode = 400;
  throw err;
}

/**
 * Crea una notificación transaccional persistente para un usuario cliente.
 */
export async function createClientNotification(params: CreateNotificationParams): Promise<number> {
  const tenantId = params.tenantId || (await resolveTenantForUser(params.userId));
  const severity = params.severity || 'INFO';
  const actionUrl = params.actionUrl || null;

  const result = await query<any>(
    `INSERT INTO client_notifications 
     (tenant_id, user_id, type, severity, title, message, action_url, is_read, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 0, NOW())`,
    [
      tenantId,
      Number(params.userId),
      params.type,
      severity,
      params.title,
      params.message,
      actionUrl,
    ],
  );

  return Number(result.insertId);
}

/**
 * Obtiene las notificaciones paginadas y el contador de no leídas para un usuario/tenant.
 */
export async function getClientNotifications(params: {
  tenantId: number;
  userId: number | string;
  isRead?: boolean;
  limit?: number;
  offset?: number;
}): Promise<{ notifications: any[]; total: number; unreadCount: number }> {
  const numericUserId = Number(params.userId);
  const limit = Math.min(Math.max(params.limit || 20, 1), 100);
  const offset = Math.max(params.offset || 0, 0);

  let whereClause = 'WHERE tenant_id = ? AND user_id = ?';
  const queryParams: any[] = [params.tenantId, numericUserId];

  if (params.isRead !== undefined) {
    whereClause += ' AND is_read = ?';
    queryParams.push(params.isRead ? 1 : 0);
  }

  // Contador total con filtro
  const countRows = await query<any[]>(
    `SELECT COUNT(*) AS total FROM client_notifications ${whereClause}`,
    queryParams,
  );
  const total = Number(countRows[0]?.total || 0);

  // Contador específico de no leídas
  const unreadRows = await query<any[]>(
    'SELECT COUNT(*) AS unread_count FROM client_notifications WHERE tenant_id = ? AND user_id = ? AND is_read = 0',
    [params.tenantId, numericUserId],
  );
  const unreadCount = Number(unreadRows[0]?.unread_count || 0);

  // Listado ordenado cronológicamente descendente
  const listParams = [...queryParams, limit, offset];
  const notifications = await query<any[]>(
    `SELECT id, tenant_id, user_id, type, severity, title, message, action_url, is_read, created_at, read_at
     FROM client_notifications
     ${whereClause}
     ORDER BY created_at DESC, id DESC
     LIMIT ? OFFSET ?`,
    listParams,
  );

  return { notifications, total, unreadCount };
}

/**
 * Marca una notificación como leída con validación estricta anti-IDOR (C-053.1).
 */
export async function markNotificationAsRead(
  notificationId: number | string,
  tenantId: number,
  userId: number | string,
): Promise<boolean> {
  const result = await query<any>(
    `UPDATE client_notifications 
     SET is_read = 1, read_at = NOW() 
     WHERE id = ? AND tenant_id = ? AND user_id = ?`,
    [Number(notificationId), tenantId, Number(userId)],
  );

  return result.affectedRows > 0;
}

/**
 * Marca todas las notificaciones pendientes del usuario como leídas.
 */
export async function markAllNotificationsAsRead(
  tenantId: number,
  userId: number | string,
): Promise<number> {
  const result = await query<any>(
    `UPDATE client_notifications 
     SET is_read = 1, read_at = NOW() 
     WHERE tenant_id = ? AND user_id = ? AND is_read = 0`,
    [tenantId, Number(userId)],
  );

  return result.affectedRows;
}
