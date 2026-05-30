<?php
declare(strict_types=1);

require_once __DIR__ . '/../bootstrap.php';

require_method('POST');

$admin = require_admin();
$data = read_json_body();
$targetUserId = (int) ($data['userId'] ?? 0);
$role = clean_string($data['role'] ?? '', 20);
$isActive = array_key_exists('isActive', $data) ? (bool) $data['isActive'] : null;

if ($targetUserId <= 0) {
    json_response(['error' => 'User id is required.'], 422);
}
if ($targetUserId === (int) $admin['id']) {
    json_response(['error' => 'Admins cannot change their own role or active status here.'], 422);
}
if (!in_array($role, ['user', 'admin'], true)) {
    json_response(['error' => 'Invalid role.'], 422);
}
if ($isActive === null) {
    json_response(['error' => 'Active status is required.'], 422);
}

$stmt = db()->prepare('SELECT id, role, is_active FROM users WHERE id = ? LIMIT 1');
$stmt->execute([$targetUserId]);
$targetUser = $stmt->fetch();
if (!$targetUser) {
    json_response(['error' => 'User not found.'], 404);
}

$update = db()->prepare('UPDATE users SET role = ?, is_active = ? WHERE id = ?');
$update->execute([$role, $isActive ? 1 : 0, $targetUserId]);

$noteParts = [];
if ((string) $targetUser['role'] !== $role) {
    $noteParts[] = $role === 'admin'
        ? 'Promoted a user account to admin.'
        : 'Demoted an admin account to user.';
}
if (((int) $targetUser['is_active'] === 1) !== $isActive) {
    $noteParts[] = $isActive
        ? 'Activated the account.'
        : 'Deactivated the account.';
}
$note = $noteParts ? implode(' ', $noteParts) : 'Admin updated a user account.';

add_action_log((int) $admin['id'], null, 'user_update', $note, [
    'target_user_hash' => hash('sha256', (string) $targetUserId),
    'previous_role' => $targetUser['role'],
    'role' => $role,
    'previous_is_active' => (int) $targetUser['is_active'] === 1,
    'is_active' => $isActive,
]);

json_response(['ok' => true]);
