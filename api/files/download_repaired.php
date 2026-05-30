<?php
declare(strict_types=1);

require_once __DIR__ . '/../bootstrap.php';
require_once __DIR__ . '/../lib/download_tokens.php';
require_once __DIR__ . '/../lib/file_access.php';

require_method('GET');

$user = require_auth();
$token = clean_string($_GET['token'] ?? '', 4000);
$payload = verify_download_payload($token);
if ($payload === null || ($payload['kind'] ?? '') !== 'repair') {
    json_response(['error' => 'Download link is invalid or expired.'], 403);
}

$repairId = (int) ($payload['repair_id'] ?? 0);
$fileId = (int) ($payload['file_id'] ?? 0);
$tokenUserId = (int) ($payload['user_id'] ?? 0);
$path = (string) ($payload['path'] ?? '');

if ($repairId <= 0 || $fileId <= 0 || $tokenUserId !== (int) $user['id'] || $path === '') {
    json_response(['error' => 'Download link is invalid.'], 403);
}

$file = require_own_file_for_action($user, $fileId);

$stmt = db()->prepare(
    "SELECT r.*, f.original_name
     FROM repair_jobs r
     JOIN files f ON f.id = r.file_id
     WHERE r.id = ?
       AND r.file_id = ?
       AND r.user_id = ?
       AND r.status = 'succeeded'
       AND r.repaired_path = ?
     LIMIT 1"
);
$stmt->execute([$repairId, $fileId, (int) $user['id'], $path]);
$repair = $stmt->fetch();
if (!$repair) {
    json_response(['error' => 'Repaired file is no longer available.'], 404);
}

if (!is_file($path)) {
    json_response(['error' => 'Repaired file is missing.'], 404);
}

add_action_log((int) $user['id'], $fileId, 'download', 'Downloaded repaired file.');

$downloadName = basename((string) ($file['original_name'] ?: $path));
header('Content-Type: application/octet-stream');
header('X-Content-Type-Options: nosniff');
header('Cache-Control: no-store, private');
header('Content-Length: ' . filesize($path));
header('Content-Disposition: attachment; filename="' . addslashes($downloadName) . '"');
readfile($path);
exit;
