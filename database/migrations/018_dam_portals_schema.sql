-- ==============================================================================
-- Migration 018: DAM Brand Portals, Guidelines & External Distribution
-- Feature Contract: FC 019 (rev-2)
-- Standards: OWASP Top 10:2021 (A01, A02, A03, A04, A07), ISO 25010
-- ==============================================================================

CREATE TABLE IF NOT EXISTS dam_brand_portals (
    id INT AUTO_INCREMENT PRIMARY KEY,
    tenant_id INT NOT NULL,
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) NOT NULL,
    description TEXT NULL,
    brand_header_title VARCHAR(255) NULL,
    brand_primary_color VARCHAR(7) NOT NULL DEFAULT '#00bfff',
    brand_logo_asset_id INT NULL,
    brand_guidelines_markdown LONGTEXT NULL,
    is_public BOOLEAN NOT NULL DEFAULT FALSE,
    password_hash VARCHAR(255) NULL,
    allowed_domains JSON NULL,
    status ENUM('DRAFT', 'PUBLISHED', 'ARCHIVED') NOT NULL DEFAULT 'DRAFT',
    expires_at DATETIME NULL,
    created_by INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_dam_portals_logo FOREIGN KEY (brand_logo_asset_id) REFERENCES assets(id) ON DELETE SET NULL,
    CONSTRAINT uk_dam_portals_tenant_slug UNIQUE KEY (tenant_id, slug),
    INDEX idx_dam_portals_tenant_status (tenant_id, status),
    INDEX idx_dam_portals_slug (slug)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS dam_portal_collections (
    id INT AUTO_INCREMENT PRIMARY KEY,
    portal_id INT NOT NULL,
    collection_id INT NOT NULL,
    display_order INT NOT NULL DEFAULT 0,
    allow_download BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_portal_col_portal FOREIGN KEY (portal_id) REFERENCES dam_brand_portals(id) ON DELETE CASCADE,
    CONSTRAINT fk_portal_col_collection FOREIGN KEY (collection_id) REFERENCES collections(id) ON DELETE CASCADE,
    CONSTRAINT uk_portal_collection UNIQUE KEY (portal_id, collection_id),
    INDEX idx_portal_col_order (portal_id, display_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS dam_portal_access_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    portal_id INT NOT NULL,
    ip_hash VARCHAR(64) NULL,
    user_agent_hash VARCHAR(64) NULL,
    referer_domain VARCHAR(255) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_portal_logs_portal FOREIGN KEY (portal_id) REFERENCES dam_brand_portals(id) ON DELETE CASCADE,
    INDEX idx_portal_logs_portal_created (portal_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
