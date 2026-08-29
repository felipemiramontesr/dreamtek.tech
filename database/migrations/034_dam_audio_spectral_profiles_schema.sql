-- DDL 034: DAM Audio Spectral Profiles & De-humming Schema (FC 035)
-- Multi-tenant acoustic spectral profiling, notch filtering parameters and spectrogram derivative tracking

CREATE TABLE IF NOT EXISTS dam_asset_audio_spectral_profiles (
  id INT AUTO_INCREMENT PRIMARY KEY,
  tenant_id INT NOT NULL,
  asset_id INT NOT NULL,
  version_id INT NOT NULL,
  profile_type ENUM('MAINS_HUM_50HZ', 'MAINS_HUM_60HZ', 'BROADBAND_HISS', 'HVAC_RUMBLE', 'GROUND_LOOP', 'CUSTOM') NOT NULL,
  base_frequency_hz DECIMAL(6,2) NOT NULL,
  harmonic_count INT NOT NULL DEFAULT 1,
  attenuation_db DECIMAL(4,2) NOT NULL DEFAULT 12.00,
  spectral_noise_floor_db DECIMAL(5,2) NOT NULL DEFAULT -60.00,
  q_factor DECIMAL(4,2) NOT NULL DEFAULT 10.00,
  output_derivative_path VARCHAR(1024) DEFAULT NULL,
  spectral_metadata JSON DEFAULT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_asset_ver_profile_type (tenant_id, asset_id, version_id, profile_type),
  INDEX idx_dam_audio_spec_tenant (tenant_id, asset_id),
  CONSTRAINT fk_dam_audio_spec_asset FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
