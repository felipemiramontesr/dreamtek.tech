-- 003_leads_and_templates.sql
-- MariaDB Migration for Onboarding Leads, Templates & Orders UNIQUE Key
-- FC: protocols/fc/001c_FC_Onboarding_Wizard_and_Checkout.md (EN_FIRME)

SET FOREIGN_KEY_CHECKS = 0;

-- Table: leads
CREATE TABLE IF NOT EXISTS `leads` (
  `id` BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `email` VARCHAR(255) NOT NULL UNIQUE,
  `full_name` VARCHAR(255) NOT NULL,
  `phone` VARCHAR(50) NOT NULL,
  `company` VARCHAR(255) NULL,
  `step_reached` TINYINT UNSIGNED NOT NULL DEFAULT 1,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_leads_email` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table: templates
CREATE TABLE IF NOT EXISTS `templates` (
  `id` VARCHAR(50) PRIMARY KEY,
  `name` VARCHAR(255) NOT NULL,
  `category` VARCHAR(100) NOT NULL,
  `preview_image_url` VARCHAR(255) NOT NULL,
  `description` TEXT NOT NULL,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Alter orders table: UNIQUE constraint on payment_gateway_id
ALTER TABLE `orders` ADD UNIQUE INDEX `idx_orders_gateway_id` (`payment_gateway_id`);

SET FOREIGN_KEY_CHECKS = 1;
