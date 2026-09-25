-- DDL 048: Client Notifications and Outbound Webhooks (FC 053)
-- Portal de Clientes, Observabilidad y Notificaciones Empresariales

CREATE TABLE IF NOT EXISTS `client_notifications` (
  `id` BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `tenant_id` BIGINT UNSIGNED NOT NULL,
  `user_id` BIGINT UNSIGNED NOT NULL,
  `type` ENUM('SECURITY_ALERT', 'PROJECT_UPDATE', 'BILLING_EVENT') NOT NULL,
  `severity` ENUM('INFO', 'WARNING', 'CRITICAL') NOT NULL DEFAULT 'INFO',
  `title` VARCHAR(255) NOT NULL,
  `message` TEXT NOT NULL,
  `action_url` VARCHAR(255) NULL DEFAULT NULL,
  `is_read` TINYINT(1) NOT NULL DEFAULT 0,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `read_at` DATETIME NULL DEFAULT NULL,
  INDEX `idx_notif_tenant_user_read` (`tenant_id`, `user_id`, `is_read`),
  INDEX `idx_notif_created` (`created_at`),
  CONSTRAINT `fk_client_notif_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_client_notif_user` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `client_webhook_subscriptions` (
  `id` BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `tenant_id` BIGINT UNSIGNED NOT NULL,
  `name` VARCHAR(128) NOT NULL,
  `target_url` VARCHAR(1024) NOT NULL,
  `secret_encrypted` VARCHAR(512) NOT NULL,
  `events` JSON NOT NULL,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_client_webhook_tenant` (`tenant_id`, `is_active`),
  CONSTRAINT `fk_client_webhook_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `client_webhook_deliveries` (
  `id` BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `subscription_id` BIGINT UNSIGNED NOT NULL,
  `tenant_id` BIGINT UNSIGNED NOT NULL,
  `event_type` VARCHAR(64) NOT NULL,
  `payload` JSON NOT NULL,
  `status_code` INT NULL DEFAULT NULL,
  `status` ENUM('SUCCESS', 'FAILED') NOT NULL DEFAULT 'FAILED',
  `attempts` INT NOT NULL DEFAULT 1,
  `response_body` TEXT NULL DEFAULT NULL,
  `duration_ms` INT NOT NULL DEFAULT 0,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_client_delivery_sub` (`subscription_id`),
  INDEX `idx_client_delivery_tenant_created` (`tenant_id`, `created_at`),
  CONSTRAINT `fk_client_delivery_sub` FOREIGN KEY (`subscription_id`) REFERENCES `client_webhook_subscriptions`(`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_client_delivery_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Consultas de verificación agregada para CI Step Summary (Ley 4 y 5 de Migraciones)
SELECT COUNT(*) AS notif_count FROM `client_notifications`;
SELECT COUNT(*) AS webhook_sub_count FROM `client_webhook_subscriptions`;
SELECT COUNT(*) AS webhook_del_count FROM `client_webhook_deliveries`;
