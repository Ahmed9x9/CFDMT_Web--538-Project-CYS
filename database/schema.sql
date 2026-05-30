CREATE DATABASE IF NOT EXISTS cfdmt_web
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE cfdmt_web;

CREATE TABLE IF NOT EXISTS users (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  full_name VARCHAR(120) NOT NULL,
  email VARCHAR(190) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('user', 'admin') NOT NULL DEFAULT 'user',
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS files (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL,
  original_name VARCHAR(255) NOT NULL,
  stored_name VARCHAR(255) NOT NULL,
  storage_path VARCHAR(500) NOT NULL,
  file_type VARCHAR(30) NOT NULL,
  mime_type VARCHAR(120),
  size_bytes BIGINT UNSIGNED NOT NULL DEFAULT 0,
  sha256 CHAR(64) NOT NULL,
  status ENUM('pending', 'clean', 'suspicious', 'corrupted', 'repaired', 'repair_failed', 'deleted') NOT NULL DEFAULT 'pending',
  latest_evidence TEXT,
  uploaded_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP NULL,
  user_hidden_at TIMESTAMP NULL,
  CONSTRAINT fk_files_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_files_user_uploaded (user_id, uploaded_at),
  INDEX idx_files_user_status (user_id, status),
  INDEX idx_files_user_hidden_uploaded (user_id, user_hidden_at, uploaded_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS scan_results (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  file_id INT UNSIGNED NOT NULL,
  user_id INT UNSIGNED NOT NULL,
  scan_profile ENUM('quick', 'full', 'custom') NOT NULL DEFAULT 'full',
  status ENUM('queued', 'running', 'completed', 'failed', 'cancelled') NOT NULL DEFAULT 'completed',
  result_status ENUM('clean', 'suspicious', 'corrupted') NOT NULL,
  scanned_count INT UNSIGNED NOT NULL DEFAULT 1,
  flagged_count INT UNSIGNED NOT NULL DEFAULT 0,
  evidence_summary TEXT,
  error_message TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  user_hidden_at TIMESTAMP NULL,
  CONSTRAINT fk_scan_results_file FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE CASCADE,
  CONSTRAINT fk_scan_results_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_scan_results_user_created (user_id, created_at),
  INDEX idx_scan_results_file_created (file_id, created_at),
  INDEX idx_scan_results_user_hidden_created (user_id, user_hidden_at, created_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS scan_findings (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  scan_result_id INT UNSIGNED NOT NULL,
  file_id INT UNSIGNED NOT NULL,
  user_id INT UNSIGNED NOT NULL,
  check_code VARCHAR(80) NOT NULL,
  severity ENUM('info', 'low', 'medium', 'high', 'critical') NOT NULL DEFAULT 'info',
  evidence TEXT NOT NULL,
  recommendation TEXT,
  raw_details JSON,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_scan_findings_scan FOREIGN KEY (scan_result_id) REFERENCES scan_results(id) ON DELETE CASCADE,
  CONSTRAINT fk_scan_findings_file FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE CASCADE,
  CONSTRAINT fk_scan_findings_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_scan_findings_file (file_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS repair_jobs (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  file_id INT UNSIGNED NOT NULL,
  user_id INT UNSIGNED NOT NULL,
  status ENUM('queued', 'running', 'succeeded', 'failed', 'cancelled') NOT NULL DEFAULT 'queued',
  message TEXT,
  backup_path VARCHAR(500),
  repaired_path VARCHAR(500),
  validation_passed TINYINT(1),
  details JSON,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finished_at TIMESTAMP NULL,
  user_hidden_at TIMESTAMP NULL,
  CONSTRAINT fk_repair_jobs_file FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE CASCADE,
  CONSTRAINT fk_repair_jobs_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_repair_jobs_user_created (user_id, created_at),
  INDEX idx_repair_jobs_file_created (file_id, created_at),
  INDEX idx_repair_jobs_user_hidden_created (user_id, user_hidden_at, created_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS action_logs (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED,
  file_id INT UNSIGNED,
  action ENUM('register', 'upload', 'scan', 'repair', 'download', 'delete', 'dismiss', 'settings_update', 'admin_update', 'login', 'logout', 'failed_login', 'upload_rejected', 'export_audit', 'archive_logs', 'clear_failed_jobs', 'policy_update', 'user_update') NOT NULL,
  notes TEXT,
  metadata JSON,
  ip_address VARCHAR(45),
  user_agent VARCHAR(255),
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  archived_at TIMESTAMP NULL,
  user_hidden_at TIMESTAMP NULL,
  CONSTRAINT fk_action_logs_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_action_logs_file FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE SET NULL,
  INDEX idx_action_logs_user_created (user_id, created_at),
  INDEX idx_action_logs_file_created (file_id, created_at),
  INDEX idx_action_logs_archived_created (archived_at, created_at),
  INDEX idx_action_logs_user_hidden_created (user_id, user_hidden_at, created_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS user_settings (
  user_id INT UNSIGNED PRIMARY KEY,
  theme VARCHAR(20) NOT NULL DEFAULT 'system',
  language VARCHAR(10) NOT NULL DEFAULT 'en',
  default_scan_profile ENUM('quick', 'full', 'custom') NOT NULL DEFAULT 'full',
  email_notifications TINYINT(1) NOT NULL DEFAULT 1,
  default_upload_action ENUM('upload_only', 'upload_and_scan') NOT NULL DEFAULT 'upload_only',
  show_expired_files TINYINT(1) NOT NULL DEFAULT 1,
  preferred_file_view ENUM('compact', 'detailed') NOT NULL DEFAULT 'detailed',
  hide_cleared_history TINYINT(1) NOT NULL DEFAULT 1,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_user_settings_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS app_settings (
  setting_key VARCHAR(80) PRIMARY KEY,
  setting_value TEXT NOT NULL,
  updated_by INT UNSIGNED NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_app_settings_updated_by FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

INSERT INTO app_settings (setting_key, setting_value)
VALUES
  ('allowed_extensions', 'png,jpg,jpeg,pdf,zip,rar,7z'),
  ('max_upload_size_mb', '50'),
  ('auto_scan_on_upload', 'false'),
  ('file_access_window_seconds', '86400')
ON DUPLICATE KEY UPDATE setting_value = setting_value;
