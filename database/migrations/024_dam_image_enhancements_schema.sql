-- DDL 024: DAM AI Automated Image Colorization & Tone Enhancement Schema
-- Feature Contract: 025_FC_DAM_AI_Image_Colorization_Tone_Enhancement
-- Description: Multi-tenant image enhancements, tone curves, colorization and filter derivatives for DAM assets

CREATE TABLE IF NOT EXISTS dam_asset_enhancements (
    id INT AUTO_INCREMENT PRIMARY KEY,
    tenant_id INT NOT NULL,
    asset_id INT NOT NULL,
    version_id INT NOT NULL,
    preset ENUM('NATURAL_RESTORE', 'VIBRANT', 'WARM', 'COOL', 'VINTAGE_COLORIZED', 'CINEMATIC', 'HIGH_CONTRAST_BW', 'CUSTOM') NOT NULL DEFAULT 'NATURAL_RESTORE',
    brightness DECIMAL(4,2) NOT NULL DEFAULT 1.00,
    contrast DECIMAL(4,2) NOT NULL DEFAULT 1.00,
    saturation DECIMAL(4,2) NOT NULL DEFAULT 1.00,
    sharpness DECIMAL(4,2) NOT NULL DEFAULT 1.00,
    gamma DECIMAL(4,2) NOT NULL DEFAULT 1.00,
    tint_hex VARCHAR(7) NULL,
    output_derivative_path VARCHAR(512) NOT NULL,
    enhancement_metadata JSON NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_dam_enhancements_asset FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE CASCADE,
    UNIQUE KEY uq_asset_version_preset (tenant_id, asset_id, version_id, preset),
    INDEX idx_dam_enhancements_tenant_asset (tenant_id, asset_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
