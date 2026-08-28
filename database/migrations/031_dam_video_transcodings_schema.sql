-- DDL 031: DAM Video Transcoding & Adaptive Bitrate Streaming Schema (FC 032)
CREATE TABLE IF NOT EXISTS dam_asset_video_transcodings (
  id INT AUTO_INCREMENT PRIMARY KEY,
  tenant_id INT NOT NULL,
  asset_id INT NOT NULL,
  version_id INT NOT NULL,
  profile ENUM('HLS_MULTI_BITRATE', 'HLS_1080P', 'HLS_720P', 'HLS_480P', 'HLS_360P', 'MP4_OPTIMIZED_WEB') NOT NULL,
  status ENUM('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED') NOT NULL DEFAULT 'PENDING',
  master_playlist_path VARCHAR(1024) NULL,
  renditions JSON NOT NULL,
  transcoding_metadata JSON NOT NULL,
  duration_seconds INT NOT NULL DEFAULT 0,
  bitrate_kbps INT NOT NULL DEFAULT 0,
  error_message VARCHAR(1024) NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_asset_ver_profile (tenant_id, asset_id, version_id, profile),
  INDEX idx_dam_asset_transcode_tenant (tenant_id, asset_id),
  CONSTRAINT fk_dam_asset_transcode_asset FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
