<?php
declare(strict_types=1);

require_once __DIR__ . '/../bootstrap.php';

require_method('POST');

$data = read_json_body();
$name = clean_string($data['name'] ?? '', 120);
$email = validate_email_address((string) ($data['email'] ?? ''));
$password = (string) ($data['password'] ?? '');
$confirm = (string) ($data['confirmPassword'] ?? $data['confirm'] ?? '');

if (strlen($name) < 2) {
    json_response(['error' => 'Full name must be at least 2 characters.'], 422);
}
if (strlen($password) < 8) {
    json_response(['error' => 'Password must be at least 8 characters.'], 422);
}
if ($password !== $confirm) {
    json_response(['error' => 'Password confirmation does not match.'], 422);
}

$pdo = db();
$exists = $pdo->prepare('SELECT id FROM users WHERE email = ? LIMIT 1');
$exists->execute([$email]);
if ($exists->fetch()) {
    json_response(['error' => 'An account with this email already exists.'], 409);
}

$hash = password_hash($password, PASSWORD_DEFAULT);
$pdo->beginTransaction();
try {
    $stmt = $pdo->prepare('INSERT INTO users (full_name, email, password_hash, role) VALUES (?, ?, ?, ?)');
    $stmt->execute([$name, $email, $hash, 'user']);
    $userId = (int) $pdo->lastInsertId();

    $settings = $pdo->prepare('INSERT INTO user_settings (user_id) VALUES (?)');
    $settings->execute([$userId]);

    add_action_log($userId, null, 'register', 'User account registered.');
    $pdo->commit();
} catch (Throwable $exception) {
    $pdo->rollBack();
    json_response(['error' => 'Registration failed.'], 500);
}

json_response(['ok' => true, 'message' => 'Account registered. You can now log in.']);
