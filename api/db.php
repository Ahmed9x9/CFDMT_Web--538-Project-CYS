<?php
declare(strict_types=1);

function db(): PDO
{
    static $pdo = null;

    if ($pdo instanceof PDO) {
        return $pdo;
    }

    $host = getenv('CFDMT_DB_HOST') ?: '127.0.0.1';
    $name = getenv('CFDMT_DB_NAME') ?: 'cfdmt_web';
    $user = getenv('CFDMT_DB_USER') ?: 'root';
    $pass = getenv('CFDMT_DB_PASS') ?: '';
    $charset = 'utf8mb4';

    $dsn = "mysql:host={$host};dbname={$name};charset={$charset}";
    try {
        $pdo = new PDO($dsn, $user, $pass, [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
        ]);
    } catch (PDOException $exception) {
        json_response(['error' => 'Database connection failed.'], 500);
    }

    return $pdo;
}
