<?php
declare(strict_types=1);

require_once __DIR__ . '/../bootstrap.php';
require_once __DIR__ . '/../lib/policy.php';

require_method('POST');

$admin = require_admin();
$data = read_json_body();
$policy = save_app_policy($data, (int) $admin['id']);

add_action_log((int) $admin['id'], null, 'policy_update', 'Admin updated file upload policy.', [
    'allowed_extensions' => $policy['allowedExtensions'],
    'max_upload_size_mb' => $policy['maxUploadSizeMb'],
    'auto_scan_on_upload' => $policy['autoScanOnUpload'],
    'file_access_window_seconds' => $policy['fileAccessWindowSeconds'],
]);

json_response(['ok' => true, 'policies' => $policy]);
