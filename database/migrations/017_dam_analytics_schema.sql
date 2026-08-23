-- ==============================================================================
-- Migration 017: DAM Analytics, Engagement & ROI Reporting
-- Feature Contract: FC 018
-- Standards: OWASP Top 10:2021 (A01, A04, A09), GDPR Salted Hashing, ISO 25010
-- ==============================================================================

CREATE TABLE IF NOT EXISTS dam_analytics_events (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  tenant_id INT NOT NULL,
  asset_id INT NOT NULL,
  event_type ENUM(
    'VIEW',
    'DOWNLOAD',
    'STREAM',
    'SHARE_ACCESS',
    'TRANSCODE',
    'SEARCH_HIT'
  ) NOT NULL,
  actor_id INT NULL,
  actor_type ENUM('USER', 'GUEST', 'SYSTEM') NOT NULL DEFAULT 'USER',
  bytes_served BIGINT NOT NULL DEFAULT 0,
  ip_hash VARCHAR(64) NULL,
  user_agent_hash VARCHAR(64) NULL,
  referer_domain VARCHAR(255) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE CASCADE,
  INDEX idx_analytics_tenant_event (tenant_id, event_type, created_at),
  INDEX idx_analytics_tenant_asset (tenant_id, asset_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS dam_asset_metrics_summary (
  tenant_id INT NOT NULL,
  asset_id INT NOT NULL,
  total_views INT NOT NULL DEFAULT 0,
  total_downloads INT NOT NULL DEFAULT 0,
  total_streams INT NOT NULL DEFAULT 0,
  total_shares INT NOT NULL DEFAULT 0,
  total_search_hits INT NOT NULL DEFAULT 0,
  total_bytes_served BIGINT NOT NULL DEFAULT 0,
  last_accessed_at TIMESTAMP NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (tenant_id, asset_id),
  FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE CASCADE,
  INDEX idx_metrics_tenant (tenant_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
