<?php
declare(strict_types=1);

require_once __DIR__ . '/policy.php';

function file_access_window_seconds(): int
{
    static $seconds = null;
    if ($seconds === null) {
        $seconds = (int) get_app_policy()['fileAccessWindowSeconds'];
    }
    return $seconds;
}

function file_access_expires_timestamp(array $file): int
{
    $uploadedAt = strtotime((string) ($file['uploaded_at'] ?? ''));
    if ($uploadedAt === false) {
        return time();
    }

    return $uploadedAt + file_access_window_seconds();
}

function file_access_expires_at(array $file): string
{
    return date('c', file_access_expires_timestamp($file));
}

function file_action_access_expired(array $file): bool
{
    return time() > file_access_expires_timestamp($file);
}

function require_own_file_for_action(array $user, int $fileId): array
{
    $stmt = db()->prepare(
        'SELECT *
         FROM files
         WHERE id = ?
           AND user_id = ?
           AND deleted_at IS NULL
           AND user_hidden_at IS NULL
         LIMIT 1'
    );
    $stmt->execute([$fileId, (int) $user['id']]);
    $file = $stmt->fetch();
    if (!$file) {
        json_response(['error' => 'File not found.'], 404);
    }

    if (file_action_access_expired($file)) {
        json_response(['error' => 'File actions and downloads expire ' . file_access_window_label(file_access_window_seconds()) . ' after upload.'], 403);
    }

    return $file;
}
