-- DDL 025: DAM AI Background Replacement & Generative Inpainting Schema
-- Feature Contract: 026_FC_DAM_AI_Background_Replacement_Inpainting
-- Description: Multi-tenant background replacement, studio presets, gradient backdrops and inpaint patch derivatives for DAM assets

CREATE TABLE IF NOT EXISTS dam_asset_background_replacements (
    id INT AUTO_INCREMENT PRIMARY KEY,
    tenant_id INT NOT NULL,
    asset_id INT NOT NULL,
    version_id INT NOT NULL,
    mode ENUM('SOLID_COLOR', 'TRANSPARENT', 'STUDIO_PRESET', 'GRADIENT', 'MASK_INPAINT') NOT NULL DEFAULT 'SOLID_COLOR',
    preset ENUM('STUDIO_WHITE', 'STUDIO_DARK', 'TRANSPARENT_ALPHA', 'WARM_GRADIENT', 'NEON_CYBERPUNK', 'OFFICE_BLUR', 'OUTDOOR_NATURE', 'CUSTOM') NOT NULL DEFAULT 'STUDIO_WHITE',
    background_color_hex VARCHAR(7) NULL,
    threshold DECIMAL(4,2) NOT NULL DEFAULT 0.15,
    inpaint_box JSON NULL,
    output_derivative_path VARCHAR(512) NOT NULL,
    replacement_metadata JSON NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_dam_bg_asset FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE CASCADE,
    UNIQUE KEY uq_asset_version_mode_preset (tenant_id, asset_id, version_id, mode, preset),
    INDEX idx_dam_bg_tenant_asset (tenant_id, asset_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
