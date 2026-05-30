USE cfdmt_web;

SET @previous_sql_safe_updates = @@SQL_SAFE_UPDATES;
SET SQL_SAFE_UPDATES = 0;

START TRANSACTION;

CREATE TEMPORARY TABLE IF NOT EXISTS decoy_users_to_delete (
  id INT UNSIGNED PRIMARY KEY
);
TRUNCATE TABLE decoy_users_to_delete;

INSERT INTO decoy_users_to_delete (id)
SELECT id
FROM users
WHERE email IN (
  'decoy.admin@cfdmt.test',
  'nora.decoy@cfdmt.test',
  'omar.decoy@cfdmt.test',
  'sara.decoy@cfdmt.test',
  'khalid.decoy@cfdmt.test'
);

CREATE TEMPORARY TABLE IF NOT EXISTS decoy_files_to_delete (
  id INT UNSIGNED PRIMARY KEY
);
TRUNCATE TABLE decoy_files_to_delete;

INSERT INTO decoy_files_to_delete (id)
SELECT id
FROM files
WHERE user_id IN (SELECT id FROM decoy_users_to_delete);

DELETE FROM action_logs
WHERE user_id IN (SELECT id FROM decoy_users_to_delete)
   OR file_id IN (SELECT id FROM decoy_files_to_delete);

DELETE FROM users
WHERE id IN (SELECT id FROM decoy_users_to_delete);

DROP TEMPORARY TABLE decoy_files_to_delete;
DROP TEMPORARY TABLE decoy_users_to_delete;

SET @test_password_hash = '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2uheWG/igi.';

INSERT INTO users (full_name, email, password_hash, role, is_active, created_at, updated_at)
VALUES
  ('Decoy Admin', 'decoy.admin@cfdmt.test', @test_password_hash, 'admin', 1, '2026-05-10 09:00:00', '2026-05-10 09:00:00'),
  ('Nora Decoy', 'nora.decoy@cfdmt.test', @test_password_hash, 'user', 1, '2026-05-11 10:15:00', '2026-05-11 10:15:00'),
  ('Omar Decoy', 'omar.decoy@cfdmt.test', @test_password_hash, 'user', 1, '2026-05-12 11:20:00', '2026-05-12 11:20:00'),
  ('Sara Decoy', 'sara.decoy@cfdmt.test', @test_password_hash, 'user', 1, '2026-05-13 12:25:00', '2026-05-13 12:25:00'),
  ('Khalid Decoy', 'khalid.decoy@cfdmt.test', @test_password_hash, 'user', 1, '2026-05-14 13:30:00', '2026-05-14 13:30:00');

SELECT id INTO @decoy_admin_id FROM users WHERE email = 'decoy.admin@cfdmt.test';
SELECT id INTO @nora_id FROM users WHERE email = 'nora.decoy@cfdmt.test';
SELECT id INTO @omar_id FROM users WHERE email = 'omar.decoy@cfdmt.test';
SELECT id INTO @sara_id FROM users WHERE email = 'sara.decoy@cfdmt.test';
SELECT id INTO @khalid_id FROM users WHERE email = 'khalid.decoy@cfdmt.test';

INSERT INTO user_settings (user_id, theme, language, default_scan_profile, email_notifications)
VALUES
  (@decoy_admin_id, 'dark', 'en', 'full', 1),
  (@nora_id, 'system', 'en', 'full', 1),
  (@omar_id, 'dark', 'en', 'full', 0),
  (@sara_id, 'light', 'en', 'full', 1),
  (@khalid_id, 'system', 'en', 'custom', 1)
ON DUPLICATE KEY UPDATE
  theme = VALUES(theme),
  language = VALUES(language),
  default_scan_profile = VALUES(default_scan_profile),
  email_notifications = VALUES(email_notifications);

INSERT INTO app_settings (setting_key, setting_value, updated_by)
VALUES
  ('allowed_extensions', 'png,jpg,jpeg,pdf,zip,rar,7z', @decoy_admin_id),
  ('max_upload_size_mb', '50', @decoy_admin_id),
  ('auto_scan_on_upload', 'false', @decoy_admin_id),
  ('file_access_window_seconds', '86400', @decoy_admin_id)
ON DUPLICATE KEY UPDATE
  setting_value = VALUES(setting_value),
  updated_by = VALUES(updated_by);

INSERT INTO files (
  user_id, original_name, stored_name, storage_path, file_type, mime_type,
  size_bytes, sha256, status, latest_evidence, uploaded_at, updated_at
)
VALUES
  (@nora_id, 'quarterly_report.pdf', 'decoy_001_quarterly_report.pdf', 'api/uploads/decoy_001_quarterly_report.pdf', 'PDF', 'application/pdf', 2467328, 'a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1', 'clean', 'PDF trailer and cross-reference structure valid.', '2026-05-19 09:14:21', '2026-05-19 09:15:08'),
  (@nora_id, 'image_missing_iend.png', 'decoy_002_image_missing_iend.png', 'api/uploads/decoy_002_image_missing_iend.png', 'PNG', 'image/png', 845312, 'b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2', 'suspicious', 'PNG end marker was not found near the end of the file.', '2026-05-19 11:42:10', '2026-05-19 11:43:02'),
  (@omar_id, 'archive_records.zip', 'decoy_003_archive_records.zip', 'api/uploads/decoy_003_archive_records.zip', 'ZIP', 'application/zip', 12890112, 'c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3', 'corrupted', 'ZIP central directory could not be validated.', '2026-05-20 08:05:00', '2026-05-20 08:06:18'),
  (@omar_id, 'profile_picture.jpg', 'decoy_004_profile_picture.jpg', 'api/uploads/decoy_004_profile_picture.jpg', 'JPG', 'image/jpeg', 324480, 'd4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4', 'clean', 'JPEG start and end markers found.', '2026-05-20 12:18:37', '2026-05-20 12:19:02'),
  (@sara_id, 'damaged_photo.jpg', 'decoy_005_damaged_photo.jpg', 'api/uploads/decoy_005_damaged_photo.jpg', 'JPG', 'image/jpeg', 1452032, 'e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5', 'repaired', 'JPEG repair added a missing end-of-image marker.', '2026-05-21 10:10:12', '2026-05-21 10:21:19'),
  (@sara_id, 'scanned_contract.pdf', 'decoy_006_scanned_contract.pdf', 'api/uploads/decoy_006_scanned_contract.pdf', 'PDF', 'application/pdf', 978944, 'f6f6f6f6f6f6f6f6f6f6f6f6f6f6f6f6f6f6f6f6f6f6f6f6f6f6f6f6f6f6f6f6', 'corrupted', 'PDF EOF marker missing.', '2026-05-21 14:50:04', '2026-05-21 14:51:31'),
  (@khalid_id, 'case_archive.rar', 'decoy_007_case_archive.rar', 'api/uploads/decoy_007_case_archive.rar', 'RAR', 'application/vnd.rar', 63212, '1717171717171717171717171717171717171717171717171717171717171717', 'suspicious', 'RAR archive signature found, but deep archive validation is limited.', '2026-05-22 09:22:33', '2026-05-22 09:23:15'),
  (@khalid_id, 'evidence_bundle.7z', 'decoy_008_evidence_bundle.7z', 'api/uploads/decoy_008_evidence_bundle.7z', '7Z', 'application/x-7z-compressed', 3827712, '2828282828282828282828282828282828282828282828282828282828282828', 'clean', '7Z archive signature was found.', '2026-05-22 15:40:44', '2026-05-22 15:41:10'),
  (@nora_id, 'pending_upload.png', 'decoy_009_pending_upload.png', 'api/uploads/decoy_009_pending_upload.png', 'PNG', 'image/png', 118944, '3939393939393939393939393939393939393939393939393939393939393939', 'pending', 'Uploaded and waiting for scan.', '2026-05-23 08:35:02', '2026-05-23 08:35:02'),
  (@omar_id, 'diagram.png', 'decoy_010_diagram.png', 'api/uploads/decoy_010_diagram.png', 'PNG', 'image/png', 704512, '4040404040404040404040404040404040404040404040404040404040404040', 'clean', 'PNG signature and IEND marker found.', '2026-05-23 10:11:59', '2026-05-23 10:12:30'),
  (@sara_id, 'old_backup.zip', 'decoy_011_old_backup.zip', 'api/uploads/decoy_011_old_backup.zip', 'ZIP', 'application/zip', 5733376, '5151515151515151515151515151515151515151515151515151515151515151', 'repair_failed', 'Repair failed because the stored file could not be copied.', '2026-05-23 16:25:46', '2026-05-23 16:32:12'),
  (@khalid_id, 'photos_backup.rar', 'decoy_012_photos_backup.rar', 'api/uploads/decoy_012_photos_backup.rar', 'RAR', 'application/vnd.rar', 50244, '6262626262626262626262626262626262626262626262626262626262626262', 'clean', 'RAR archive signature was found.', '2026-05-24 09:05:09', '2026-05-24 09:06:01');

SELECT id INTO @f1 FROM files WHERE stored_name = 'decoy_001_quarterly_report.pdf';
SELECT id INTO @f2 FROM files WHERE stored_name = 'decoy_002_image_missing_iend.png';
SELECT id INTO @f3 FROM files WHERE stored_name = 'decoy_003_archive_records.zip';
SELECT id INTO @f4 FROM files WHERE stored_name = 'decoy_004_profile_picture.jpg';
SELECT id INTO @f5 FROM files WHERE stored_name = 'decoy_005_damaged_photo.jpg';
SELECT id INTO @f6 FROM files WHERE stored_name = 'decoy_006_scanned_contract.pdf';
SELECT id INTO @f7 FROM files WHERE stored_name = 'decoy_007_case_archive.rar';
SELECT id INTO @f8 FROM files WHERE stored_name = 'decoy_008_evidence_bundle.7z';
SELECT id INTO @f9 FROM files WHERE stored_name = 'decoy_009_pending_upload.png';
SELECT id INTO @f10 FROM files WHERE stored_name = 'decoy_010_diagram.png';
SELECT id INTO @f11 FROM files WHERE stored_name = 'decoy_011_old_backup.zip';
SELECT id INTO @f12 FROM files WHERE stored_name = 'decoy_012_photos_backup.rar';

INSERT INTO scan_results (file_id, user_id, scan_profile, status, result_status, scanned_count, flagged_count, evidence_summary, created_at)
VALUES
  (@f1, @nora_id, 'quick', 'completed', 'clean', 1, 0, 'PDF trailer and cross-reference structure valid.', '2026-05-19 09:15:08'),
  (@f2, @nora_id, 'full', 'completed', 'suspicious', 1, 1, 'PNG end marker was not found near the end of the file.', '2026-05-19 11:43:02'),
  (@f3, @omar_id, 'full', 'completed', 'corrupted', 1, 1, 'ZIP central directory could not be validated.', '2026-05-20 08:06:18'),
  (@f4, @omar_id, 'quick', 'completed', 'clean', 1, 0, 'JPEG start and end markers found.', '2026-05-20 12:19:02'),
  (@f5, @sara_id, 'full', 'completed', 'corrupted', 1, 1, 'JPEG end marker was missing before repair.', '2026-05-21 10:11:44'),
  (@f6, @sara_id, 'quick', 'completed', 'corrupted', 1, 1, 'PDF EOF marker missing.', '2026-05-21 14:51:31'),
  (@f7, @khalid_id, 'custom', 'completed', 'suspicious', 1, 1, 'RAR archive signature found, but deep archive validation is limited.', '2026-05-22 09:23:15'),
  (@f8, @khalid_id, 'quick', 'completed', 'clean', 1, 0, '7Z archive signature was found.', '2026-05-22 15:41:10'),
  (@f10, @omar_id, 'quick', 'completed', 'clean', 1, 0, 'PNG signature and IEND marker found.', '2026-05-23 10:12:30'),
  (@f11, @sara_id, 'full', 'completed', 'corrupted', 1, 1, 'ZIP central directory could not be validated.', '2026-05-23 16:28:20'),
  (@f12, @khalid_id, 'quick', 'completed', 'clean', 1, 0, 'RAR archive signature was found.', '2026-05-24 09:06:01');

INSERT INTO scan_findings (scan_result_id, file_id, user_id, check_code, severity, evidence, recommendation, raw_details, created_at)
SELECT sr.id, sr.file_id, sr.user_id,
  CASE sr.result_status
    WHEN 'clean' THEN 'structure_valid'
    WHEN 'suspicious' THEN 'structure_warning'
    ELSE 'structure_corrupted'
  END,
  CASE sr.result_status
    WHEN 'clean' THEN 'info'
    WHEN 'suspicious' THEN 'medium'
    ELSE 'high'
  END,
  sr.evidence_summary,
  CASE sr.result_status
    WHEN 'clean' THEN 'No action required.'
    WHEN 'suspicious' THEN 'Review file metadata and rescan with the full profile.'
    ELSE 'Attempt repair or request a clean copy.'
  END,
  JSON_OBJECT('seed', true, 'result_status', sr.result_status),
  sr.created_at
FROM scan_results sr
WHERE sr.file_id IN (@f1, @f2, @f3, @f4, @f5, @f6, @f7, @f8, @f10, @f11, @f12);

INSERT INTO repair_jobs (file_id, user_id, status, message, backup_path, repaired_path, validation_passed, details, created_at, finished_at)
VALUES
  (@f5, @sara_id, 'succeeded', 'JPEG repair added a missing end-of-image marker.', 'api/uploads/decoy_005_damaged_photo.jpg.bak', 'api/repaired/decoy_005_damaged_photo.jpg', 1, JSON_OBJECT('seed', true, 'repair_type', 'jpeg_marker_repair'), '2026-05-21 10:18:02', '2026-05-21 10:21:19'),
  (@f11, @sara_id, 'failed', 'Repair failed because the archive central directory could not be rebuilt.', 'api/uploads/decoy_011_old_backup.zip.bak', NULL, 0, JSON_OBJECT('seed', true, 'repair_type', 'archive_directory_rebuild'), '2026-05-23 16:29:45', '2026-05-23 16:32:12');

INSERT INTO action_logs (user_id, file_id, action, notes, metadata, ip_address, user_agent, created_at)
VALUES
  (@decoy_admin_id, NULL, 'register', 'User account registered.', JSON_OBJECT('seed', true), '127.0.0.1', 'Decoy Seeder', '2026-05-10 09:00:01'),
  (@nora_id, NULL, 'register', 'User account registered.', JSON_OBJECT('seed', true), '127.0.0.1', 'Decoy Seeder', '2026-05-11 10:15:01'),
  (@omar_id, NULL, 'register', 'User account registered.', JSON_OBJECT('seed', true), '127.0.0.1', 'Decoy Seeder', '2026-05-12 11:20:01'),
  (@sara_id, NULL, 'register', 'User account registered.', JSON_OBJECT('seed', true), '127.0.0.1', 'Decoy Seeder', '2026-05-13 12:25:01'),
  (@khalid_id, NULL, 'register', 'User account registered.', JSON_OBJECT('seed', true), '127.0.0.1', 'Decoy Seeder', '2026-05-14 13:30:01'),
  (@nora_id, NULL, 'login', 'User logged in.', JSON_OBJECT('seed', true), '127.0.0.1', 'Decoy Browser', '2026-05-19 09:12:00'),
  (@nora_id, @f1, 'upload', 'Uploaded through the web UI.', JSON_OBJECT('seed', true), '127.0.0.1', 'Decoy Browser', '2026-05-19 09:14:21'),
  (@nora_id, @f1, 'scan', 'Result: Clean.', JSON_OBJECT('seed', true), '127.0.0.1', 'Decoy Browser', '2026-05-19 09:15:08'),
  (@nora_id, @f2, 'upload', 'Uploaded through the web UI.', JSON_OBJECT('seed', true), '127.0.0.1', 'Decoy Browser', '2026-05-19 11:42:10'),
  (@nora_id, @f2, 'scan', 'Result: Suspicious.', JSON_OBJECT('seed', true), '127.0.0.1', 'Decoy Browser', '2026-05-19 11:43:02'),
  (@nora_id, @f1, 'download', 'Downloaded original file.', JSON_OBJECT('seed', true), '127.0.0.1', 'Decoy Browser', '2026-05-19 12:05:50'),
  (@nora_id, NULL, 'logout', 'User logged out.', JSON_OBJECT('seed', true), '127.0.0.1', 'Decoy Browser', '2026-05-19 12:06:20'),
  (@omar_id, NULL, 'login', 'User logged in.', JSON_OBJECT('seed', true), '127.0.0.1', 'Decoy Browser', '2026-05-20 08:01:00'),
  (@omar_id, @f3, 'upload', 'Uploaded through the web UI.', JSON_OBJECT('seed', true), '127.0.0.1', 'Decoy Browser', '2026-05-20 08:05:00'),
  (@omar_id, @f3, 'scan', 'Result: Corrupted.', JSON_OBJECT('seed', true), '127.0.0.1', 'Decoy Browser', '2026-05-20 08:06:18'),
  (@omar_id, @f4, 'upload', 'Uploaded through the web UI.', JSON_OBJECT('seed', true), '127.0.0.1', 'Decoy Browser', '2026-05-20 12:18:37'),
  (@omar_id, @f4, 'scan', 'Result: Clean.', JSON_OBJECT('seed', true), '127.0.0.1', 'Decoy Browser', '2026-05-20 12:19:02'),
  (@sara_id, @f5, 'upload', 'Uploaded through the web UI.', JSON_OBJECT('seed', true), '127.0.0.1', 'Decoy Browser', '2026-05-21 10:10:12'),
  (@sara_id, @f5, 'scan', 'Result: Corrupted.', JSON_OBJECT('seed', true), '127.0.0.1', 'Decoy Browser', '2026-05-21 10:11:44'),
  (@sara_id, @f5, 'repair', 'JPEG repair added a missing end-of-image marker.', JSON_OBJECT('seed', true), '127.0.0.1', 'Decoy Browser', '2026-05-21 10:21:19'),
  (@sara_id, @f6, 'upload', 'Uploaded through the web UI.', JSON_OBJECT('seed', true), '127.0.0.1', 'Decoy Browser', '2026-05-21 14:50:04'),
  (@sara_id, @f6, 'scan', 'Result: Corrupted.', JSON_OBJECT('seed', true), '127.0.0.1', 'Decoy Browser', '2026-05-21 14:51:31'),
  (@khalid_id, @f7, 'upload', 'Uploaded through the web UI.', JSON_OBJECT('seed', true), '127.0.0.1', 'Decoy Browser', '2026-05-22 09:22:33'),
  (@khalid_id, @f7, 'scan', 'Result: Suspicious.', JSON_OBJECT('seed', true), '127.0.0.1', 'Decoy Browser', '2026-05-22 09:23:15'),
  (@khalid_id, @f8, 'upload', 'Uploaded through the web UI.', JSON_OBJECT('seed', true), '127.0.0.1', 'Decoy Browser', '2026-05-22 15:40:44'),
  (@khalid_id, @f8, 'scan', 'Result: Clean.', JSON_OBJECT('seed', true), '127.0.0.1', 'Decoy Browser', '2026-05-22 15:41:10'),
  (@nora_id, @f9, 'upload', 'Uploaded through the web UI.', JSON_OBJECT('seed', true), '127.0.0.1', 'Decoy Browser', '2026-05-23 08:35:02'),
  (@omar_id, @f10, 'upload', 'Uploaded through the web UI.', JSON_OBJECT('seed', true), '127.0.0.1', 'Decoy Browser', '2026-05-23 10:11:59'),
  (@omar_id, @f10, 'scan', 'Result: Clean.', JSON_OBJECT('seed', true), '127.0.0.1', 'Decoy Browser', '2026-05-23 10:12:30'),
  (@sara_id, @f11, 'upload', 'Uploaded through the web UI.', JSON_OBJECT('seed', true), '127.0.0.1', 'Decoy Browser', '2026-05-23 16:25:46'),
  (@sara_id, @f11, 'scan', 'Result: Corrupted.', JSON_OBJECT('seed', true), '127.0.0.1', 'Decoy Browser', '2026-05-23 16:28:20'),
  (@sara_id, @f11, 'repair', 'Repair failed because the archive central directory could not be rebuilt.', JSON_OBJECT('seed', true), '127.0.0.1', 'Decoy Browser', '2026-05-23 16:32:12'),
  (@khalid_id, @f12, 'upload', 'Uploaded through the web UI.', JSON_OBJECT('seed', true), '127.0.0.1', 'Decoy Browser', '2026-05-24 09:05:09'),
  (@khalid_id, @f12, 'scan', 'Result: Clean.', JSON_OBJECT('seed', true), '127.0.0.1', 'Decoy Browser', '2026-05-24 09:06:01'),
  (@khalid_id, NULL, 'settings_update', 'Updated profile and preferences.', JSON_OBJECT('seed', true), '127.0.0.1', 'Decoy Browser', '2026-05-24 09:12:40'),
  (NULL, NULL, 'failed_login', 'Invalid email or password.', JSON_OBJECT('seed', true, 'email_hash', SHA2('unknown@example.test', 256)), '127.0.0.1', 'Decoy Browser', '2026-05-24 09:20:12'),
  (NULL, NULL, 'failed_login', 'Invalid email or password.', JSON_OBJECT('seed', true, 'email_hash', SHA2('nora.decoy@cfdmt.test', 256)), '127.0.0.1', 'Decoy Browser', '2026-05-24 09:22:44'),
  (@nora_id, NULL, 'upload_rejected', 'This file type is not allowed.', JSON_OBJECT('seed', true, 'extension', 'iso'), '127.0.0.1', 'Decoy Browser', '2026-05-24 09:28:19'),
  (@omar_id, NULL, 'upload_rejected', 'Max file size is 50 MB.', JSON_OBJECT('seed', true, 'size', 73400320), '127.0.0.1', 'Decoy Browser', '2026-05-24 09:35:04');

COMMIT;

SET SQL_SAFE_UPDATES = @previous_sql_safe_updates;
