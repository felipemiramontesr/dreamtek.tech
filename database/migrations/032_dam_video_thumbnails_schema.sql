-- DDL 032: DAM Video Thumbnails & Animated Preview Schema (FC 033)
CREATE TABLE IF NOT EXISTS dam_asset_video_thumbnails (
  id INT AUTO_INCREMENT PRIMARY KEY,
  tenant_id INT NOT NULL,
  asset_id INT NOT NULL,
  version_id INT NOT NULL,
  thumbnail_type ENUM('STATIC_POSTER', 'ANIMATED_GIF', 'ANIMATED_WEBP', 'HOVER_SCRUBBER_VTT') NOT NULL,
  timestamp_offset_seconds DECIMAL(6,2) NOT NULL DEFAULT 0.00,
  duration_seconds DECIMAL(5,2) NOT NULL DEFAULT 0.00,
  width INT NOT NULL DEFAULT 0,
  height INT NOT NULL DEFAULT 0,
  fps INT NOT NULL DEFAULT 0,
  output_derivative_path VARCHAR(1024) NOT NULL,
  thumbnail_metadata JSON NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_asset_ver_type_ts (tenant_id, asset_id, version_id, thumbnail_type, timestamp_offset_seconds),
  INDEX idx_dam_asset_thumb_tenant (tenant_id, asset_id),
  CONSTRAINT fk_dam_asset_thumb_asset FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
