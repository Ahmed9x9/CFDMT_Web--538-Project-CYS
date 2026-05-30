<?php
declare(strict_types=1);

require_once __DIR__ . '/../bootstrap.php';

require_method('GET');

$user = require_auth();
$stmt = db()->prepare(
    "SELECT a.created_at, COALESCE(f.original_name, 'System') AS file_name, COALESCE(f.file_type, '-') AS file_type,
            COALESCE(f.status, '-') AS file_status, a.action, COALESCE(a.notes, '') AS notes
     FROM action_logs a
     LEFT JOIN files f ON f.id = a.file_id
     WHERE a.user_id = ?
       AND a.archived_at IS NULL
       AND a.user_hidden_at IS NULL
       AND a.action NOT IN ('register', 'login', 'logout')
     ORDER BY a.created_at DESC"
);
$stmt->execute([(int) $user['id']]);

add_action_log((int) $user['id'], null, 'settings_update', 'Downloaded account activity CSV.');

header('Content-Type: text/csv; charset=utf-8');
header('Content-Disposition: attachment; filename="account_activity.csv"');

$output = fopen('php://output', 'w');
if ($output === false) {
    exit;
}

fputcsv($output, ['date', 'file', 'file_type', 'file_status', 'action', 'notes']);
foreach ($stmt->fetchAll() as $row) {
    fputcsv($output, [
        $row['created_at'],
        $row['file_name'],
        $row['file_type'],
        $row['file_status'],
        str_replace('_', ' ', (string) $row['action']),
        $row['notes'],
    ]);
}

fclose($output);
exit;
