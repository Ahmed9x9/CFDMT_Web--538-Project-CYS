<?php
declare(strict_types=1);

require_once __DIR__ . '/../bootstrap.php';

require_method('POST');

$user = require_auth();
$data = read_json_body();

$currentPassword = (string) ($data['currentPassword'] ?? '');
$newPassword = (string) ($data['newPassword'] ?? '');
$confirmPassword = (string) ($data['confirmPassword'] ?? '');

if ($currentPassword === '') {
    json_response(['error' => 'Current password is required.'], 422);
}
if (strlen($newPassword) < 8) {
    json_response(['error' => 'New password must be at least 8 characters.'], 422);
}
if ($newPassword !== $confirmPassword) {
    json_response(['error' => 'New passwords do not match.'], 422);
}

$stmt = db()->prepare('SELECT password_hash FROM users WHERE id = ? LIMIT 1');
$stmt->execute([(int) $user['id']]);
$hash = $stmt->fetchColumn();
if (!$hash || !password_verify($currentPassword, (string) $hash)) {
    json_response(['error' => 'Current password is incorrect.'], 422);
}

$update = db()->prepare('UPDATE users SET password_hash = ? WHERE id = ?');
$update->execute([password_hash($newPassword, PASSWORD_DEFAULT), (int) $user['id']]);

add_action_log((int) $user['id'], null, 'settings_update', 'Password changed.');

json_response(['ok' => true]);
