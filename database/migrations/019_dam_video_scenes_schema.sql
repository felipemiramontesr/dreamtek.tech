-- DDL 019: DAM AI Semantic Video Scene Search & Speech Transcription

CREATE TABLE IF NOT EXISTS dam_video_scenes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  tenant_id INT NOT NULL,
  asset_id INT NOT NULL,
  version_id INT NOT NULL,
  scene_index INT NOT NULL,
  start_time_seconds DECIMAL(8, 2) NOT NULL,
  end_time_seconds DECIMAL(8, 2) NOT NULL,
  visual_description TEXT NULL,
  detected_objects_json JSON NULL,
  confidence DECIMAL(5, 4) NOT NULL DEFAULT 1.0000,
  keyframe_path VARCHAR(512) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_video_scenes_tenant_asset (tenant_id, asset_id),
  INDEX idx_video_scenes_version (version_id),
  INDEX idx_video_scenes_start_time (start_time_seconds)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS dam_video_transcripts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  tenant_id INT NOT NULL,
  asset_id INT NOT NULL,
  version_id INT NOT NULL,
  segment_index INT NOT NULL,
  start_time_seconds DECIMAL(8, 2) NOT NULL,
  end_time_seconds DECIMAL(8, 2) NOT NULL,
  transcript_text TEXT NOT NULL,
  speaker_label VARCHAR(64) NULL,
  confidence DECIMAL(5, 4) NOT NULL DEFAULT 1.0000,
  language_code VARCHAR(12) NOT NULL DEFAULT 'es',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_video_transcripts_tenant_asset (tenant_id, asset_id),
  INDEX idx_video_transcripts_version (version_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
