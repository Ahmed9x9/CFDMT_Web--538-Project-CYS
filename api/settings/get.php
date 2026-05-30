<?php
declare(strict_types=1);

require_once __DIR__ . '/../bootstrap.php';
require_once __DIR__ . '/../lib/policy.php';

require_method('GET');

$user = require_auth();
$stmt = db()->prepare(
    'SELECT theme, default_scan_profile, email_notifications, default_upload_action, show_expired_files, preferred_file_view, hide_cleared_history
     FROM user_settings
     WHERE user_id = ?
     LIMIT 1'
);
$stmt->execute([(int) $user['id']]);
$settings = $stmt->fetch() ?: [
    'theme' => 'system',
    'default_scan_profile' => 'full',
    'email_notifications' => 1,
    'default_upload_action' => 'upload_only',
    'show_expired_files' => 1,
    'preferred_file_view' => 'detailed',
    'hide_cleared_history' => 1,
];

$lastLogin = null;
$lastLoginStmt = db()->prepare(
    "SELECT MAX(created_at)
     FROM action_logs
     WHERE user_id = ?
       AND action = 'login'"
);
$lastLoginStmt->execute([(int) $user['id']]);
$lastLoginValue = $lastLoginStmt->fetchColumn();
if ($lastLoginValue) {
    $lastLogin = (string) $lastLoginValue;
}

$failedLoginStmt = db()->prepare(
    "SELECT COUNT(*)
     FROM action_logs
     WHERE action = 'failed_login'
       AND created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
       AND JSON_UNQUOTE(JSON_EXTRACT(metadata, '$.email_hash')) = ?"
);
$failedLoginStmt->execute([hash('sha256', strtolower((string) $user['email']))]);

json_response([
    'settings' => [
        'theme' => $settings['theme'],
        'defaultScanProfile' => $settings['default_scan_profile'],
        'emailNotifications' => (int) $settings['email_notifications'] === 1,
        'defaultUploadAction' => $settings['default_upload_action'],
        'showExpiredFiles' => (int) $settings['show_expired_files'] === 1,
        'preferredFileView' => $settings['preferred_file_view'],
        'hideClearedHistory' => (int) $settings['hide_cleared_history'] === 1,
    ],
    'security' => [
        'accountStatus' => 'Active',
        'joinedDate' => $user['joined'],
        'lastLoginDate' => $lastLogin,
        'recentFailedLoginCount' => (int) $failedLoginStmt->fetchColumn(),
    ],
    'policy' => get_app_policy(),
    'user' => $user,
]);
