<?php
declare(strict_types=1);

require_once __DIR__ . '/../bootstrap.php';
require_once __DIR__ . '/../lib/app_state.php';

require_method('GET');

$user = require_auth();
json_response(['files' => get_files_for_user($user)]);
