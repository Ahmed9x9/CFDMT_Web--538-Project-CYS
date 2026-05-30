<?php
declare(strict_types=1);

require_once __DIR__ . '/../bootstrap.php';

$admin = require_admin();
add_action_log((int) $admin['id'], null, 'export_audit', 'Admin exported anonymized audit report.');

$stmt = db()->prepare(
    "SELECT a.created_at, a.action, a.notes, f.file_type, f.status AS file_status
     FROM action_logs a
     LEFT JOIN files f ON f.id = a.file_id
     ORDER BY a.created_at DESC
     LIMIT 1000"
);
$stmt->execute();

header('Content-Type: text/csv; charset=utf-8');
header('Content-Disposition: attachment; filename="cfdmt_anonymized_audit.csv"');

$output = fopen('php://output', 'w');
fputcsv($output, ['date', 'action', 'file_type', 'file_status', 'notes']);
foreach ($stmt->fetchAll() as $row) {
    fputcsv($output, [
        substr((string) $row['created_at'], 0, 10),
        (string) $row['action'],
        $row['file_type'] ?: '-',
        $row['file_status'] ?: '-',
        $row['notes'] ?: '',
    ]);
}
fclose($output);
exit;

