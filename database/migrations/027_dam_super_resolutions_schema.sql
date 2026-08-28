-- DDL 027: DAM Asset Super Resolution & Smart Upscaling Schema
-- Feature Contract: 028_FC_DAM_AI_Image_Super_Resolution_Smart_Upscaling (rev-2)
-- Standards: OWASP A01:2021 (Broken Access Control), A03:2021 (Injection), A04:2021 (Insecure Design)

CREATE TABLE IF NOT EXISTS dam_asset_super_resolutions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  tenant_id INT NOT NULL,
  asset_id INT NOT NULL,
  version_id INT NOT NULL,
  scale_factor ENUM('2x', '4x') NOT NULL DEFAULT '2x',
  algorithm ENUM('LANCZOS3_SHARP', 'BICUBIC_SMOOTH', 'EDGES_ENHANCED') NOT NULL DEFAULT 'LANCZOS3_SHARP',
  denoise_level INT NOT NULL DEFAULT 10,
  sharpness_boost INT NOT NULL DEFAULT 20,
  output_width INT NOT NULL,
  output_height INT NOT NULL,
  output_derivative_path VARCHAR(1024) NOT NULL,
  upscale_metadata JSON NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_asset_version_scale_algo (tenant_id, asset_id, version_id, scale_factor, algorithm),
  INDEX idx_dam_super_res_tenant_asset (tenant_id, asset_id),
  CONSTRAINT fk_dam_super_res_asset FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
