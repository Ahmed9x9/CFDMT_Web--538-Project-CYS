<?php
declare(strict_types=1);

require_once __DIR__ . '/../bootstrap.php';

require_method('GET');

$user = current_user();
json_response([
    'authenticated' => $user !== null,
    'user' => $user,
]);
