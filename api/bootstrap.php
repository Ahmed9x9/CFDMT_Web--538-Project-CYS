<?php
declare(strict_types=1);

ini_set('display_errors', '0');
error_reporting(E_ALL);

$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
$allowedOrigins = [
    'http://127.0.0.1:8080',
    'http://localhost:8080',
    'http://127.0.0.1:5173',
    'http://localhost:5173',
];
if (in_array($origin, $allowedOrigins, true)) {
    header('Access-Control-Allow-Origin: ' . $origin);
    header('Access-Control-Allow-Credentials: true');
}
header('Access-Control-Allow-Headers: Content-Type');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

$secureCookie = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off');
session_set_cookie_params([
    'lifetime' => 0,
    'path' => '/',
    'secure' => $secureCookie,
    'httponly' => true,
    'samesite' => 'Lax',
]);
session_start();

require_once __DIR__ . '/db.php';

function json_response(array $payload, int $status = 200): void
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($payload, JSON_UNESCAPED_UNICODE);
    exit;
}

function require_method(string $method): void
{
    if ($_SERVER['REQUEST_METHOD'] !== $method) {
        json_response(['error' => 'Method not allowed.'], 405);
    }
}

function read_json_body(): array
{
    $raw = file_get_contents('php://input') ?: '';
    if ($raw === '') {
        return [];
    }
    $decoded = json_decode($raw, true);
    if (!is_array($decoded)) {
        json_response(['error' => 'Invalid JSON body.'], 400);
    }
    return $decoded;
}

function clean_string(mixed $value, int $maxLength = 255): string
{
    $value = trim((string) $value);
    $value = preg_replace('/[\x00-\x1F\x7F]/u', '', $value) ?? '';
    return substr($value, 0, $maxLength);
}

function current_user(): ?array
{
    if (empty($_SESSION['user_id'])) {
        return null;
    }

    $stmt = db()->prepare('SELECT id, full_name, email, role, is_active, created_at FROM users WHERE id = ? LIMIT 1');
    $stmt->execute([(int) $_SESSION['user_id']]);
    $user = $stmt->fetch();
    if (!$user || (int) $user['is_active'] !== 1) {
        $_SESSION = [];
        session_destroy();
        return null;
    }

    return [
        'id' => (string) $user['id'],
        'name' => $user['full_name'],
        'email' => $user['email'],
        'role' => $user['role'],
        'joined' => substr((string) $user['created_at'], 0, 10),
    ];
}

function require_auth(): array
{
    $user = current_user();
    if (!$user) {
        json_response(['error' => 'Authentication required.'], 401);
    }
    return $user;
}

function require_admin(): array
{
    $user = require_auth();
    if ($user['role'] !== 'admin') {
        json_response(['error' => 'Admin access required.'], 403);
    }
    return $user;
}

function validate_email_address(string $email): string
{
    $email = clean_string($email, 190);
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        json_response(['error' => 'A valid email address is required.'], 422);
    }
    return strtolower($email);
}

function request_ip(): string
{
    return clean_string($_SERVER['REMOTE_ADDR'] ?? '', 45);
}

function request_user_agent(): string
{
    return clean_string($_SERVER['HTTP_USER_AGENT'] ?? '', 255);
}

function add_action_log(?int $userId, ?int $fileId, string $action, string $notes = '', array $metadata = []): void
{
    try {
        $stmt = db()->prepare(
            'INSERT INTO action_logs (user_id, file_id, action, notes, metadata, ip_address, user_agent)
             VALUES (?, ?, ?, ?, ?, ?, ?)'
        );
        $stmt->execute([
            $userId,
            $fileId,
            $action,
            $notes,
            $metadata ? json_encode($metadata, JSON_UNESCAPED_UNICODE) : null,
            request_ip(),
            request_user_agent(),
        ]);
    } catch (Throwable $exception) {
        error_log('Action log failed: ' . $exception->getMessage());
    }
}

function safe_file_name(string $name): string
{
    $name = basename($name);
    $name = preg_replace('/[^A-Za-z0-9._-]/', '_', $name) ?? 'uploaded_file';
    $name = trim($name, '._');
    return $name !== '' ? substr($name, 0, 180) : 'uploaded_file';
}

function format_size(int $bytes): string
{
    $units = ['B', 'KB', 'MB', 'GB'];
    $size = max(0, $bytes);
    $unit = 'B';
    foreach ($units as $unit) {
        if ($size < 1024 || $unit === 'GB') {
            break;
        }
        $size /= 1024;
    }
    return $unit === 'B' ? ((string) (int) $size) . ' B' : number_format((float) $size, 1) . ' ' . $unit;
}

function status_label(string $status): string
{
    return match ($status) {
        'pending' => 'Pending',
        'clean' => 'Clean',
        'suspicious' => 'Suspicious',
        'corrupted' => 'Corrupted',
        'repaired' => 'Repaired',
        'repair_failed' => 'Corrupted',
        default => 'Pending',
    };
}

function file_type_from_name(string $name): string
{
    $extension = pathinfo($name, PATHINFO_EXTENSION);
    return $extension !== '' ? strtoupper($extension) : 'UNKNOWN';
}
if ($_SERVER['REQUEST_METHOD'] === 'POST' && ($_SERVER['HTTP_X_CFDMT_REQUEST'] ?? '') !== 'fetch') {
    json_response(['error' => 'Request header is required.'], 403);
}