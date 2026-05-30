<?php
declare(strict_types=1);

require_once __DIR__ . '/../bootstrap.php';
require_once __DIR__ . '/../lib/app_state.php';
require_once __DIR__ . '/../lib/file_access.php';
require_once __DIR__ . '/../lib/python_engine.php';

require_method('POST');

$user = require_auth();
$data = read_json_body();
$fileId = (int) ($data['fileId'] ?? 0);
if ($fileId <= 0) {
    json_response(['error' => 'File id is required.'], 422);
}

$file = require_own_file_for_action($user, $fileId);

$currentStatus = (string) $file['status'];
if (!in_array($currentStatus, ['suspicious', 'corrupted', 'repair_failed'], true)) {
    json_response(['error' => 'Only suspicious or corrupted files can be repaired.'], 422);
}

$sourcePath = (string) $file['storage_path'];
if (!is_file($sourcePath)) {
    json_response(['error' => 'Stored file is missing.'], 404);
}

$engineRepair = python_engine_repair_file($sourcePath);
if ($engineRepair === null) {
    json_response(['error' => 'Python repair engine is unavailable. Make sure the FastAPI engine is running and try again.'], 503);
}

$success = !empty($engineRepair['success']);
$status = $success ? 'succeeded' : 'failed';
$message = clean_string($engineRepair['message'] ?? ($success ? 'Repair completed.' : 'Repair failed.'), 4000);
$repairedPath = clean_string($engineRepair['repaired_path'] ?? $sourcePath, 500);
$backupPath = clean_string($engineRepair['backup_path'] ?? '', 500);
$details = [
    'engine' => 'python',
    'response' => $engineRepair,
];
$validationPassed = !empty($engineRepair['validation_passed']);

$finalStoragePath = $success && $repairedPath !== '' && is_file($repairedPath) ? $repairedPath : $sourcePath;
$finalStoredName = basename($finalStoragePath);
$finalSha256 = is_file($finalStoragePath) ? (hash_file('sha256', $finalStoragePath) ?: (string) ($engineRepair['sha256'] ?? $file['sha256'])) : (string) $file['sha256'];
$finalSize = is_file($finalStoragePath) ? (int) filesize($finalStoragePath) : (int) $file['size_bytes'];
$finalType = !empty($engineRepair['file_type']) ? clean_string($engineRepair['file_type'], 30) : file_type_from_name($finalStoredName);

$pdo = db();
$pdo->beginTransaction();
try {
    $insert = $pdo->prepare(
        'INSERT INTO repair_jobs (file_id, user_id, status, message, backup_path, repaired_path, validation_passed, details, finished_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())'
    );
    $insert->execute([
        $fileId,
        (int) $file['user_id'],
        $status,
        $message,
        $backupPath !== '' ? $backupPath : null,
        $success ? $finalStoragePath : null,
        $validationPassed ? 1 : 0,
        json_encode($details, JSON_UNESCAPED_UNICODE),
    ]);

    $updateStatus = $pdo->prepare(
        'UPDATE files
         SET status = ?, latest_evidence = ?, storage_path = ?, stored_name = ?, file_type = ?, size_bytes = ?, sha256 = ?
         WHERE id = ?'
    );
    $updateStatus->execute([
        $success ? 'repaired' : 'repair_failed',
        $message,
        $finalStoragePath,
        $finalStoredName,
        $finalType,
        $finalSize,
        $finalSha256,
        $fileId,
    ]);

    add_action_log((int) $user['id'], $fileId, 'repair', $message, ['engine' => 'python', 'success' => $success]);
    $pdo->commit();
} catch (Throwable $exception) {
    $pdo->rollBack();
    json_response(['error' => 'Could not record repair job.'], 500);
}

$state = app_state_for_user($user);
$updatedFile = null;
foreach ($state['files'] as $clientFile) {
    if ($clientFile['id'] === (string) $fileId) {
        $updatedFile = $clientFile;
        break;
    }
}

json_response([
    'file' => $updatedFile,
    'repair' => ['success' => $success, 'message' => $message],
    'state' => $state,
]);
