-- DDL 035: DAM Dynamic Video Watermarking & Forensic Tracking Schema (FC 036)
-- Multi-tenant dynamic video watermarking, identity stamping and HMAC forensic payload tracking

CREATE TABLE IF NOT EXISTS dam_asset_video_watermarks (
  id INT AUTO_INCREMENT PRIMARY KEY,
  tenant_id INT NOT NULL,
  asset_id INT NOT NULL,
  version_id INT NOT NULL DEFAULT 1,
  watermark_type ENUM(
    'DYNAMIC_OVERLAY',
    'FORENSIC_STEGANOGRAPHIC',
    'BURNED_TIMECODE',
    'USER_IDENTIFIER_STAMP'
  ) NOT NULL DEFAULT 'DYNAMIC_OVERLAY',
  position_strategy ENUM(
    'STATIC_CORNER',
    'FLOATING_BOUNCE',
    'RANDOM_INTERVALS',
    'CENTER_TILED'
  ) NOT NULL DEFAULT 'STATIC_CORNER',
  opacity DECIMAL(3,2) NOT NULL DEFAULT 0.50,
  user_identifier VARCHAR(255) NULL,
  tracking_payload JSON NULL,
  output_derivative_path VARCHAR(1024) NULL,
  watermark_metadata JSON NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_asset_ver_wm_type (tenant_id, asset_id, version_id, watermark_type),
  INDEX idx_video_wm_lookup (tenant_id, asset_id, version_id),
  INDEX idx_video_wm_type (tenant_id, watermark_type),
  CONSTRAINT fk_dam_video_watermarks_asset FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
