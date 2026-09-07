-- 040_multi_currency_i18n_leads.sql
-- MariaDB Migration for Multi-Currency & Locale Support in Leads CRM (FC 042 rev-2)

ALTER TABLE `leads`
  ADD COLUMN IF NOT EXISTS `currency` ENUM('MXN', 'USD') NOT NULL DEFAULT 'MXN' AFTER `complexity_level`,
  ADD COLUMN IF NOT EXISTS `locale` ENUM('es', 'en') NOT NULL DEFAULT 'es' AFTER `currency`;

CREATE INDEX IF NOT EXISTS `idx_leads_currency_locale` ON `leads` (`currency`, `locale`);
