-- FC055-F2 · 2026-09-28
-- Feature Contract: 055 (Anti_Bot_Deep_Defense_PoW_Throttle_And_Traffic_Scheduler)
-- Discipline: Canonical (>= 049) · MariaDB 10.x/11.x strict compatibility

-- 1. Table: auth_throttle_counters
-- Progressive delay tracking by HMAC(user|ip)
CREATE TABLE IF NOT EXISTS auth_throttle_counters (
  key_hash CHAR(64) NOT NULL,
  counter INT UNSIGNED NOT NULL DEFAULT 1,
  window_start DATETIME NOT NULL,
  last_attempt_at DATETIME NOT NULL,
  PRIMARY KEY (key_hash),
  INDEX idx_throttle_lookup (key_hash, last_attempt_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Table: auth_challenge_nonces
-- Replay prevention for Proof-of-Work solutions
CREATE TABLE IF NOT EXISTS auth_challenge_nonces (
  nonce_hash CHAR(64) NOT NULL,
  expires_at DATETIME NOT NULL,
  PRIMARY KEY (nonce_hash),
  INDEX idx_nonce_expiry (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Column: users.signup_source
-- Differentiates accounts created via public signup from admin invitations
ALTER TABLE users ADD COLUMN IF NOT EXISTS signup_source ENUM('admin', 'public') NOT NULL DEFAULT 'admin';
