-- DDL 036: Escolta WEB Provisioning & Client Site Records (FC 037)
CREATE TABLE IF NOT EXISTS client_sites (
  id INT AUTO_INCREMENT PRIMARY KEY,
  tenant_id INT NOT NULL,
  user_id INT NOT NULL,
  domain VARCHAR(255) NOT NULL,
  template_id VARCHAR(64) NOT NULL DEFAULT 'corporate',
  status ENUM('PENDING_SETUP', 'IN_DEVELOPMENT', 'DNS_CONFIG', 'LIVE', 'SUSPENDED') NOT NULL DEFAULT 'PENDING_SETUP',
  ssl VARCHAR(32) NOT NULL DEFAULT 'PENDING',
  notes TEXT DEFAULT NULL,
  branding_assets_path VARCHAR(1024) DEFAULT NULL,
  stripe_session_id VARCHAR(255) DEFAULT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_site_domain (domain),
  INDEX idx_client_sites_user (user_id),
  INDEX idx_client_sites_tenant (tenant_id),
  CONSTRAINT fk_client_sites_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
