import crypto from 'crypto';
import { pool } from '../db.js';
import { AnalyticsEventType, AnalyticsActorType } from '../schemas/analytics.schema.js';

export interface EventRecordInput {
  tenant_id: number;
  asset_id: number;
  event_type: AnalyticsEventType;
  actor_id?: number | null;
  actor_type?: AnalyticsActorType;
  bytes_served?: number;
  ip?: string;
  user_agent?: string;
  referer?: string;
}

export interface MetricSummary {
  total_views: number;
  total_downloads: number;
  total_streams: number;
  total_shares: number;
  total_search_hits: number;
  total_bytes_served?: number;
  byte_size: number;
}

/**
 * Anonymizes an IP address using Salted HMAC-SHA256 (GDPR Compliance).
 * Prevents rainbow table reversal while allowing deterministic uniqueness tracking.
 */
export const hashIpAddress = (ip?: string): string | null => {
  if (!ip || typeof ip !== 'string' || ip.trim().length === 0) {
    return null;
  }
  const salt =
    process.env.ANALYTICS_SALT ||
    process.env.JWT_SECRET ||
    'dreamtek-analytics-salt-v1';
  return crypto.createHmac('sha256', salt).update(ip.trim()).digest('hex');
};

/**
 * Hashes a User-Agent string with SHA-256 for privacy.
 */
export const hashUserAgent = (ua?: string): string | null => {
  if (!ua || typeof ua !== 'string' || ua.trim().length === 0) {
    return null;
  }
  return crypto.createHash('sha256').update(ua.trim()).digest('hex');
};

/**
 * Sanitizes and extracts strictly the hostname from a referer string.
 * Prevents data leaks from full URLs or open-redirect vulnerabilities.
 */
export const sanitizeReferer = (referer?: string): string | null => {
  if (!referer || typeof referer !== 'string' || referer.trim().length === 0) {
    return null;
  }
  try {
    const raw = referer.trim();
    if (raw.startsWith('http://') || raw.startsWith('https://')) {
      const url = new URL(raw);
      return url.hostname.slice(0, 255);
    }
    // If not a full protocol URL, extract clean host part
    const cleanHost = raw.split('/')[0].split('?')[0].trim();
    return cleanHost.length > 0 ? cleanHost.slice(0, 255) : null;
  } catch {
    return null;
  }
};

/**
 * Deterministic Frozen ROI Scoring Formula (Condition C-018.2).
 *
 * Engagement_Index = views + 2.5*downloads + 3.0*shares + 1.5*streams + 0.5*search_hits
 * Size_MB = byte_size / (1024 * 1024)
 * ROI_Score = min(100.00, round((ln(1 + Engagement_Index) / ln(2 + (Size_MB / 10))) * 20, 2))
 */
export const calculateRoiScore = (metrics: MetricSummary): number => {
  const views = Number(metrics.total_views ?? 0);
  const downloads = Number(metrics.total_downloads ?? 0);
  const streams = Number(metrics.total_streams ?? 0);
  const shares = Number(metrics.total_shares ?? 0);
  const searchHits = Number(metrics.total_search_hits ?? 0);
  const byteSize = Number(metrics.byte_size ?? 0);

  const engagementIndex =
    views +
    downloads * 2.5 +
    shares * 3.0 +
    streams * 1.5 +
    searchHits * 0.5;

  if (engagementIndex <= 0) {
    return 0.0;
  }

  const sizeMb = Math.max(0, byteSize) / (1024 * 1024);
  const denominator = Math.log(2 + sizeMb / 10);
  const numerator = Math.log(1 + engagementIndex);

  const rawScore = (numerator / denominator) * 20;
  const boundedScore = Math.min(100.0, Math.max(0.0, rawScore));

  return Math.round(boundedScore * 100) / 100;
};

/**
 * Records an analytics event asynchronously with fail-open safety.
 * Never throws an error up to the caller to prevent breaking hot streaming/download paths.
 */
export const recordAnalyticsEvent = async (input: EventRecordInput): Promise<boolean> => {
  try {
    const ipHash = hashIpAddress(input.ip);
    const uaHash = hashUserAgent(input.user_agent);
    const refererDomain = sanitizeReferer(input.referer);
    const bytesServed = Number(input.bytes_served ?? 0);
    const actorId = input.actor_id ?? null;
    const actorType = input.actor_type ?? 'USER';

    // 1. Insert Event in dam_analytics_events
    await pool.query(
      `INSERT INTO dam_analytics_events
       (tenant_id, asset_id, event_type, actor_id, actor_type, bytes_served, ip_hash, user_agent_hash, referer_domain)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        input.tenant_id,
        input.asset_id,
        input.event_type,
        actorId,
        actorType,
        bytesServed,
        ipHash,
        uaHash,
        refererDomain,
      ],
    );

    // 2. Incremental summary aggregation
    const viewInc = input.event_type === 'VIEW' ? 1 : 0;
    const downloadInc = input.event_type === 'DOWNLOAD' ? 1 : 0;
    const streamInc = input.event_type === 'STREAM' ? 1 : 0;
    const shareInc = input.event_type === 'SHARE_ACCESS' ? 1 : 0;
    const searchHitInc = input.event_type === 'SEARCH_HIT' ? 1 : 0;

    await pool.query(
      `INSERT INTO dam_asset_metrics_summary
       (tenant_id, asset_id, total_views, total_downloads, total_streams, total_shares, total_search_hits, total_bytes_served, last_accessed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())
       ON DUPLICATE KEY UPDATE
         total_views = total_views + VALUES(total_views),
         total_downloads = total_downloads + VALUES(total_downloads),
         total_streams = total_streams + VALUES(total_streams),
         total_shares = total_shares + VALUES(total_shares),
         total_search_hits = total_search_hits + VALUES(total_search_hits),
         total_bytes_served = total_bytes_served + VALUES(total_bytes_served),
         last_accessed_at = NOW()`,
      [
        input.tenant_id,
        input.asset_id,
        viewInc,
        downloadInc,
        streamInc,
        shareInc,
        searchHitInc,
        bytesServed,
      ],
    );

    return true;
  } catch (err) {
    // Fail-open logging for telemetry
    console.error('⚠️ [AnalyticsEngine] Non-blocking event record failure:', err);
    return false;
  }
};

/**
 * Retrieves aggregate overview metrics for a tenant.
 */
export const getOverviewMetrics = async (tenantId: number, days = 30) => {
  const safeDays = Math.max(1, Math.min(365, days));

  // 1. Overall counts in window
  const [rows]: any = await pool.query(
    `SELECT
       COUNT(*) AS total_events,
       SUM(CASE WHEN event_type = 'VIEW' THEN 1 ELSE 0 END) AS total_views,
       SUM(CASE WHEN event_type = 'DOWNLOAD' THEN 1 ELSE 0 END) AS total_downloads,
       SUM(CASE WHEN event_type = 'STREAM' THEN 1 ELSE 0 END) AS total_streams,
       SUM(CASE WHEN event_type = 'SHARE_ACCESS' THEN 1 ELSE 0 END) AS total_shares,
       SUM(CASE WHEN event_type = 'SEARCH_HIT' THEN 1 ELSE 0 END) AS total_search_hits,
       SUM(bytes_served) AS total_bytes_served,
       COUNT(DISTINCT asset_id) AS active_assets_count
     FROM dam_analytics_events
     WHERE tenant_id = ? AND created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)`,
    [tenantId, safeDays],
  );

  const summary = rows[0] ?? {};

  // 2. Daily timeline in window
  const [timelineRows]: any = await pool.query(
    `SELECT
       DATE_FORMAT(created_at, '%Y-%m-%d') AS event_date,
       SUM(CASE WHEN event_type = 'VIEW' THEN 1 ELSE 0 END) AS views,
       SUM(CASE WHEN event_type = 'DOWNLOAD' THEN 1 ELSE 0 END) AS downloads,
       SUM(CASE WHEN event_type = 'STREAM' THEN 1 ELSE 0 END) AS streams,
       SUM(CASE WHEN event_type = 'SHARE_ACCESS' THEN 1 ELSE 0 END) AS shares,
       SUM(bytes_served) AS bytes_served
     FROM dam_analytics_events
     WHERE tenant_id = ? AND created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
     GROUP BY DATE_FORMAT(created_at, '%Y-%m-%d')
     ORDER BY event_date ASC`,
    [tenantId, safeDays],
  );

  return {
    window_days: safeDays,
    total_events: Number(summary.total_events ?? 0),
    total_views: Number(summary.total_views ?? 0),
    total_downloads: Number(summary.total_downloads ?? 0),
    total_streams: Number(summary.total_streams ?? 0),
    total_shares: Number(summary.total_shares ?? 0),
    total_search_hits: Number(summary.total_search_hits ?? 0),
    total_bytes_served: Number(summary.total_bytes_served ?? 0),
    active_assets_count: Number(summary.active_assets_count ?? 0),
    timeline: (timelineRows ?? []).map((r: any) => ({
      date: r.event_date,
      views: Number(r.views ?? 0),
      downloads: Number(r.downloads ?? 0),
      streams: Number(r.streams ?? 0),
      shares: Number(r.shares ?? 0),
      bytes_served: Number(r.bytes_served ?? 0),
    })),
  };
};

/**
 * Retrieves detailed analytics for a single asset.
 */
export const getAssetMetrics = async (tenantId: number, assetId: number, days = 30) => {
  const safeDays = Math.max(1, Math.min(365, days));

  // 1. Get asset details and all-time summary
  const [assetRows]: any = await pool.query(
    `SELECT
       a.id, a.tenant_id, a.title, a.mime_type, a.byte_size, a.storage_path, a.created_at,
       COALESCE(s.total_views, 0) AS total_views,
       COALESCE(s.total_downloads, 0) AS total_downloads,
       COALESCE(s.total_streams, 0) AS total_streams,
       COALESCE(s.total_shares, 0) AS total_shares,
       COALESCE(s.total_search_hits, 0) AS total_search_hits,
       COALESCE(s.total_bytes_served, 0) AS total_bytes_served,
       s.last_accessed_at
     FROM assets a
     LEFT JOIN dam_asset_metrics_summary s ON a.id = s.asset_id AND a.tenant_id = s.tenant_id
     WHERE a.id = ? AND a.tenant_id = ? AND a.deleted_at IS NULL`,
    [assetId, tenantId],
  );

  if (!assetRows || assetRows.length === 0) {
    return null;
  }

  const asset = assetRows[0];
  const roiScore = calculateRoiScore({
    total_views: asset.total_views,
    total_downloads: asset.total_downloads,
    total_streams: asset.total_streams,
    total_shares: asset.total_shares,
    total_search_hits: asset.total_search_hits,
    byte_size: asset.byte_size,
  });

  // 2. Get timeline for this asset in window
  const [timelineRows]: any = await pool.query(
    `SELECT
       DATE_FORMAT(created_at, '%Y-%m-%d') AS event_date,
       SUM(CASE WHEN event_type = 'VIEW' THEN 1 ELSE 0 END) AS views,
       SUM(CASE WHEN event_type = 'DOWNLOAD' THEN 1 ELSE 0 END) AS downloads,
       SUM(CASE WHEN event_type = 'STREAM' THEN 1 ELSE 0 END) AS streams,
       SUM(CASE WHEN event_type = 'SHARE_ACCESS' THEN 1 ELSE 0 END) AS shares,
       SUM(bytes_served) AS bytes_served
     FROM dam_analytics_events
     WHERE tenant_id = ? AND asset_id = ? AND created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
     GROUP BY DATE_FORMAT(created_at, '%Y-%m-%d')
     ORDER BY event_date ASC`,
    [tenantId, assetId, safeDays],
  );

  return {
    asset_id: asset.id,
    title: asset.title,
    mime_type: asset.mime_type,
    byte_size: Number(asset.byte_size ?? 0),
    created_at: asset.created_at,
    last_accessed_at: asset.last_accessed_at,
    roi_score: roiScore,
    all_time: {
      views: Number(asset.total_views ?? 0),
      downloads: Number(asset.total_downloads ?? 0),
      streams: Number(asset.total_streams ?? 0),
      shares: Number(asset.total_shares ?? 0),
      search_hits: Number(asset.total_search_hits ?? 0),
      bytes_served: Number(asset.total_bytes_served ?? 0),
    },
    window_days: safeDays,
    timeline: (timelineRows ?? []).map((r: any) => ({
      date: r.event_date,
      views: Number(r.views ?? 0),
      downloads: Number(r.downloads ?? 0),
      streams: Number(r.streams ?? 0),
      shares: Number(r.shares ?? 0),
      bytes_served: Number(r.bytes_served ?? 0),
    })),
  };
};

/**
 * Retrieves top performing assets for a tenant by metric.
 */
export const getTopAssets = async (
  tenantId: number,
  metric = 'views',
  days = 30,
  limit = 10,
) => {
  const safeDays = Math.max(1, Math.min(365, days));
  const safeLimit = Math.max(1, Math.min(50, limit));

  let orderByClause = 'window_views DESC';
  if (metric === 'downloads') orderByClause = 'window_downloads DESC';
  if (metric === 'streams') orderByClause = 'window_streams DESC';
  if (metric === 'shares') orderByClause = 'window_shares DESC';
  if (metric === 'bytes') orderByClause = 'window_bytes DESC';

  const [rows]: any = await pool.query(
    `SELECT
       a.id AS asset_id,
       a.title,
       a.mime_type,
       a.byte_size,
       a.created_at,
       COALESCE(SUM(CASE WHEN e.event_type = 'VIEW' THEN 1 ELSE 0 END), 0) AS window_views,
       COALESCE(SUM(CASE WHEN e.event_type = 'DOWNLOAD' THEN 1 ELSE 0 END), 0) AS window_downloads,
       COALESCE(SUM(CASE WHEN e.event_type = 'STREAM' THEN 1 ELSE 0 END), 0) AS window_streams,
       COALESCE(SUM(CASE WHEN e.event_type = 'SHARE_ACCESS' THEN 1 ELSE 0 END), 0) AS window_shares,
       COALESCE(SUM(CASE WHEN e.event_type = 'SEARCH_HIT' THEN 1 ELSE 0 END), 0) AS window_search_hits,
       COALESCE(SUM(e.bytes_served), 0) AS window_bytes,
       COALESCE(s.total_views, 0) AS total_views,
       COALESCE(s.total_downloads, 0) AS total_downloads,
       COALESCE(s.total_streams, 0) AS total_streams,
       COALESCE(s.total_shares, 0) AS total_shares,
       COALESCE(s.total_search_hits, 0) AS total_search_hits,
       s.last_accessed_at
     FROM assets a
     LEFT JOIN dam_analytics_events e ON a.id = e.asset_id AND a.tenant_id = e.tenant_id AND e.created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
     LEFT JOIN dam_asset_metrics_summary s ON a.id = s.asset_id AND a.tenant_id = s.tenant_id
     WHERE a.tenant_id = ? AND a.deleted_at IS NULL
     GROUP BY a.id, a.title, a.mime_type, a.byte_size, a.created_at, s.total_views, s.total_downloads, s.total_streams, s.total_shares, s.total_search_hits, s.last_accessed_at
     ORDER BY ${orderByClause}, a.id DESC
     LIMIT ?`,
    [safeDays, tenantId, safeLimit],
  );

  const results = (rows ?? []).map((row: any) => {
    const roiScore = calculateRoiScore({
      total_views: row.total_views,
      total_downloads: row.total_downloads,
      total_streams: row.total_streams,
      total_shares: row.total_shares,
      total_search_hits: row.total_search_hits,
      byte_size: row.byte_size,
    });

    return {
      asset_id: row.asset_id,
      title: row.title,
      mime_type: row.mime_type,
      byte_size: Number(row.byte_size ?? 0),
      window_metrics: {
        views: Number(row.window_views ?? 0),
        downloads: Number(row.window_downloads ?? 0),
        streams: Number(row.window_streams ?? 0),
        shares: Number(row.window_shares ?? 0),
        bytes_served: Number(row.window_bytes ?? 0),
      },
      all_time: {
        views: Number(row.total_views ?? 0),
        downloads: Number(row.total_downloads ?? 0),
        streams: Number(row.total_streams ?? 0),
        shares: Number(row.total_shares ?? 0),
        last_accessed_at: row.last_accessed_at,
      },
      roi_score: roiScore,
      thumbnail_url: `/api/v1/assets/${row.asset_id}/thumbnail`,
    };
  });

  if (metric === 'roi') {
    results.sort((a: any, b: any) => b.roi_score - a.roi_score);
  }

  return {
    metric,
    window_days: safeDays,
    count: results.length,
    results,
  };
};

/**
 * Generates an executive ROI Report and identifies dormant candidate assets.
 */
export const getRoiReport = async (
  tenantId: number,
  days = 30,
  dormantThresholdDays = 90,
  limit = 50,
) => {
  const safeDays = Math.max(1, Math.min(365, days));
  const safeDormantDays = Math.max(7, Math.min(365, dormantThresholdDays));
  const safeLimit = Math.max(1, Math.min(100, limit));

  // 1. Get all tenant assets with summary metrics
  const [rows]: any = await pool.query(
    `SELECT
       a.id AS asset_id,
       a.title,
       a.mime_type,
       a.byte_size,
       a.created_at,
       COALESCE(s.total_views, 0) AS total_views,
       COALESCE(s.total_downloads, 0) AS total_downloads,
       COALESCE(s.total_streams, 0) AS total_streams,
       COALESCE(s.total_shares, 0) AS total_shares,
       COALESCE(s.total_search_hits, 0) AS total_search_hits,
       COALESCE(s.total_bytes_served, 0) AS total_bytes_served,
       s.last_accessed_at
     FROM assets a
     LEFT JOIN dam_asset_metrics_summary s ON a.id = s.asset_id AND a.tenant_id = s.tenant_id
     WHERE a.tenant_id = ? AND a.deleted_at IS NULL
     ORDER BY a.byte_size DESC`,
    [tenantId],
  );

  let totalTenantBytes = 0;
  let totalTenantRoiScore = 0;
  const scoredAssets: any[] = [];
  const dormantCandidates: any[] = [];
  let dormantRecoverableBytes = 0;

  const now = Date.now();
  const dormantCutoffMs = safeDormantDays * 24 * 60 * 60 * 1000;

  for (const row of rows ?? []) {
    const byteSize = Number(row.byte_size ?? 0);
    totalTenantBytes += byteSize;
    const views = Number(row.total_views ?? 0);
    const downloads = Number(row.total_downloads ?? 0);
    const streams = Number(row.total_streams ?? 0);
    const shares = Number(row.total_shares ?? 0);
    const searchHits = Number(row.total_search_hits ?? 0);
    const bytesServed = Number(row.total_bytes_served ?? 0);

    const roiScore = calculateRoiScore({
      total_views: views,
      total_downloads: downloads,
      total_streams: streams,
      total_shares: shares,
      total_search_hits: searchHits,
      byte_size: byteSize,
    });

    totalTenantRoiScore += roiScore;

    const assetItem = {
      asset_id: row.asset_id,
      title: row.title,
      mime_type: row.mime_type,
      byte_size: byteSize,
      roi_score: roiScore,
      total_views: views,
      total_downloads: downloads,
      total_streams: streams,
      total_shares: shares,
      total_bytes_served: bytesServed,
      created_at: row.created_at,
      last_accessed_at: row.last_accessed_at,
    };

    scoredAssets.push(assetItem);

    // Dormant asset check: created > D days ago and (last_accessed_at is null or last_accessed_at < D days ago)
    const createdAtMs = new Date(row.created_at).getTime();
    const isOldEnough = now - createdAtMs > dormantCutoffMs;
    const lastAccessedMs = row.last_accessed_at ? new Date(row.last_accessed_at).getTime() : 0;
    const isInactive = !row.last_accessed_at || now - lastAccessedMs > dormantCutoffMs;

    if (isOldEnough && isInactive) {
      const referenceMs = lastAccessedMs > 0 ? lastAccessedMs : createdAtMs;
      dormantCandidates.push({
        asset_id: row.asset_id,
        title: row.title,
        byte_size: byteSize,
        created_at: row.created_at,
        last_accessed_at: row.last_accessed_at,
        days_inactive: Math.floor((now - referenceMs) / (1000 * 60 * 60 * 24)),
      });
      dormantRecoverableBytes += byteSize;
    }
  }

  const assetCount = scoredAssets.length;
  const averageRoiScore =
    assetCount > 0 ? Math.round((totalTenantRoiScore / assetCount) * 100) / 100 : 0.0;

  // Sort high performing and low performing
  scoredAssets.sort((a, b) => b.roi_score - a.roi_score);
  const highPerforming = scoredAssets.slice(0, safeLimit);

  // Low performing with significant storage footprint
  const lowPerforming = [...scoredAssets]
    .sort((a, b) => a.roi_score - b.roi_score || b.byte_size - a.byte_size)
    .slice(0, safeLimit);

  return {
    window_days: safeDays,
    dormant_threshold_days: safeDormantDays,
    summary: {
      total_assets: assetCount,
      total_storage_bytes: totalTenantBytes,
      total_storage_mb: Math.round((totalTenantBytes / (1024 * 1024)) * 100) / 100,
      average_roi_score: averageRoiScore,
      dormant_candidates_count: dormantCandidates.length,
      dormant_recoverable_bytes: dormantRecoverableBytes,
      dormant_recoverable_mb:
        Math.round((dormantRecoverableBytes / (1024 * 1024)) * 100) / 100,
    },
    high_performing_assets: highPerforming,
    low_performing_assets: lowPerforming,
    dormant_candidates: dormantCandidates.slice(0, safeLimit),
  };
};
