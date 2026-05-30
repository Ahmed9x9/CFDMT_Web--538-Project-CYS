<?php
declare(strict_types=1);

require_once __DIR__ . '/../bootstrap.php';
require_once __DIR__ . '/../lib/file_access.php';

require_method('GET');

$user = require_auth();
$fileId = (int) ($_GET['id'] ?? 0);
if ($fileId <= 0) {
    json_response(['error' => 'File id is required.'], 422);
}

$file = require_own_file_for_action($user, $fileId);

$path = (string) $file['storage_path'];
if (!is_file($path)) {
    json_response(['error' => 'Stored file is missing.'], 404);
}

add_action_log((int) $user['id'], $fileId, 'download', 'Downloaded original file.');

header('Content-Type: application/octet-stream');
header('X-Content-Type-Options: nosniff');
header('Cache-Control: no-store, private');
header('Content-Length: ' . filesize($path));
header('Content-Disposition: attachment; filename="' . addslashes((string) $file['original_name']) . '"');
readfile($path);
exit;
