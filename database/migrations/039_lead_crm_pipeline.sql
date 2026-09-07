-- 039_lead_crm_pipeline.sql
-- MariaDB Migration for Lead CRM Pipeline & Follow-Up Automation (FC 041 rev-2)
-- Ordered ALTER on leads and creation of lead_activities timeline table

SET FOREIGN_KEY_CHECKS = 0;

-- 1. Ampliación de tabla leads con ciclo de vida comercial
ALTER TABLE `leads`
  ADD COLUMN IF NOT EXISTS `status` ENUM(
    'NEW',
    'CONTACTED',
    'QUALIFIED',
    'PROPOSAL_SENT',
    'NEGOTIATION',
    'WON',
    'LOST'
  ) NOT NULL DEFAULT 'NEW' AFTER `ip_address`,
  ADD COLUMN IF NOT EXISTS `assigned_to` BIGINT UNSIGNED NULL AFTER `status`,
  ADD COLUMN IF NOT EXISTS `last_contacted_at` DATETIME NULL AFTER `assigned_to`,
  ADD INDEX IF NOT EXISTS `idx_leads_status` (`status`),
  ADD CONSTRAINT `fk_leads_assigned_to` FOREIGN KEY (`assigned_to`) REFERENCES `users` (`id`) ON DELETE SET NULL;

-- 2. Tabla de actividades y bitácora de interacciones del prospecto
CREATE TABLE IF NOT EXISTS `lead_activities` (
  `id` BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `lead_id` BIGINT UNSIGNED NOT NULL,
  `user_id` BIGINT UNSIGNED NULL,
  `activity_type` ENUM(
    'STATUS_CHANGE',
    'NOTE',
    'EMAIL_SENT',
    'CALL_LOG',
    'MEETING_SCHEDULED'
  ) NOT NULL,
  `title` VARCHAR(128) NOT NULL,
  `details` TEXT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_lead_activities_lead_id` (`lead_id`),
  INDEX `idx_lead_activities_created_at` (`created_at`),
  CONSTRAINT `fk_lead_activities_lead` FOREIGN KEY (`lead_id`) REFERENCES `leads` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_lead_activities_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;
