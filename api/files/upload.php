<?php
declare(strict_types=1);

require_once __DIR__ . '/../bootstrap.php';
require_once __DIR__ . '/../lib/app_state.php';
require_once __DIR__ . '/../lib/policy.php';
require_once __DIR__ . '/../lib/scan.php';

require_method('POST');

$user = require_auth();

function reject_upload(array $user, string $message, int $status = 422, array $metadata = []): void
{
    add_action_log((int) $user['id'], null, 'upload_rejected', $message, $metadata);
    json_response(['error' => $message], $status);
}

if (empty($_FILES['file']) || !is_array($_FILES['file'])) {
    reject_upload($user, 'No file was uploaded.', 400);
}

$upload = $_FILES['file'];
if (($upload['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
    reject_upload($user, 'File upload failed.', 400, ['upload_error' => $upload['error'] ?? null]);
}

$originalName = safe_file_name((string) $upload['name']);
$extension = strtolower(pathinfo($originalName, PATHINFO_EXTENSION));
$policy = get_app_policy();
$allowedExtensions = $policy['allowedExtensions'];
$maxBytes = (int) $policy['maxUploadSizeMb'] * 1024 * 1024;

if (!in_array($extension, $allowedExtensions, true)) {
    reject_upload($user, 'This file type is not allowed.', 422, ['extension' => $extension]);
}
if ((int) $upload['size'] > $maxBytes) {
    reject_upload($user, 'Max file size is ' . $policy['maxUploadSizeMb'] . ' MB.', 422, ['size' => (int) $upload['size']]);
}

$uploadDir = __DIR__ . '/../uploads';
if (!is_dir($uploadDir) && !mkdir($uploadDir, 0750, true)) {
    json_response(['error' => 'Could not prepare upload storage.'], 500);
}

$storedName = bin2hex(random_bytes(16)) . '_' . $originalName;
$targetPath = $uploadDir . '/' . $storedName;
if (!move_uploaded_file((string) $upload['tmp_name'], $targetPath)) {
    json_response(['error' => 'Could not store uploaded file.'], 500);
}

$mimeType = function_exists('mime_content_type') ? (mime_content_type($targetPath) ?: null) : null;
$sha256 = hash_file('sha256', $targetPath);
$scanRequested = $policy['autoScanOnUpload'] || strtolower((string) ($_GET['scan'] ?? 'false')) === 'true';
$scanProfile = clean_string($_GET['profile'] ?? 'full', 10);
if (!in_array($scanProfile, ['quick', 'full', 'custom'], true)) {
    $scanProfile = 'full';
}
$scanFinding = $scanRequested ? scan_uploaded_file($targetPath, $originalName, $scanProfile) : null;
$status = $scanFinding['status'] ?? 'pending';
$evidence = $scanFinding['evidence'] ?? 'Uploaded and waiting for scan.';
$fileType = !empty($scanFinding['file_type']) ? (string) $scanFinding['file_type'] : file_type_from_name($originalName);

$pdo = db();
$pdo->beginTransaction();
try {
    $insertFile = $pdo->prepare(
        'INSERT INTO files (user_id, original_name, stored_name, storage_path, file_type, mime_type, size_bytes, sha256, status, latest_evidence)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    );
    $insertFile->execute([
        (int) $user['id'],
        $originalName,
        $storedName,
        $targetPath,
        $fileType,
        $mimeType,
        (int) $upload['size'],
        $sha256,
        $status,
        $evidence,
    ]);
    $fileId = (int) $pdo->lastInsertId();

    add_action_log((int) $user['id'], $fileId, 'upload', 'Uploaded through the web UI.');

    if ($scanRequested && $scanFinding) {
        $insertScan = $pdo->prepare(
            'INSERT INTO scan_results (file_id, user_id, scan_profile, status, result_status, scanned_count, flagged_count, evidence_summary)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
        );
        $insertScan->execute([
            $fileId,
            (int) $user['id'],
            $scanProfile,
            'completed',
            $scanFinding['status'],
            (int) ($scanFinding['scanned_count'] ?? 1),
            (int) ($scanFinding['flagged_count'] ?? ($scanFinding['status'] === 'clean' ? 0 : 1)),
            $scanFinding['evidence'],
        ]);
        $scanId = (int) $pdo->lastInsertId();

        $insertFinding = $pdo->prepare(
            'INSERT INTO scan_findings (scan_result_id, file_id, user_id, check_code, severity, evidence, recommendation, raw_details)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
        );
        $insertFinding->execute([
            $scanId,
            $fileId,
            (int) $user['id'],
            $scanFinding['check_code'],
            $scanFinding['severity'],
            $scanFinding['evidence'],
            $scanFinding['recommendation'],
            json_encode($scanFinding['raw_details'] ?? $scanFinding, JSON_UNESCAPED_UNICODE),
        ]);

        add_action_log((int) $user['id'], $fileId, 'scan', 'Result: ' . status_label($scanFinding['status']) . '.');
    }

    $pdo->commit();
} catch (Throwable $exception) {
    $pdo->rollBack();
    @unlink($targetPath);
    json_response(['error' => 'Could not save upload metadata.'], 500);
}

$state = app_state_for_user($user);
$createdFile = null;
foreach ($state['files'] as $clientFile) {
    if ($clientFile['id'] === (string) $fileId) {
        $createdFile = $clientFile;
        break;
    }
}

json_response([
    'file' => $createdFile,
    'state' => $state,
]);
