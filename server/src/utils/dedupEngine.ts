import { query } from '../db';
import { DedupQueryInput } from '../schemas/assetDedup.schema';

export interface DuplicateAssetItem {
  id: number;
  workspace_id: number;
  collection_id: number;
  title: string;
  mime_type: string;
  byte_size: number;
  created_at: string | Date;
  status: string;
}

export interface DuplicateCluster {
  sha256_hash: string;
  byte_size: number;
  mime_type: string;
  copies_count: number;
  wasted_bytes: number;
  assets: DuplicateAssetItem[];
}

export interface DuplicateScanSummary {
  total_duplicate_clusters: number;
  total_redundant_copies: number;
  total_wasted_bytes: number;
}

export interface DuplicateScanResult {
  summary: DuplicateScanSummary;
  clusters: DuplicateCluster[];
  pagination: {
    page: number;
    limit: number;
    total_clusters: number;
    total_pages: number;
  };
}

/**
 * Scans active assets for a tenant to find clusters sharing identical SHA-256 hashes.
 */
export async function findDuplicateClusters(
  tenantId: number,
  options: DedupQueryInput,
): Promise<DuplicateScanResult> {
  const { page = 1, limit = 20, workspace_id, collection_id, mime_category } = options;
  const offset = (page - 1) * limit;

  // 1. Build filter query for active assets
  let whereClauses = [`a.tenant_id = ?`, `a.status = 'ACTIVE'`];
  let queryParams: any[] = [tenantId];

  if (workspace_id) {
    whereClauses.push(`a.workspace_id = ?`);
    queryParams.push(workspace_id);
  }

  if (collection_id) {
    whereClauses.push(`a.collection_id = ?`);
    queryParams.push(collection_id);
  }

  if (mime_category) {
    whereClauses.push(`a.mime_type LIKE ?`);
    queryParams.push(`${mime_category}/%`);
  }

  const whereSql = whereClauses.join(' AND ');

  // 2. Find all SHA-256 hashes that have more than 1 active asset
  const countSql = `
    SELECT av.sha256_hash, COUNT(DISTINCT a.id) as asset_count, MAX(av.byte_size) as byte_size
    FROM assets a
    JOIN asset_versions av ON av.asset_id = a.id
    WHERE ${whereSql}
    GROUP BY av.sha256_hash
    HAVING asset_count > 1
  `;

  const duplicateHashRows = await query<any[]>(countSql, queryParams);

  const totalClusters = duplicateHashRows.length;
  let totalRedundantCopies = 0;
  let totalWastedBytes = 0;

  for (const row of duplicateHashRows) {
    const copies = Number(row.asset_count);
    const byteSize = Number(row.byte_size);
    const redundant = copies - 1;
    totalRedundantCopies += redundant;
    totalWastedBytes += redundant * byteSize;
  }

  const totalPages = Math.ceil(totalClusters / limit) || 1;

  if (totalClusters === 0) {
    return {
      summary: {
        total_duplicate_clusters: 0,
        total_redundant_copies: 0,
        total_wasted_bytes: 0,
      },
      clusters: [],
      pagination: {
        page,
        limit,
        total_clusters: 0,
        total_pages: 1,
      },
    };
  }

  // 3. Paginate the hash clusters
  const paginatedHashes = duplicateHashRows.slice(offset, offset + limit);
  const hashesToFetch = paginatedHashes.map((r) => r.sha256_hash);

  if (hashesToFetch.length === 0) {
    return {
      summary: {
        total_duplicate_clusters: totalClusters,
        total_redundant_copies: totalRedundantCopies,
        total_wasted_bytes: totalWastedBytes,
      },
      clusters: [],
      pagination: {
        page,
        limit,
        total_clusters: totalClusters,
        total_pages: totalPages,
      },
    };
  }

  // 4. Fetch all active assets for these specific hashes
  const placeholders = hashesToFetch.map(() => '?').join(',');
  const assetsSql = `
    SELECT a.id, a.workspace_id, a.collection_id, a.title, a.mime_type, a.status, a.created_at,
           av.sha256_hash, av.byte_size
    FROM assets a
    JOIN asset_versions av ON av.asset_id = a.id
    WHERE ${whereSql} AND av.sha256_hash IN (${placeholders})
    ORDER BY av.sha256_hash, a.id ASC
  `;

  const assetRows = await query<any[]>(assetsSql, [...queryParams, ...hashesToFetch]);

  // 5. Group assets by hash into clusters
  const clustersMap = new Map<string, DuplicateCluster>();

  for (const h of hashesToFetch) {
    clustersMap.set(h, {
      sha256_hash: h,
      byte_size: 0,
      mime_type: '',
      copies_count: 0,
      wasted_bytes: 0,
      assets: [],
    });
  }

  for (const row of assetRows) {
    const cluster = clustersMap.get(row.sha256_hash)!;
    cluster.byte_size = Number(row.byte_size);
    cluster.mime_type = row.mime_type;
    cluster.assets.push({
      id: row.id,
      workspace_id: row.workspace_id,
      collection_id: row.collection_id,
      title: row.title,
      mime_type: row.mime_type,
      byte_size: Number(row.byte_size),
      created_at: row.created_at,
      status: row.status,
    });
  }

  const clusters: DuplicateCluster[] = [];
  for (const cluster of clustersMap.values()) {
    cluster.copies_count = cluster.assets.length;
    const redundant = Math.max(0, cluster.copies_count - 1);
    cluster.wasted_bytes = redundant * cluster.byte_size;
    clusters.push(cluster);
  }

  return {
    summary: {
      total_duplicate_clusters: totalClusters,
      total_redundant_copies: totalRedundantCopies,
      total_wasted_bytes: totalWastedBytes,
    },
    clusters,
    pagination: {
      page,
      limit,
      total_clusters: totalClusters,
      total_pages: totalPages,
    },
  };
}

/**
 * Checks if an active duplicate asset already exists in the tenant by SHA-256 hash.
 */
export async function checkExistingDuplicate(
  tenantId: number,
  sha256Hash: string,
): Promise<any | null> {
  const rows = await query<any[]>(
    `SELECT a.id, a.workspace_id, a.collection_id, a.title, a.mime_type, a.status, a.created_at,
            av.id as version_id, av.version_number, av.byte_size, av.sha256_hash
     FROM assets a
     JOIN asset_versions av ON av.asset_id = a.id
     WHERE a.tenant_id = ? AND av.sha256_hash = ? AND a.status = 'ACTIVE'
     ORDER BY a.id ASC
     LIMIT 1`,
    [tenantId, sha256Hash],
  );

  if (!rows || rows.length === 0) {
    return null;
  }

  return rows[0];
}

export interface ConsolidateResult {
  success: boolean;
  canonical_asset_id: number;
  consolidated_count: number;
  reclaimed_bytes: number;
  consolidated_asset_ids: number[];
  error?: string;
}

/**
 * Consolidates duplicate assets into a single canonical asset by soft-deleting duplicates (OWASP A01/A09).
 */
export async function consolidateDuplicates(
  tenantId: number,
  canonicalAssetId: number,
  duplicateAssetIds: number[],
  actorId: number,
  reason?: string,
): Promise<ConsolidateResult> {
  // 1. Verify canonical asset exists, belongs to tenant, and is ACTIVE
  const canonicalRows = await query<any[]>(
    `SELECT a.id, a.status, av.sha256_hash, av.byte_size
     FROM assets a
     JOIN asset_versions av ON av.asset_id = a.id
     WHERE a.id = ? AND a.tenant_id = ? AND a.status = 'ACTIVE'
     LIMIT 1`,
    [canonicalAssetId, tenantId],
  );

  if (!canonicalRows || canonicalRows.length === 0) {
    return {
      success: false,
      canonical_asset_id: canonicalAssetId,
      consolidated_count: 0,
      reclaimed_bytes: 0,
      consolidated_asset_ids: [],
      error: 'El activo canónico especificado no existe o no se encuentra activo.',
    };
  }

  const canonicalSha256 = canonicalRows[0].sha256_hash;
  const canonicalByteSize = Number(canonicalRows[0].byte_size);

  // 2. Verify duplicate assets exist, belong to tenant, and share identical hash
  const placeholders = duplicateAssetIds.map(() => '?').join(',');
  const duplicateRows = await query<any[]>(
    `SELECT a.id, a.status, av.sha256_hash, av.byte_size
     FROM assets a
     JOIN asset_versions av ON av.asset_id = a.id
     WHERE a.id IN (${placeholders}) AND a.tenant_id = ? AND a.status = 'ACTIVE'`,
    [...duplicateAssetIds, tenantId],
  );

  if (!duplicateRows || duplicateRows.length !== duplicateAssetIds.length) {
    return {
      success: false,
      canonical_asset_id: canonicalAssetId,
      consolidated_count: 0,
      reclaimed_bytes: 0,
      consolidated_asset_ids: [],
      error: 'Uno o más activos duplicados no existen, no pertenecen al tenant o no están activos.',
    };
  }

  // 3. Verify all duplicates have the exact same SHA-256 hash as canonical
  for (const dup of duplicateRows) {
    if (dup.sha256_hash !== canonicalSha256) {
      return {
        success: false,
        canonical_asset_id: canonicalAssetId,
        consolidated_count: 0,
        reclaimed_bytes: 0,
        consolidated_asset_ids: [],
        error: `El activo ID ${dup.id} no posee el mismo hash SHA-256 que el activo canónico.`,
      };
    }
  }

  // 4. Soft-delete duplicate assets
  await query(
    `UPDATE assets
     SET status = 'DELETED', updated_at = CURRENT_TIMESTAMP
     WHERE id IN (${placeholders}) AND tenant_id = ?`,
    [...duplicateAssetIds, tenantId],
  );

  // 5. Insert deduplication audit logs
  let totalReclaimed = 0;
  for (const dup of duplicateRows) {
    const bytes = Number(dup.byte_size);
    totalReclaimed += bytes;
    try {
      await query(
        `INSERT INTO asset_deduplication_logs (tenant_id, canonical_asset_id, duplicate_asset_id, sha256_hash, reclaimed_bytes, performed_by, reason)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [tenantId, canonicalAssetId, dup.id, canonicalSha256, bytes, actorId, reason ?? null],
      );
    } catch {
      // ignore table log if optional
    }
  }

  return {
    success: true,
    canonical_asset_id: canonicalAssetId,
    consolidated_count: duplicateAssetIds.length,
    reclaimed_bytes: totalReclaimed,
    consolidated_asset_ids: duplicateAssetIds,
  };
}
