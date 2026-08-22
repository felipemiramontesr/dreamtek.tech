-- Migration: 012_dam_deduplication_schema.sql
-- Description: DDL schema for DAM asset deduplication tracking, audit records, and hash indexing (FC 013).

-- 1. Index on assets status and tenant_id to optimize deduplication scanning
CREATE INDEX IF NOT EXISTS idx_assets_tenant_status ON assets (tenant_id, status);

-- 2. Index on asset_versions for hash lookups
CREATE INDEX IF NOT EXISTS idx_versions_asset_hash ON asset_versions (asset_id, sha256_hash);

-- 3. Table: asset_deduplication_logs
-- Tracks historical deduplication operations, reclaimed space, and canonical mappings (OWASP A09).
CREATE TABLE IF NOT EXISTS asset_deduplication_logs (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    tenant_id BIGINT NOT NULL,
    canonical_asset_id BIGINT NOT NULL,
    duplicate_asset_id BIGINT NOT NULL,
    sha256_hash VARCHAR(64) NOT NULL,
    reclaimed_bytes BIGINT NOT NULL DEFAULT 0,
    performed_by BIGINT NOT NULL,
    reason VARCHAR(255) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_dedup_tenant (tenant_id),
    INDEX idx_dedup_canonical (canonical_asset_id),
    INDEX idx_dedup_duplicate (duplicate_asset_id),
    INDEX idx_dedup_hash (sha256_hash),
    CONSTRAINT fk_dedup_canonical FOREIGN KEY (canonical_asset_id) REFERENCES assets(id) ON DELETE CASCADE,
    CONSTRAINT fk_dedup_duplicate FOREIGN KEY (duplicate_asset_id) REFERENCES assets(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
