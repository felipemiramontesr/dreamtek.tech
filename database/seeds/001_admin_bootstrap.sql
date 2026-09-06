-- 001_admin_bootstrap.sql
-- Seed script for initial ADMIN user creation
-- FC: protocols/fc/001b_FC_Auth_Engine_and_RBAC.md (EN_FIRME)
-- Apply Note A-B1: Uses a placeholder BCRYPT hash. Replace with Ω generated hash in production.

INSERT INTO `users` (`username`, `email`, `password_hash`, `full_name`, `phone`, `role`, `created_at`)
VALUES (
  'GrayMan',
  'admin@dreamtek.tech',
  '$2a$12$eT1Sos/9KyX0wEaOtsSsi./mp3Up87ymTgt7.BLJmy.r6UBiud67S',
  'GrayMan Omnipotent Administrator',
  '+525500000000',
  'ADMIN',
  NOW()
)
ON DUPLICATE KEY UPDATE `username` = 'GrayMan', `role` = 'ADMIN', `password_hash` = VALUES(`password_hash`);
