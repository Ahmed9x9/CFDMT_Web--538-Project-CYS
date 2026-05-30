<?php
declare(strict_types=1);

require_once __DIR__ . '/../bootstrap.php';

require_method('POST');

$admin = require_admin();
$data = read_json_body();
$action = clean_string($data['action'] ?? '', 40);
$days = max(0, min(3650, (int) ($data['days'] ?? 30)));

if (!in_array($action, ['archive_logs', 'clear_failed_jobs'], true)) {
    json_response(['error' => 'Invalid maintenance action.'], 422);
}

$pdo = db();
$cutoff = date('Y-m-d H:i:s', time() - ($days * 86400));

if ($action === 'archive_logs') {
    $stmt = $pdo->prepare(
        'UPDATE action_logs
         SET archived_at = NOW()
         WHERE archived_at IS NULL
           AND created_at < ?'
    );
    $stmt->execute([$cutoff]);
    $count = $stmt->rowCount();
    add_action_log((int) $admin['id'], null, 'archive_logs', "Archived {$count} old action logs.", ['days' => $days]);
    json_response(['ok' => true, 'message' => "Archived {$count} old action logs."]);
}

$stmt = $pdo->prepare(
    "DELETE FROM repair_jobs
     WHERE status = 'failed'
       AND created_at < ?"
);
$stmt->execute([$cutoff]);
$count = $stmt->rowCount();
add_action_log((int) $admin['id'], null, 'clear_failed_jobs', "Cleared {$count} old failed repair jobs.", ['days' => $days]);

json_response(['ok' => true, 'message' => "Cleared {$count} old failed repair jobs."]);
