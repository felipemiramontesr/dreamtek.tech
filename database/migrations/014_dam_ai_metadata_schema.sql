-- DDL 014: DAM AI Vision Metadata & Smart Tagging Schema

CREATE TABLE IF NOT EXISTS asset_ai_metadata (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  tenant_id INT NOT NULL,
  asset_id INT NOT NULL,
  version_id INT NOT NULL,
  provider VARCHAR(64) NOT NULL DEFAULT 'BUILTIN_VISION',
  status ENUM('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED') NOT NULL DEFAULT 'PENDING',
  labels JSON NULL,
  dominant_colors JSON NULL,
  detected_faces INT NOT NULL DEFAULT 0,
  detected_objects JSON NULL,
  ocr_text TEXT NULL,
  min_confidence_applied DECIMAL(4, 3) NOT NULL DEFAULT 0.750,
  auto_tagged BOOLEAN NOT NULL DEFAULT FALSE,
  error_message VARCHAR(512) NULL,
  analyzed_at TIMESTAMP NULL DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_ai_metadata_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_ai_metadata_asset FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE CASCADE,
  CONSTRAINT fk_ai_metadata_version FOREIGN KEY (version_id) REFERENCES asset_versions(id) ON DELETE CASCADE,
  INDEX idx_ai_metadata_tenant_asset (tenant_id, asset_id),
  INDEX idx_ai_metadata_status (tenant_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
