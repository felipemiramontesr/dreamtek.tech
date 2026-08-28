-- Migration 028: DAM Asset Semantic Compressions & Web Optimization Schema
-- Multi-tenant adaptive image compression and format optimization tracking (FC 029, OWASP A01/A04/A09)

CREATE TABLE IF NOT EXISTS dam_asset_compressions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    tenant_id INT NOT NULL,
    asset_id INT NOT NULL,
    version_id INT NOT NULL,
    target_format ENUM('WEBP', 'AVIF', 'JPEG', 'PNG') NOT NULL,
    quality_preset ENUM('HIGH_FIDELITY', 'BALANCED', 'MAX_COMPRESSION', 'LOSSLESS', 'CUSTOM') NOT NULL DEFAULT 'BALANCED',
    effort INT NOT NULL DEFAULT 4,
    quality INT NOT NULL DEFAULT 80,
    strip_metadata BOOLEAN NOT NULL DEFAULT TRUE,
    original_bytes BIGINT NOT NULL,
    compressed_bytes BIGINT NOT NULL,
    savings_percentage DECIMAL(5,2) NOT NULL DEFAULT 0.00,
    output_derivative_path VARCHAR(1024) NOT NULL,
    compression_metadata JSON NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_dam_compressions_tenant_asset (tenant_id, asset_id),
    INDEX idx_dam_compressions_tenant_format (tenant_id, target_format),
    UNIQUE KEY uq_asset_version_format_preset (tenant_id, asset_id, version_id, target_format, quality_preset),
    CONSTRAINT fk_dam_compressions_asset FOREIGN KEY (asset_id) REFERENCES assets (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
