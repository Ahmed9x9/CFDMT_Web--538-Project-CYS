<?php
declare(strict_types=1);

require_once __DIR__ . '/../bootstrap.php';
require_once __DIR__ . '/../lib/app_state.php';

require_method('GET');

$user = require_admin();
json_response(admin_state_for_page($user));
