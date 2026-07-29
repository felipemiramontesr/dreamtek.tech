-- 001_admin_bootstrap.sql
-- Seed script for initial ADMIN user creation
-- FC: protocols/fc/001b_FC_Auth_Engine_and_RBAC.md (EN_FIRME)
-- Apply Note A-B1: Uses a placeholder BCRYPT hash. Replace with Ω generated hash in production.

INSERT INTO `users` (`email`, `password_hash`, `full_name`, `phone`, `role`, `created_at`)
VALUES (
  'admin@dreamtek.tech',
  '$2y$12$PLACEHOLDER_BCRYPT_HASH_REPLACE_WITH_OMEGA_SEED_HASH_IN_PROD',
  'Dreamtek System Administrator',
  '+525500000000',
  'ADMIN',
  NOW()
)
ON DUPLICATE KEY UPDATE `role` = 'ADMIN';
