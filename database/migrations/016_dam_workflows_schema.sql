-- ==============================================================================
-- Migration 016: DAM Custom Dynamic Workflows & Automation Engine
-- Feature Contract: FC 017
-- Standards: OWASP Top 10:2021 (A01, A04, A09), ISO 25010 Multi-Tenant Security
-- ==============================================================================

CREATE TABLE IF NOT EXISTS dam_workflows (
  id INT AUTO_INCREMENT PRIMARY KEY,
  tenant_id INT NOT NULL,
  name VARCHAR(128) NOT NULL,
  description VARCHAR(500) NULL,
  trigger_event ENUM(
    'ASSET_CREATED',
    'ASSET_UPDATED',
    'ASSET_TAGGED',
    'AI_ANALYZED',
    'RIGHTS_EXPIRED',
    'MANUAL'
  ) NOT NULL,
  conditions JSON NOT NULL,
  actions JSON NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_workflows_tenant (tenant_id),
  INDEX idx_workflows_tenant_trigger (tenant_id, trigger_event, is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS dam_workflow_executions (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  tenant_id INT NOT NULL,
  workflow_id INT NOT NULL,
  asset_id INT NOT NULL,
  trigger_event VARCHAR(64) NOT NULL,
  status ENUM('SUCCESS', 'FAILED', 'SKIPPED') NOT NULL,
  execution_logs JSON NOT NULL,
  executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (workflow_id) REFERENCES dam_workflows(id) ON DELETE CASCADE,
  FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE CASCADE,
  INDEX idx_workflow_exec_tenant (tenant_id, workflow_id),
  INDEX idx_workflow_exec_asset (tenant_id, asset_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
