-- DDL 015: DAM Embeddings & Vector Similarity Search Schema

CREATE TABLE IF NOT EXISTS asset_embeddings (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  tenant_id INT NOT NULL,
  asset_id INT NOT NULL,
  version_id INT NOT NULL,
  model_name VARCHAR(64) NOT NULL DEFAULT 'dreamtek-multimodal-v1',
  dimensions INT NOT NULL DEFAULT 64,
  embedding_vector JSON NOT NULL,
  text_representation TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE CASCADE,
  INDEX idx_embeddings_tenant_asset (tenant_id, asset_id),
  INDEX idx_embeddings_model (model_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
