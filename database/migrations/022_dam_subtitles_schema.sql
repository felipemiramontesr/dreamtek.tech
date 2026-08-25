-- DDL 022: DAM AI Automated Subtitling & Multi-Language Translation

CREATE TABLE IF NOT EXISTS dam_asset_subtitles (
  id INT AUTO_INCREMENT PRIMARY KEY,
  tenant_id INT NOT NULL,
  asset_id INT NOT NULL,
  version_id INT NOT NULL,
  language_code VARCHAR(10) NOT NULL DEFAULT 'es',
  format ENUM('SRT', 'VTT', 'JSON') NOT NULL DEFAULT 'VTT',
  cues_count INT NOT NULL DEFAULT 0,
  output_derivative_path VARCHAR(512) NULL,
  cues_json JSON NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_subtitles_asset_ver_lang_fmt (tenant_id, asset_id, version_id, language_code, format),
  INDEX idx_subtitles_tenant_asset (tenant_id, asset_id),
  INDEX idx_subtitles_version (version_id),
  INDEX idx_subtitles_lang (language_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
