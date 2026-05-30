<?php
declare(strict_types=1);

require_once __DIR__ . '/../bootstrap.php';

require_method('POST');

$user = require_auth();
$data = read_json_body();

$name = clean_string($data['name'] ?? $user['name'], 120);
$theme = clean_string($data['theme'] ?? 'system', 20);
$profile = clean_string($data['defaultScanProfile'] ?? 'full', 10);
$emailNotifications = !empty($data['emailNotifications']) ? 1 : 0;
$defaultUploadAction = clean_string($data['defaultUploadAction'] ?? 'upload_only', 20);
$showExpiredFiles = !empty($data['showExpiredFiles']) ? 1 : 0;
$preferredFileView = clean_string($data['preferredFileView'] ?? 'detailed', 20);
$hideClearedHistory = !empty($data['hideClearedHistory']) ? 1 : 0;

if (strlen($name) < 2) {
    json_response(['error' => 'Full name must be at least 2 characters.'], 422);
}
if (!in_array($theme, ['system', 'light', 'dark'], true)) {
    json_response(['error' => 'Invalid theme.'], 422);
}
if (!in_array($profile, ['quick', 'full', 'custom'], true)) {
    json_response(['error' => 'Invalid scan profile.'], 422);
}
if (!in_array($defaultUploadAction, ['upload_only', 'upload_and_scan'], true)) {
    json_response(['error' => 'Invalid upload action.'], 422);
}
if (!in_array($preferredFileView, ['compact', 'detailed'], true)) {
    json_response(['error' => 'Invalid file table view.'], 422);
}

$pdo = db();
$pdo->beginTransaction();
try {
    $updateUser = $pdo->prepare('UPDATE users SET full_name = ? WHERE id = ?');
    $updateUser->execute([$name, (int) $user['id']]);

    $updateSettings = $pdo->prepare(
        'INSERT INTO user_settings (
            user_id, theme, default_scan_profile, email_notifications,
            default_upload_action, show_expired_files, preferred_file_view, hide_cleared_history
         )
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
            theme = VALUES(theme),
            default_scan_profile = VALUES(default_scan_profile),
            email_notifications = VALUES(email_notifications),
            default_upload_action = VALUES(default_upload_action),
            show_expired_files = VALUES(show_expired_files),
            preferred_file_view = VALUES(preferred_file_view),
            hide_cleared_history = VALUES(hide_cleared_history)'
    );
    $updateSettings->execute([
        (int) $user['id'],
        $theme,
        $profile,
        $emailNotifications,
        $defaultUploadAction,
        $showExpiredFiles,
        $preferredFileView,
        $hideClearedHistory,
    ]);

    add_action_log((int) $user['id'], null, 'settings_update', 'Updated profile and preferences.');
    $pdo->commit();
} catch (Throwable $exception) {
    $pdo->rollBack();
    json_response(['error' => 'Could not save settings.'], 500);
}

json_response(['ok' => true, 'user' => current_user()]);
