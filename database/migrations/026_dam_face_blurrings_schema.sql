-- DDL 026: Schema for DAM AI Face Blurring & Privacy Anonymization Engine (FC 027)

CREATE TABLE IF NOT EXISTS dam_asset_face_blurrings (
    id INT AUTO_INCREMENT PRIMARY KEY,
    tenant_id INT NOT NULL,
    asset_id INT NOT NULL,
    version_id INT NOT NULL,
    strategy ENUM('GAUSSIAN_BLUR', 'PIXELATE_MOSAIC', 'BLACK_BAR_CENSOR') NOT NULL DEFAULT 'GAUSSIAN_BLUR',
    blur_intensity INT NOT NULL DEFAULT 20,
    bounding_boxes JSON NOT NULL,
    output_derivative_path VARCHAR(512) NOT NULL,
    blurring_metadata JSON NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_dam_face_blurrings_asset FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE CASCADE,
    CONSTRAINT uq_asset_version_strategy UNIQUE KEY (tenant_id, asset_id, version_id, strategy)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_dam_face_blurrings_lookup ON dam_asset_face_blurrings (tenant_id, asset_id, created_at);
