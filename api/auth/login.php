<?php
declare(strict_types=1);

require_once __DIR__ . '/../bootstrap.php';

require_method('POST');

$data = read_json_body();
$email = clean_string($data['email'] ?? '', 190);
$password = (string) ($data['password'] ?? '');

if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    add_action_log(null, null, 'failed_login', 'Invalid email format used for login.', [
        'email_hash' => hash('sha256', strtolower($email)),
    ]);
    json_response(['error' => 'Invalid email or password.'], 401);
}

$email = strtolower($email);
$emailHash = hash('sha256', $email);

$attempts = db()->prepare(
    "SELECT COUNT(*)
     FROM action_logs
     WHERE action = 'failed_login'
       AND created_at >= DATE_SUB(NOW(), INTERVAL 15 MINUTE)
       AND (ip_address = ? OR JSON_UNQUOTE(JSON_EXTRACT(metadata, '$.email_hash')) = ?)"
);
$attempts->execute([request_ip(), $emailHash]);
if ((int) $attempts->fetchColumn() >= 10) {
    json_response(['error' => 'Too many failed login attempts. Try again later.'], 429);
}

if ($password === '') {
    json_response(['error' => 'Password is required.'], 422);
}

$stmt = db()->prepare('SELECT id, full_name, email, password_hash, role, is_active, created_at FROM users WHERE email = ? LIMIT 1');
$stmt->execute([$email]);
$row = $stmt->fetch();

if (!$row || (int) $row['is_active'] !== 1 || !password_verify($password, $row['password_hash'])) {
    add_action_log(null, null, 'failed_login', 'Invalid email or password.', [
        'email_hash' => hash('sha256', $email),
        'matched_account' => (bool) $row,
    ]);
    json_response(['error' => 'Invalid email or password.'], 401);
}

session_regenerate_id(true);
$_SESSION['user_id'] = (int) $row['id'];

add_action_log((int) $row['id'], null, 'login', 'User logged in.');

json_response([
    'ok' => true,
    'user' => [
        'id' => (string) $row['id'],
        'name' => $row['full_name'],
        'email' => $row['email'],
        'role' => $row['role'],
        'joined' => substr((string) $row['created_at'], 0, 10),
    ],
]);
