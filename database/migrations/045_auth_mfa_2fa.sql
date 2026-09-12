-- DDL 045: Multi-Factor Authentication (MFA / 2FA) TOTP & Email OTP (FC 047 rev-2)
-- Idempotente con ADD COLUMN IF NOT EXISTS y CREATE TABLE IF NOT EXISTS (C-047.4)

-- 1. Modificar tabla users para soportar estado 2FA, secreto TOTP cifrado y anti-replay temporal
ALTER TABLE `users`
  ADD COLUMN IF NOT EXISTS `is_2fa_enabled` TINYINT(1) NOT NULL DEFAULT 0 AFTER `role`,
  ADD COLUMN IF NOT EXISTS `totp_secret_encrypted` VARCHAR(512) NULL DEFAULT NULL AFTER `is_2fa_enabled`,
  ADD COLUMN IF NOT EXISTS `last_totp_timestep` BIGINT UNSIGNED NULL DEFAULT NULL AFTER `totp_secret_encrypted`,
  ADD COLUMN IF NOT EXISTS `mfa_enrolled_at` TIMESTAMP NULL DEFAULT NULL AFTER `last_totp_timestep`;

-- 2. Tabla user_mfa_email_otps (Tokens efímeros de respaldo por correo electrónico)
CREATE TABLE IF NOT EXISTS `user_mfa_email_otps` (
  `id` BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `user_id` BIGINT UNSIGNED NOT NULL,
  `code_hash` VARCHAR(64) NOT NULL,
  `attempts` INT NOT NULL DEFAULT 0,
  `max_attempts` INT NOT NULL DEFAULT 5,
  `used` TINYINT(1) NOT NULL DEFAULT 0,
  `expires_at` TIMESTAMP NOT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `fk_mfa_email_user` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
  INDEX `idx_user_mfa_otp` (`user_id`, `expires_at`, `used`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Tabla user_mfa_recovery_codes (Códigos de contingencia de un solo uso hasheados SHA-256)
CREATE TABLE IF NOT EXISTS `user_mfa_recovery_codes` (
  `id` BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `user_id` BIGINT UNSIGNED NOT NULL,
  `code_hash` VARCHAR(64) NOT NULL,
  `used` TINYINT(1) NOT NULL DEFAULT 0,
  `used_at` TIMESTAMP NULL DEFAULT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `fk_mfa_recovery_user` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
  INDEX `idx_user_mfa_recovery` (`user_id`, `used`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
