-- Migration: 008_dam_acl_schema.sql
-- Description: DDL schema for DAM v1 Access Control Lists (ACL) & Granular Permissions
-- Associated FC: 006_FC_DAM_Access_Control_Lists_Granular_Permissions

CREATE TABLE IF NOT EXISTS dam_acl_entries (
  id INT AUTO_INCREMENT PRIMARY KEY,
  tenant_id INT NOT NULL,
  resource_type ENUM('WORKSPACE', 'COLLECTION', 'ASSET') NOT NULL,
  resource_id INT NOT NULL,
  principal_type ENUM('USER', 'ROLE') NOT NULL,
  principal_id VARCHAR(64) NOT NULL,
  permission ENUM('VIEW', 'DOWNLOAD', 'EDIT', 'MANAGE', 'DELETE') NOT NULL,
  granted_by VARCHAR(64) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_acl_entry (tenant_id, resource_type, resource_id, principal_type, principal_id, permission),
  INDEX idx_acl_tenant_resource (tenant_id, resource_type, resource_id),
  INDEX idx_acl_principal (tenant_id, principal_type, principal_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
