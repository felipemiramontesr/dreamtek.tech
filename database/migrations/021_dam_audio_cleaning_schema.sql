-- DDL 021: DAM AI Audio Cleaning & Background Noise Suppression

CREATE TABLE IF NOT EXISTS dam_audio_cleaning_jobs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  tenant_id INT NOT NULL,
  asset_id INT NOT NULL,
  version_id INT NOT NULL,
  profile ENUM('VOICE_ISOLATION', 'NOISE_REDUCTION', 'LOUDNESS_NORMALIZATION', 'DE_HUM') NOT NULL DEFAULT 'NOISE_REDUCTION',
  noise_reduction_db INT NOT NULL DEFAULT 12,
  status ENUM('PENDING', 'COMPLETED', 'FAILED') NOT NULL DEFAULT 'PENDING',
  output_derivative_path VARCHAR(512) NULL,
  metrics_json JSON NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_audio_cleaning_tenant_asset (tenant_id, asset_id),
  INDEX idx_audio_cleaning_version (version_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
