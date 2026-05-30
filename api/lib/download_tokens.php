<?php
declare(strict_types=1);

function download_token_secret(): string
{
    return getenv('CFDMT_DOWNLOAD_SECRET') ?: 'cfdmt-web-dev-download-secret-change-in-production';
}

function base64url_encode(string $value): string
{
    return rtrim(strtr(base64_encode($value), '+/', '-_'), '=');
}

function base64url_decode(string $value): ?string
{
    $decoded = base64_decode(strtr($value, '-_', '+/') . str_repeat('=', (4 - strlen($value) % 4) % 4), true);
    return $decoded === false ? null : $decoded;
}

function sign_download_payload(array $payload): string
{
    $body = json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if ($body === false) {
        $body = '{}';
    }
    $signature = hash_hmac('sha256', $body, download_token_secret());
    return base64url_encode($body . '|' . $signature);
}

function verify_download_payload(string $token): ?array
{
    $raw = base64url_decode($token);
    if ($raw === null || !str_contains($raw, '|')) {
        return null;
    }

    [$body, $signature] = explode('|', $raw, 2);
    $expected = hash_hmac('sha256', $body, download_token_secret());
    if (!hash_equals($expected, $signature)) {
        return null;
    }

    $payload = json_decode($body, true);
    if (!is_array($payload)) {
        return null;
    }

    $expiresAt = (int) ($payload['expires_at'] ?? 0);
    if ($expiresAt <= time()) {
        return null;
    }

    return $payload;
}

function make_repair_download_token(int $repairId, int $fileId, int $userId, string $path, int $ttlSeconds = 3600): string
{
    return sign_download_payload([
        'kind' => 'repair',
        'repair_id' => $repairId,
        'file_id' => $fileId,
        'user_id' => $userId,
        'path' => $path,
        'expires_at' => time() + max(60, min(3600, $ttlSeconds)),
    ]);
}
