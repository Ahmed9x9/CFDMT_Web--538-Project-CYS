<?php
declare(strict_types=1);

require_once __DIR__ . '/../bootstrap.php';
require_once __DIR__ . '/../lib/app_state.php';

require_method('POST');

$user = require_auth();
$data = read_json_body();
$fileId = (int) ($data['fileId'] ?? 0);
if ($fileId <= 0) {
    json_response(['error' => 'File id is required.'], 422);
}

$pdo = db();
$pdo->beginTransaction();
try {
    $select = $pdo->prepare(
        'SELECT id, original_name
         FROM files
         WHERE id = ?
           AND user_id = ?
           AND deleted_at IS NULL
           AND user_hidden_at IS NULL
         LIMIT 1
         FOR UPDATE'
    );
    $select->execute([$fileId, (int) $user['id']]);
    $file = $select->fetch();
    if (!$file) {
        $pdo->rollBack();
        json_response(['error' => 'File not found.'], 404);
    }

    $hideFile = $pdo->prepare(
        'UPDATE files
         SET deleted_at = NOW(), user_hidden_at = NOW()
         WHERE id = ?
           AND user_id = ?
           AND user_hidden_at IS NULL'
    );
    $hideFile->execute([$fileId, (int) $user['id']]);

    $hideScans = $pdo->prepare(
        'UPDATE scan_results
         SET user_hidden_at = NOW()
         WHERE file_id = ?
           AND user_id = ?
           AND user_hidden_at IS NULL'
    );
    $hideScans->execute([$fileId, (int) $user['id']]);

    $hideRepairs = $pdo->prepare(
        'UPDATE repair_jobs
         SET user_hidden_at = NOW()
         WHERE file_id = ?
           AND user_id = ?
           AND user_hidden_at IS NULL'
    );
    $hideRepairs->execute([$fileId, (int) $user['id']]);

    $hideActions = $pdo->prepare(
        'UPDATE action_logs
         SET user_hidden_at = NOW()
         WHERE file_id = ?
           AND user_id = ?
           AND user_hidden_at IS NULL'
    );
    $hideActions->execute([$fileId, (int) $user['id']]);

    $log = $pdo->prepare(
        'INSERT INTO action_logs (user_id, file_id, action, notes, metadata, ip_address, user_agent, user_hidden_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, NOW())'
    );
    $log->execute([
        (int) $user['id'],
        $fileId,
        'delete',
        'Deleted file from visible pages.',
        json_encode(['visible_delete' => true], JSON_UNESCAPED_UNICODE),
        request_ip(),
        request_user_agent(),
    ]);

    $pdo->commit();
} catch (Throwable $exception) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    json_response(['error' => 'Could not delete file.'], 500);
}

json_response([
    'ok' => true,
    'state' => app_state_for_user($user),
]);