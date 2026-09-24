-- DDL 047: Enterprise Multi-Factor Authentication (MFA / 2FA) RFC 6238
-- Dreamtek Industrial Cyber-Security Mirror (Archon FC185)
-- Migración autónoma, no destructiva sobre 045 e idempotente (C-052.3)

-- 1. Tabla de credenciales MFA (TOTP y futuro WebAuthn)
CREATE TABLE IF NOT EXISTS `user_mfa_credentials` (
  `id` BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `user_id` BIGINT UNSIGNED NOT NULL,
  `type` ENUM('totp', 'webauthn') NOT NULL DEFAULT 'totp',
  `secret_encrypted` VARCHAR(512) NOT NULL,
  `is_confirmed` TINYINT(1) NOT NULL DEFAULT 0,
  `last_used_step` BIGINT UNSIGNED NULL DEFAULT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `uk_user_mfa_type` (`user_id`, `type`),
  INDEX `idx_user_mfa_confirmed` (`user_id`, `is_confirmed`),
  CONSTRAINT `fk_user_mfa_credentials_user` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Migrar credenciales existentes de 045 a user_mfa_credentials si existen
INSERT IGNORE INTO `user_mfa_credentials` (`user_id`, `type`, `secret_encrypted`, `is_confirmed`, `last_used_step`, `created_at`)
SELECT `id`, 'totp', `totp_secret_encrypted`, `is_2fa_enabled`, `last_totp_timestep`, COALESCE(`mfa_enrolled_at`, NOW())
FROM `users`
WHERE `totp_secret_encrypted` IS NOT NULL;

-- 3. Tabla de códigos de respaldo de emergencia (Hasheados irreversiblemente con node:crypto)
CREATE TABLE IF NOT EXISTS `user_mfa_backup_codes` (
  `id` BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `user_id` BIGINT UNSIGNED NOT NULL,
  `code_hash` VARCHAR(255) NOT NULL,
  `used_at` TIMESTAMP NULL DEFAULT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_user_mfa_backup_lookup` (`user_id`, `used_at`),
  CONSTRAINT `fk_user_mfa_backup_user` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. Tabla de desafíos efímeros de login (Rastreo atómico de intentos y revocación)
CREATE TABLE IF NOT EXISTS `mfa_challenges` (
  `challenge_id` CHAR(36) PRIMARY KEY,
  `user_id` BIGINT UNSIGNED NOT NULL,
  `attempts_used` INT NOT NULL DEFAULT 0,
  `revoked` TINYINT(1) NOT NULL DEFAULT 0,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_mfa_challenge_user_state` (`user_id`, `revoked`),
  CONSTRAINT `fk_mfa_challenge_user` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
