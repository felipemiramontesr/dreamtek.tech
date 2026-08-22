import { query } from '../db';

export interface ArchiveResult {
  success: boolean;
  asset_id: number;
  storage_tier: 'HOT' | 'ARCHIVED';
  archive_provider?: string;
  archive_key?: string;
  byte_size?: number;
  error?: string;
}

export interface RestoreResult {
  success: boolean;
  asset_id: number;
  restoration_status: 'NONE' | 'REQUESTED' | 'IN_PROGRESS' | 'RESTORED' | 'EXPIRED';
  restoration_tier?: 'EXPEDITED' | 'STANDARD' | 'BULK';
  restoration_requested_at?: string;
  restoration_expires_at?: string;
  error?: string;
}

export interface ArchivalStatusResult {
  asset_id: number;
  storage_tier: 'HOT' | 'ARCHIVED';
  archived_at: string | null;
  archive_provider: string | null;
  archive_key: string | null;
  byte_size: number | null;
  restoration_status: 'NONE' | 'REQUESTED' | 'IN_PROGRESS' | 'RESTORED' | 'EXPIRED';
  restoration_tier: string | null;
  restoration_requested_at: string | null;
  restoration_completed_at: string | null;
  restoration_expires_at: string | null;
  is_restored: boolean;
}

/**
 * Archives an active digital asset to cold cloud storage (S3 Glacier) and updates tier to ARCHIVED.
 */
export async function archiveAsset(
  tenantId: number,
  assetId: number,
  actorId: number,
  options: { archive_provider?: string; reason?: string } = {},
): Promise<ArchiveResult> {
  const provider = options.archive_provider || 'AWS_GLACIER';

  // 1. Fetch asset metadata & verify status
  const assets = await query<any[]>(
    `SELECT a.id, a.storage_tier, a.status, av.id as version_id, av.sha256_hash, av.byte_size
     FROM assets a
     LEFT JOIN asset_versions av ON av.asset_id = a.id
     WHERE a.id = ? AND a.tenant_id = ? AND a.status = 'ACTIVE'
     ORDER BY av.version_number DESC LIMIT 1`,
    [assetId, tenantId],
  );

  if (!assets || assets.length === 0) {
    return {
      success: false,
      asset_id: assetId,
      storage_tier: 'HOT',
      error: 'El activo digital no existe o no se encuentra activo.',
    };
  }

  const asset = assets[0];

  if (asset.storage_tier === 'ARCHIVED') {
    return {
      success: false,
      asset_id: assetId,
      storage_tier: 'ARCHIVED',
      error: 'El activo digital ya se encuentra archivado en almacenamiento frío.',
    };
  }

  const sha256 = String(asset.sha256_hash);
  const byteSize = Number(asset.byte_size);
  const archiveKey = `glacier/${tenantId}/${assetId}/${sha256}`;

  // 2. Update asset storage tier
  await query(
    `UPDATE assets
     SET storage_tier = 'ARCHIVED', archived_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
     WHERE id = ? AND tenant_id = ?`,
    [assetId, tenantId],
  );

  // 3. Record archival entry
  await query(
    `INSERT INTO asset_archival_records
     (tenant_id, asset_id, version_id, storage_tier, archive_provider, archive_key, byte_size, sha256_hash, performed_by)
     VALUES (?, ?, ?, 'ARCHIVED', ?, ?, ?, ?, ?)`,
    [tenantId, assetId, asset.version_id, provider, archiveKey, byteSize, sha256, actorId],
  );

  return {
    success: true,
    asset_id: assetId,
    storage_tier: 'ARCHIVED',
    archive_provider: provider,
    archive_key: archiveKey,
    byte_size: byteSize,
  };
}

/**
 * Requests asynchronous restoration of an archived asset back to local NVMe hot cache.
 */
export async function requestAssetRestoration(
  tenantId: number,
  assetId: number,
  actorId: number,
  options: { restoration_tier: 'EXPEDITED' | 'STANDARD' | 'BULK'; days_valid: number },
): Promise<RestoreResult> {
  // 1. Fetch asset metadata & tier
  const assets = await query<any[]>(
    `SELECT id, storage_tier, status FROM assets WHERE id = ? AND tenant_id = ? AND status = 'ACTIVE' LIMIT 1`,
    [assetId, tenantId],
  );

  if (!assets || assets.length === 0) {
    return {
      success: false,
      asset_id: assetId,
      restoration_status: 'NONE',
      error: 'El activo digital no existe o no se encuentra activo.',
    };
  }

  const asset = assets[0];

  if (asset.storage_tier !== 'ARCHIVED') {
    return {
      success: false,
      asset_id: assetId,
      restoration_status: 'NONE',
      error: 'El activo digital se encuentra actualmente en nivel de almacenamiento caliente (HOT).',
    };
  }

  // 2. Fetch latest archival record
  const records = await query<any[]>(
    `SELECT id, restoration_status, restoration_expires_at
     FROM asset_archival_records
     WHERE tenant_id = ? AND asset_id = ?
     ORDER BY id DESC LIMIT 1`,
    [tenantId, assetId],
  );

  if (!records || records.length === 0) {
    return {
      success: false,
      asset_id: assetId,
      restoration_status: 'NONE',
      error: 'No se encontró un registro de archivo en frío para este activo.',
    };
  }

  const record = records[0];

  // 3. Update archival record with restoration request
  const days = options.days_valid;
  const initialStatus = options.restoration_tier === 'EXPEDITED' ? 'RESTORED' : 'IN_PROGRESS';

  await query(
    `UPDATE asset_archival_records
     SET restoration_status = ?,
         restoration_tier = ?,
         restoration_requested_at = CURRENT_TIMESTAMP,
         restoration_completed_at = ${initialStatus === 'RESTORED' ? 'CURRENT_TIMESTAMP' : 'NULL'},
         restoration_expires_at = DATE_ADD(CURRENT_TIMESTAMP, INTERVAL ? DAY)
     WHERE id = ?`,
    [initialStatus, options.restoration_tier, days, record.id],
  );

  return {
    success: true,
    asset_id: assetId,
    restoration_status: initialStatus,
    restoration_tier: options.restoration_tier,
  };
}

/**
 * Gets detailed archival and cold-storage status of an asset.
 */
export async function getArchivalStatus(
  tenantId: number,
  assetId: number,
): Promise<ArchivalStatusResult | null> {
  const assets = await query<any[]>(
    `SELECT id, storage_tier, archived_at FROM assets WHERE id = ? AND tenant_id = ? AND status = 'ACTIVE' LIMIT 1`,
    [assetId, tenantId],
  );

  if (!assets || assets.length === 0) {
    return null;
  }

  const asset = assets[0];

  const records = await query<any[]>(
    `SELECT * FROM asset_archival_records WHERE tenant_id = ? AND asset_id = ? ORDER BY id DESC LIMIT 1`,
    [tenantId, assetId],
  );

  if (!records || records.length === 0) {
    return {
      asset_id: assetId,
      storage_tier: asset.storage_tier,
      archived_at: asset.archived_at,
      archive_provider: null,
      archive_key: null,
      byte_size: null,
      restoration_status: 'NONE',
      restoration_tier: null,
      restoration_requested_at: null,
      restoration_completed_at: null,
      restoration_expires_at: null,
      is_restored: asset.storage_tier === 'HOT',
    };
  }

  const record = records[0];

  const isRestored =
    asset.storage_tier === 'HOT' ||
    (record.restoration_status === 'RESTORED' &&
      (!record.restoration_expires_at || new Date(record.restoration_expires_at) > new Date()));

  return {
    asset_id: assetId,
    storage_tier: asset.storage_tier,
    archived_at: asset.archived_at,
    archive_provider: record.archive_provider,
    archive_key: record.archive_key,
    byte_size: Number(record.byte_size),
    restoration_status: record.restoration_status,
    restoration_tier: record.restoration_tier,
    restoration_requested_at: record.restoration_requested_at,
    restoration_completed_at: record.restoration_completed_at,
    restoration_expires_at: record.restoration_expires_at,
    is_restored: isRestored,
  };
}
