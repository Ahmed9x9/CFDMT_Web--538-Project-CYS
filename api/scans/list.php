<?php
declare(strict_types=1);

require_once __DIR__ . '/../bootstrap.php';

require_method('GET');

$user = require_auth();
$stmt = db()->prepare(
    'SELECT s.*, f.original_name, f.file_type, f.size_bytes
     FROM scan_results s
     JOIN files f ON f.id = s.file_id
     WHERE s.user_id = ?
       AND s.user_hidden_at IS NULL
       AND f.user_hidden_at IS NULL
     ORDER BY s.created_at DESC
     LIMIT 200'
);
$stmt->execute([(int) $user['id']]);

json_response(['scans' => $stmt->fetchAll()]);
