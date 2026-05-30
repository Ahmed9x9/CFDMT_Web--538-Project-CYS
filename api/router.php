<?php
declare(strict_types=1);

$path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';
$normalizedPath = str_replace('\\', '/', rawurldecode($path));

$blockedPrefixes = [
    '/api/uploads/',
    '/api/repaired/',
    '/backend/',
    '/database/',
    '/docs/',
    '/node_modules/',
    '/src/',
    '/.git/',
    '/.lovable/',
    '/.qodo/',
    '/.npm-cache/',
];

foreach ($blockedPrefixes as $prefix) {
    if (str_starts_with($normalizedPath, $prefix)) {
        http_response_code(404);
        header('Content-Type: text/plain; charset=utf-8');
        echo 'Not found';
        return true;
    }
}

$blockedExact = [
    '/package.json',
    '/package-lock.json',
    '/bun.lockb',
    '/components.json',
    '/README.md',
    '/vite.config.ts',
    '/tsconfig.json',
    '/tsconfig.app.json',
    '/tsconfig.node.json',
    '/tailwind.config.ts',
    '/postcss.config.js',
    '/eslint.config.js',
    '/vitest.config.ts',
];

if (in_array($normalizedPath, $blockedExact, true) || preg_match('/\.(?:env|log|err|sql|md|ts|tsx|json|lock|yml|yaml)$/i', $normalizedPath)) {
    http_response_code(404);
    header('Content-Type: text/plain; charset=utf-8');
    echo 'Not found';
    return true;
}

if (preg_match('#^/api/[A-Za-z0-9_/-]+\.php$#', $normalizedPath)) {
    return false;
}

http_response_code(404);
header('Content-Type: text/plain; charset=utf-8');
echo 'Not found';
return true;