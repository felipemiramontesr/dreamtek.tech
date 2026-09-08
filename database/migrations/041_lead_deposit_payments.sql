-- DDL 041: Lead B2B Deposit & Payment Links Engine (FC 043 / C-043.1)
-- Database: MariaDB / MySQL
-- Idempotent: safe for re-execution

CREATE TABLE IF NOT EXISTS lead_payments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  lead_id BIGINT UNSIGNED NOT NULL,
  stripe_session_id VARCHAR(255) NOT NULL UNIQUE,
  stripe_payment_intent_id VARCHAR(255) NULL,
  amount_cents INT UNSIGNED NOT NULL,
  currency ENUM('MXN', 'USD') NOT NULL,
  payment_type ENUM('DEPOSIT_50', 'FULL_PAYMENT', 'CUSTOM') NOT NULL DEFAULT 'DEPOSIT_50',
  status ENUM('PENDING', 'PAID', 'EXPIRED', 'CANCELLED') NOT NULL DEFAULT 'PENDING',
  checkout_url VARCHAR(1024) NOT NULL,
  expires_at DATETIME NOT NULL,
  paid_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_lead_payments_lead_id (lead_id),
  INDEX idx_lead_payments_status (status),
  INDEX idx_lead_payments_stripe_session (stripe_session_id),
  CONSTRAINT fk_lead_payments_lead FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Columna de estado de anticipo en tabla leads (idempotente)
SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.COLUMNS 
  WHERE TABLE_SCHEMA = DATABASE() 
    AND TABLE_NAME = 'leads' 
    AND COLUMN_NAME = 'deposit_status'
);

SET @sql = IF(@col_exists = 0,
  "ALTER TABLE leads ADD COLUMN deposit_status ENUM('UNPAID', 'PENDING', 'PAID') NOT NULL DEFAULT 'UNPAID' AFTER status",
  "SELECT 'Column deposit_status already exists in leads'"
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
