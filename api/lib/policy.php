<?php
declare(strict_types=1);

function default_policy_settings(): array
{
    return [
        'allowedExtensions' => supported_file_extensions(),
        'maxUploadSizeMb' => 50,
        'autoScanOnUpload' => false,
        'fileAccessWindowSeconds' => 86400,
    ];
}

function supported_file_extensions(): array
{
    return ['png', 'jpg', 'jpeg', 'pdf', 'zip', 'rar', '7z'];
}

function file_access_window_options(): array
{
    return [
        300 => '5 minutes',
        86400 => '24 hours',
        259200 => '3 days',
    ];
}

function normalize_file_access_window(mixed $value): int
{
    $seconds = (int) $value;
    return array_key_exists($seconds, file_access_window_options()) ? $seconds : 86400;
}

function file_access_window_label(int $seconds): string
{
    $options = file_access_window_options();
    return $options[$seconds] ?? $options[86400];
}

function normalize_extensions(mixed $value): array
{
    $raw = is_array($value) ? implode(',', $value) : (string) $value;
    $parts = preg_split('/[\s,]+/', strtolower($raw)) ?: [];
    $extensions = [];
    foreach ($parts as $extension) {
        $extension = trim($extension, " .\t\n\r\0\x0B");
        if ($extension === '') {
            continue;
        }
        if (!preg_match('/^[a-z0-9]{1,12}$/', $extension)) {
            json_response(['error' => 'Allowed extensions must be letters or numbers only.'], 422);
        }
        $extensions[$extension] = true;
    }

    if (!$extensions) {
        json_response(['error' => 'At least one allowed extension is required.'], 422);
    }

    return array_values(array_intersect(array_keys($extensions), supported_file_extensions()));
}

function app_settings_map(): array
{
    try {
        $stmt = db()->prepare('SELECT setting_key, setting_value FROM app_settings');
        $stmt->execute();
        $settings = [];
        foreach ($stmt->fetchAll() as $row) {
            $settings[(string) $row['setting_key']] = (string) $row['setting_value'];
        }
        return $settings;
    } catch (Throwable $exception) {
        return [];
    }
}

function get_app_policy(): array
{
    $defaults = default_policy_settings();
    $settings = app_settings_map();
    $allowed = $settings['allowed_extensions'] ?? implode(',', $defaults['allowedExtensions']);
    $allowedExtensions = normalize_extensions($allowed);
    if (!$allowedExtensions) {
        $allowedExtensions = $defaults['allowedExtensions'];
    }
    $maxMb = (int) ($settings['max_upload_size_mb'] ?? $defaults['maxUploadSizeMb']);
    $autoScan = strtolower((string) ($settings['auto_scan_on_upload'] ?? 'false')) === 'true';
    $fileAccessWindowSeconds = normalize_file_access_window(
        $settings['file_access_window_seconds'] ?? $defaults['fileAccessWindowSeconds']
    );

    return [
        'allowedExtensions' => $allowedExtensions,
        'maxUploadSizeMb' => max(1, min(200, $maxMb)),
        'autoScanOnUpload' => $autoScan,
        'fileAccessWindowSeconds' => $fileAccessWindowSeconds,
        'fileAccessWindowLabel' => file_access_window_label($fileAccessWindowSeconds),
    ];
}

function save_app_policy(array $policy, int $adminId): array
{
    $allowedExtensions = normalize_extensions($policy['allowedExtensions'] ?? '');
    $maxUploadSizeMb = (int) ($policy['maxUploadSizeMb'] ?? 0);
    $autoScanOnUpload = !empty($policy['autoScanOnUpload']);
    $fileAccessWindowSeconds = normalize_file_access_window($policy['fileAccessWindowSeconds'] ?? 86400);

    if ($maxUploadSizeMb < 1 || $maxUploadSizeMb > 200) {
        json_response(['error' => 'Max upload size must be between 1 and 200 MB.'], 422);
    }

    if (!$allowedExtensions) {
        json_response(['error' => 'Allowed extensions must include at least one supported type.'], 422);
    }

    $stmt = db()->prepare(
        'INSERT INTO app_settings (setting_key, setting_value, updated_by)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value), updated_by = VALUES(updated_by)'
    );
    $stmt->execute(['allowed_extensions', implode(',', $allowedExtensions), $adminId]);
    $stmt->execute(['max_upload_size_mb', (string) $maxUploadSizeMb, $adminId]);
    $stmt->execute(['auto_scan_on_upload', $autoScanOnUpload ? 'true' : 'false', $adminId]);
    $stmt->execute(['file_access_window_seconds', (string) $fileAccessWindowSeconds, $adminId]);

    return [
        'allowedExtensions' => $allowedExtensions,
        'maxUploadSizeMb' => $maxUploadSizeMb,
        'autoScanOnUpload' => $autoScanOnUpload,
        'fileAccessWindowSeconds' => $fileAccessWindowSeconds,
        'fileAccessWindowLabel' => file_access_window_label($fileAccessWindowSeconds),
    ];
}
