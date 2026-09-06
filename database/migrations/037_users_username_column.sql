-- 037_users_username_column.sql
-- Add username column to users table for dual login support
-- FC: protocols/fc/038_FC_Dreamtek_Unified_Client_Admin_Dashboard.md (EN_FIRME)

ALTER TABLE `users` ADD COLUMN IF NOT EXISTS `username` VARCHAR(64) NULL UNIQUE AFTER `id`;
