<?php
declare(strict_types=1);

function python_engine_base_url(): string
{
    return rtrim(getenv('CFDMT_ENGINE_URL') ?: 'http://127.0.0.1:8000', '/');
}

function python_engine_secret(): string
{
    return getenv('CFDMT_ENGINE_SECRET') ?: 'cfdmt-web-dev-engine-secret-change-in-production';
}

function python_engine_file_path(string $path): string
{
    $resolved = realpath($path);
    return $resolved !== false ? $resolved : $path;
}

function python_engine_request(string $path, array $payload, int $timeoutSeconds = 180): ?array
{
    $url = python_engine_base_url() . $path;
    $body = json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if ($body === false) {
        return null;
    }

    if (function_exists('curl_init')) {
        $handle = curl_init($url);
        if (!$handle) {
            return null;
        }
        curl_setopt_array($handle, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_POST => true,
            CURLOPT_HTTPHEADER => [
                'Content-Type: application/json',
                'Accept: application/json',
                'X-CFDMT-Engine-Token: ' . python_engine_secret(),
            ],
            CURLOPT_POSTFIELDS => $body,
            CURLOPT_TIMEOUT => $timeoutSeconds,
        ]);
        $response = curl_exec($handle);
        $status = (int) curl_getinfo($handle, CURLINFO_HTTP_CODE);
        $error = curl_error($handle);
        curl_close($handle);

        if ($response === false || $status < 200 || $status >= 300) {
            error_log('Python engine request failed: ' . ($error ?: "HTTP {$status}"));
            return null;
        }

        $decoded = json_decode((string) $response, true);
        return is_array($decoded) ? $decoded : null;
    }

    $context = stream_context_create([
        'http' => [
            'method' => 'POST',
            'header' => "Content-Type: application/json\r\nAccept: application/json\r\nX-CFDMT-Engine-Token: " . python_engine_secret() . "\r\n",
            'content' => $body,
            'timeout' => $timeoutSeconds,
            'ignore_errors' => true,
        ],
    ]);
    $response = @file_get_contents($url, false, $context);
    if ($response === false) {
        error_log('Python engine request failed: no response from ' . $url);
        return null;
    }

    $status = 0;
    foreach (($http_response_header ?? []) as $header) {
        if (preg_match('/^HTTP\/\S+\s+(\d+)/', $header, $matches)) {
            $status = (int) $matches[1];
            break;
        }
    }
    if ($status < 200 || $status >= 300) {
        error_log("Python engine request failed: HTTP {$status}");
        return null;
    }

    $decoded = json_decode($response, true);
    return is_array($decoded) ? $decoded : null;
}

function python_engine_scan_file(string $path, string $profile): ?array
{
    $response = python_engine_request('/api/engine/scan', [
        'path' => python_engine_file_path($path),
        'profile' => $profile,
    ]);

    if (!$response || empty($response['ok'])) {
        return null;
    }

    $status = strtolower((string) ($response['status'] ?? 'suspicious'));
    if (!in_array($status, ['clean', 'suspicious', 'corrupted'], true)) {
        $status = 'suspicious';
    }
    $severity = strtolower((string) ($response['severity'] ?? 'medium'));
    if (!in_array($severity, ['info', 'low', 'medium', 'high', 'critical'], true)) {
        $severity = $status === 'clean' ? 'info' : 'medium';
    }

    return [
        'status' => $status,
        'check_code' => clean_string($response['check_code'] ?? 'GENERIC_CORRUPTION', 80),
        'severity' => $severity,
        'evidence' => clean_string($response['evidence'] ?? 'The Python engine completed the scan.', 4000),
        'recommendation' => clean_string($response['recommendation'] ?? 'Review the evidence and restore a known-good copy if needed.', 1000),
        'raw_details' => [
            'engine' => 'python',
            'response' => $response,
        ],
        'scanned_count' => max(1, (int) ($response['scanned_count'] ?? 1)),
        'flagged_count' => max(0, (int) ($response['flagged_count'] ?? ($status === 'clean' ? 0 : 1))),
        'file_type' => clean_string($response['file_type'] ?? '', 30),
        'engine' => 'python',
    ];
}

function python_engine_repair_file(string $path): ?array
{
    $response = python_engine_request('/api/engine/repair', [
        'path' => python_engine_file_path($path),
    ], 300);

    if (!$response || empty($response['ok'])) {
        return null;
    }

    return $response;
}
