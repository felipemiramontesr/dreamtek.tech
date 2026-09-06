-- 038_quote_funnel_leads.sql
-- MariaDB Migration for Interactive Quote Funnel & Technical Diagnostic (FC 039)
-- Placed AFTER company column per C-039.1 (leads has no plan_id)

ALTER TABLE `leads`
  ADD COLUMN IF NOT EXISTS `project_vertical` VARCHAR(64) NULL AFTER `company`,
  ADD COLUMN IF NOT EXISTS `complexity_level` VARCHAR(32) NULL AFTER `project_vertical`,
  ADD COLUMN IF NOT EXISTS `estimated_budget_min` DECIMAL(12,2) NULL AFTER `complexity_level`,
  ADD COLUMN IF NOT EXISTS `estimated_budget_max` DECIMAL(12,2) NULL AFTER `estimated_budget_min`,
  ADD COLUMN IF NOT EXISTS `estimated_weeks_min` INT NULL AFTER `estimated_budget_max`,
  ADD COLUMN IF NOT EXISTS `estimated_weeks_max` INT NULL AFTER `estimated_weeks_min`,
  ADD COLUMN IF NOT EXISTS `requirements_payload` JSON NULL AFTER `estimated_weeks_max`,
  ADD COLUMN IF NOT EXISTS `ip_address` VARCHAR(45) NULL AFTER `requirements_payload`;
