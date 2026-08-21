-- Migration: 010_dam_processing_jobs_schema.sql
-- Description: DDL schema for DAM Video/Audio Preview & Transcoding Worker (FC 011)
-- Associated FC: 011_FC_DAM_Video_Audio_Preview_Transcoding_Worker

CREATE TABLE IF NOT EXISTS processing_jobs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  tenant_id INT NOT NULL,
  asset_id INT NOT NULL,
  version_id INT NOT NULL,
  job_type ENUM('IMAGE_DERIVATIVES', 'VIDEO_PREVIEW_720P', 'AUDIO_WAVEFORM', 'DOCUMENT_PREVIEW') NOT NULL,
  status ENUM('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED') NOT NULL DEFAULT 'PENDING',
  attempts INT NOT NULL DEFAULT 0,
  max_attempts INT NOT NULL DEFAULT 3,
  error_message TEXT NULL,
  metadata_payload JSON NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE CASCADE,
  FOREIGN KEY (version_id) REFERENCES asset_versions(id) ON DELETE CASCADE,
  INDEX idx_jobs_tenant_status (tenant_id, status),
  INDEX idx_jobs_asset (asset_id),
  INDEX idx_jobs_version (version_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
