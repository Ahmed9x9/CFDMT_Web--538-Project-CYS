<?php
declare(strict_types=1);

require_once __DIR__ . '/python_engine.php';

function read_prefix(string $path, int $bytes = 16): string
{
    $handle = fopen($path, 'rb');
    if (!$handle) {
        return '';
    }
    $data = fread($handle, $bytes) ?: '';
    fclose($handle);
    return $data;
}

function scan_uploaded_file(string $path, string $originalName, string $profile = 'full'): array
{
    $profile = in_array($profile, ['quick', 'full', 'custom'], true) ? $profile : 'full';
    $engineFinding = python_engine_scan_file($path, $profile);
    if ($engineFinding !== null) {
        return $engineFinding;
    }

    $finding = basic_scan_uploaded_file($path, $originalName);
    $finding['raw_details'] = [
        'engine' => 'php-basic',
        'fallback_reason' => 'python_engine_unavailable',
        'finding' => $finding,
    ];
    $finding['scanned_count'] = 1;
    $finding['flagged_count'] = $finding['status'] === 'clean' ? 0 : 1;
    $finding['engine'] = 'php-basic';
    return $finding;
}

function basic_scan_uploaded_file(string $path, string $originalName): array
{
    $size = filesize($path);
    if ($size === false || $size === 0) {
        return [
            'status' => 'corrupted',
            'check_code' => 'EMPTY_FILE',
            'severity' => 'high',
            'evidence' => 'The file is empty and cannot contain valid structured data.',
            'recommendation' => 'Upload a complete copy of the file.',
        ];
    }

    $extension = strtolower(pathinfo($originalName, PATHINFO_EXTENSION));
    $prefix = read_prefix($path, 16);
    $tail = '';
    if ($size > 0) {
        $handle = fopen($path, 'rb');
        if ($handle) {
            fseek($handle, max(0, $size - 2048));
            $tail = fread($handle, 2048) ?: '';
            fclose($handle);
        }
    }

    if (in_array($extension, ['jpg', 'jpeg'], true)) {
        if (!str_starts_with($prefix, "\xFF\xD8") || !str_ends_with(substr($tail, -2), "\xFF\xD9")) {
            return finding('corrupted', 'JPEG_SIGNATURE_OR_EOI_MISSING', 'high', 'The JPEG start or end marker is missing.', 'Restore the image from a known-good source.');
        }
        return clean_finding();
    }

    if ($extension === 'png') {
        if (!str_starts_with($prefix, "\x89PNG\r\n\x1A\n")) {
            return finding('corrupted', 'PNG_SIGNATURE_MISSING', 'high', 'The PNG signature is missing or damaged.', 'Re-upload or restore the PNG file.');
        }
        if (!str_contains($tail, "IEND")) {
            return finding('suspicious', 'PNG_IEND_NOT_FOUND', 'medium', 'The PNG end chunk was not found near the end of the file.', 'Open the image carefully or scan with the full repair tool.');
        }
        return clean_finding();
    }

    if ($extension === 'pdf') {
        if (!str_starts_with($prefix, '%PDF-')) {
            return finding('corrupted', 'PDF_HEADER_MISSING', 'high', 'The PDF header is missing or damaged.', 'Restore the PDF from a known-good source.');
        }
        if (!str_contains($tail, '%%EOF')) {
            return finding('suspicious', 'PDF_EOF_MISSING', 'medium', 'The PDF EOF marker was not found near the end of the file.', 'Run a full PDF repair attempt or restore the original.');
        }
        return clean_finding();
    }

    if ($extension === 'zip') {
        if (!str_starts_with($prefix, "PK")) {
            return finding('corrupted', 'ZIP_SIGNATURE_MISSING', 'high', 'The ZIP container signature is missing.', 'Re-upload or restore the archive.');
        }
        if (class_exists('ZipArchive')) {
            $zip = new ZipArchive();
            if ($zip->open($path) !== true) {
                return finding('corrupted', 'ZIP_OPEN_FAILED', 'high', 'The ZIP container could not be opened.', 'Restore the file or try the repair workflow.');
            }
            $zip->close();
        }
        return clean_finding();
    }

    if ($extension === 'rar') {
        if (!str_starts_with($prefix, "Rar!\x1A\x07\x00") && !str_starts_with($prefix, "Rar!\x1A\x07\x01\x00")) {
            return finding('corrupted', 'RAR_SIGNATURE_MISSING', 'high', 'The RAR archive signature is missing.', 'Re-upload or restore the archive.');
        }
        return clean_finding();
    }

    if ($extension === '7z') {
        if (!str_starts_with($prefix, "7z\xBC\xAF\x27\x1C")) {
            return finding('corrupted', 'SEVEN_Z_SIGNATURE_MISSING', 'high', 'The 7Z archive signature is missing.', 'Re-upload or restore the archive.');
        }
        return clean_finding();
    }

    return finding('suspicious', 'UNSUPPORTED_SCAN_TYPE', 'medium', 'Only PNG, JPG, PDF, ZIP, RAR, and 7Z files are supported.', 'Upload one of the supported file types.');
}

function clean_finding(): array
{
    return finding('clean', 'NO_CORRUPTION_FOUND', 'info', 'No corruption evidence found.', 'No action is required.');
}

function finding(string $status, string $checkCode, string $severity, string $evidence, string $recommendation): array
{
    return [
        'status' => $status,
        'check_code' => $checkCode,
        'severity' => $severity,
        'evidence' => $evidence,
        'recommendation' => $recommendation,
    ];
}
