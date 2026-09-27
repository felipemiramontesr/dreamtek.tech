-- FC054-F3 · 2026-09-26
-- FC 054 Witness Migration: Schema Parity & Naming Lock Verification
-- Idempotent, fail-safe verification table. No DROP.

CREATE TABLE IF NOT EXISTS schema_parity_fingerprints (
  id INT AUTO_INCREMENT PRIMARY KEY,
  lock_version VARCHAR(50) NOT NULL,
  milestone VARCHAR(50) NOT NULL,
  verified_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO schema_parity_fingerprints (lock_version, milestone)
SELECT 'V0.1.104', 'FC054-F3'
WHERE NOT EXISTS (
  SELECT 1 FROM schema_parity_fingerprints WHERE lock_version = 'V0.1.104' AND milestone = 'FC054-F3'
);

SELECT COUNT(*) AS parity_fingerprint_rows FROM schema_parity_fingerprints;
