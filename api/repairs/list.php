<?php
declare(strict_types=1);

require_once __DIR__ . '/../bootstrap.php';

require_method('GET');

$user = require_auth();
$stmt = db()->prepare(
    'SELECT r.*, f.original_name, f.file_type
     FROM repair_jobs r
     JOIN files f ON f.id = r.file_id
     WHERE r.user_id = ?
       AND r.user_hidden_at IS NULL
       AND f.user_hidden_at IS NULL
     ORDER BY r.created_at DESC
     LIMIT 200'
);
$stmt->execute([(int) $user['id']]);

json_response(['repairs' => $stmt->fetchAll()]);
