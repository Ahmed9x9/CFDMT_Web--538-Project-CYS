<?php
declare(strict_types=1);

require_once __DIR__ . '/../bootstrap.php';
require_once __DIR__ . '/../lib/app_state.php';
require_once __DIR__ . '/../lib/file_access.php';
require_once __DIR__ . '/../lib/scan.php';

require_method('POST');

$user = require_auth();
$data = read_json_body();
$fileId = (int) ($data['fileId'] ?? 0);
$profile = clean_string($data['profile'] ?? 'full', 10);
if ($fileId <= 0) {
    json_response(['error' => 'File id is required.'], 422);
}
if (!in_array($profile, ['quick', 'full', 'custom'], true)) {
    json_response(['error' => 'Invalid scan profile.'], 422);
}

$file = require_own_file_for_action($user, $fileId);
if (!is_file((string) $file['storage_path'])) {
    json_response(['error' => 'Stored file is missing.'], 404);
}

$finding = scan_uploaded_file((string) $file['storage_path'], (string) $file['original_name'], $profile);

$pdo = db();
$pdo->beginTransaction();
try {
    $insertScan = $pdo->prepare(
        'INSERT INTO scan_results (file_id, user_id, scan_profile, status, result_status, scanned_count, flagged_count, evidence_summary)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    );
    $insertScan->execute([
        $fileId,
        (int) $file['user_id'],
        $profile,
        'completed',
        $finding['status'],
        (int) ($finding['scanned_count'] ?? 1),
        (int) ($finding['flagged_count'] ?? ($finding['status'] === 'clean' ? 0 : 1)),
        $finding['evidence'],
    ]);
    $scanId = (int) $pdo->lastInsertId();

    $insertFinding = $pdo->prepare(
        'INSERT INTO scan_findings (scan_result_id, file_id, user_id, check_code, severity, evidence, recommendation, raw_details)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    );
    $insertFinding->execute([
        $scanId,
        $fileId,
        (int) $file['user_id'],
        $finding['check_code'],
        $finding['severity'],
        $finding['evidence'],
        $finding['recommendation'],
        json_encode($finding['raw_details'] ?? $finding, JSON_UNESCAPED_UNICODE),
    ]);

    $updateFile = $pdo->prepare('UPDATE files SET status = ?, latest_evidence = ?, file_type = ? WHERE id = ?');
    $updateFile->execute([
        $finding['status'],
        $finding['evidence'],
        !empty($finding['file_type']) ? (string) $finding['file_type'] : (string) $file['file_type'],
        $fileId,
    ]);

    add_action_log((int) $user['id'], $fileId, 'scan', 'Result: ' . status_label($finding['status']) . '.');
    $pdo->commit();
} catch (Throwable $exception) {
    $pdo->rollBack();
    json_response(['error' => 'Could not save scan result.'], 500);
}

$state = app_state_for_user($user);
$updatedFile = null;
foreach ($state['files'] as $clientFile) {
    if ($clientFile['id'] === (string) $fileId) {
        $updatedFile = $clientFile;
        break;
    }
}

json_response(['file' => $updatedFile, 'state' => $state]);
