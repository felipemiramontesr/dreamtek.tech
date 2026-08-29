-- DDL 033: DAM Video Chapters & Content Summaries Schema (FC 034)
-- Multi-tenant chaptering, timestamps and AI structured summarization

CREATE TABLE IF NOT EXISTS dam_asset_video_chapters (
  id INT AUTO_INCREMENT PRIMARY KEY,
  tenant_id INT NOT NULL,
  asset_id INT NOT NULL,
  version_id INT NOT NULL,
  chapter_index INT NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT DEFAULT NULL,
  start_time_seconds DECIMAL(6,2) NOT NULL,
  end_time_seconds DECIMAL(6,2) NOT NULL,
  thumbnail_path VARCHAR(1024) DEFAULT NULL,
  confidence DECIMAL(3,2) NOT NULL DEFAULT 0.90,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_asset_ver_chapter_idx (tenant_id, asset_id, version_id, chapter_index),
  INDEX idx_dam_video_chap_tenant (tenant_id, asset_id),
  CONSTRAINT fk_dam_video_chap_asset FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS dam_asset_video_summaries (
  id INT AUTO_INCREMENT PRIMARY KEY,
  tenant_id INT NOT NULL,
  asset_id INT NOT NULL,
  version_id INT NOT NULL,
  summary_type ENUM('EXECUTIVE', 'DETAILED', 'BULLET_POINTS', 'TOPICS_LIST') NOT NULL,
  content LONGTEXT NOT NULL,
  key_takeaways JSON NOT NULL,
  topic_tags JSON NOT NULL,
  word_count INT NOT NULL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_asset_ver_sum_type (tenant_id, asset_id, version_id, summary_type),
  INDEX idx_dam_video_sum_tenant (tenant_id, asset_id),
  CONSTRAINT fk_dam_video_sum_asset FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
