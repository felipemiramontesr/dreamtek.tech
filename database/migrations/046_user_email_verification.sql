-- DDL 046: User Email Verification Schema (FC 049)
-- Database: MariaDB / MySQL
-- Idempotent: safe for re-execution

-- 1. Agregar columnas is_email_verified y email_verified_at a users (idempotente)
SET @col_exists_verified = (
  SELECT COUNT(*) FROM information_schema.COLUMNS 
  WHERE TABLE_SCHEMA = DATABASE() 
    AND TABLE_NAME = 'users' 
    AND COLUMN_NAME = 'is_email_verified'
);

SET @sql_verified = IF(@col_exists_verified = 0,
  "ALTER TABLE users ADD COLUMN is_email_verified TINYINT(1) NOT NULL DEFAULT 1 AFTER role",
  "SELECT 'Column is_email_verified already exists in users'"
);
PREPARE stmt_verif FROM @sql_verified;
EXECUTE stmt_verif;
DEALLOCATE PREPARE stmt_verif;

SET @col_exists_at = (
  SELECT COUNT(*) FROM information_schema.COLUMNS 
  WHERE TABLE_SCHEMA = DATABASE() 
    AND TABLE_NAME = 'users' 
    AND COLUMN_NAME = 'email_verified_at'
);

SET @sql_at = IF(@col_exists_at = 0,
  "ALTER TABLE users ADD COLUMN email_verified_at TIMESTAMP NULL DEFAULT NULL AFTER is_email_verified",
  "SELECT 'Column email_verified_at already exists in users'"
);
PREPARE stmt_at FROM @sql_at;
EXECUTE stmt_at;
DEALLOCATE PREPARE stmt_at;

-- 2. Tabla user_email_verifications para almacenar códigos OTP de verificación de registro
CREATE TABLE IF NOT EXISTS user_email_verifications (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  code_hash VARCHAR(64) NOT NULL,
  attempts INT NOT NULL DEFAULT 0,
  max_attempts INT NOT NULL DEFAULT 5,
  used TINYINT(1) NOT NULL DEFAULT 0,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_email_verif_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_user_email_verif (user_id, expires_at, used)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
