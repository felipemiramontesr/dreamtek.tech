-- DDL 020: DAM AI Video Highlights & Automated Reel Generation

CREATE TABLE IF NOT EXISTS dam_video_highlights (
  id INT AUTO_INCREMENT PRIMARY KEY,
  tenant_id INT NOT NULL,
  asset_id INT NOT NULL,
  version_id INT NOT NULL,
  title VARCHAR(255) NOT NULL,
  aspect_ratio ENUM('16:9', '9:16', '1:1') NOT NULL DEFAULT '9:16',
  target_duration_seconds INT NOT NULL DEFAULT 30,
  actual_duration_seconds DECIMAL(8, 2) NOT NULL,
  selected_scene_indices_json JSON NOT NULL,
  status ENUM('PENDING', 'READY', 'FAILED') NOT NULL DEFAULT 'READY',
  output_derivative_path VARCHAR(512) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_video_highlights_tenant_asset (tenant_id, asset_id),
  INDEX idx_video_highlights_version (version_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
