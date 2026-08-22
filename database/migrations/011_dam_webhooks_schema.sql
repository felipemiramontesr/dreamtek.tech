-- Migration 011: DAM Webhooks & Outbound Event Notifications Schema (FC 012)
-- Storage for webhook endpoints and delivery attempt logs

CREATE TABLE IF NOT EXISTS webhook_endpoints (
  id INT AUTO_INCREMENT PRIMARY KEY,
  tenant_id INT NOT NULL,
  url VARCHAR(2048) NOT NULL,
  secret VARCHAR(128) NOT NULL,
  description VARCHAR(255) NULL,
  events JSON NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  INDEX idx_webhook_endpoints_tenant (tenant_id, is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id INT AUTO_INCREMENT PRIMARY KEY,
  tenant_id INT NOT NULL,
  webhook_endpoint_id INT NOT NULL,
  event_type VARCHAR(64) NOT NULL,
  payload JSON NOT NULL,
  status ENUM('PENDING', 'SUCCESS', 'FAILED', 'EXHAUSTED') NOT NULL DEFAULT 'PENDING',
  status_code INT NULL,
  response_body TEXT NULL,
  error_message VARCHAR(512) NULL,
  attempts INT NOT NULL DEFAULT 0,
  max_attempts INT NOT NULL DEFAULT 3,
  delivered_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY (webhook_endpoint_id) REFERENCES webhook_endpoints(id) ON DELETE CASCADE,
  INDEX idx_webhook_deliveries_endpoint (webhook_endpoint_id, created_at),
  INDEX idx_webhook_deliveries_tenant_status (tenant_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
