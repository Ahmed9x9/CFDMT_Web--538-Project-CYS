<?php
declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    exit(0);
}

$host = getenv('CFDMT_DB_HOST') ?: '127.0.0.1';
$name = getenv('CFDMT_DB_NAME') ?: 'cfdmt_web';
$user = getenv('CFDMT_DB_USER') ?: 'root';
$pass = getenv('CFDMT_DB_PASS') ?: '';
$dsn = "mysql:host={$host};dbname={$name};charset=utf8mb4";

$deadline = time() + 60;
$pdo = null;

while (!$pdo instanceof PDO) {
    try {
        $pdo = new PDO($dsn, $user, $pass, [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
        ]);
    } catch (Throwable $exception) {
        if (time() >= $deadline) {
            throw $exception;
        }
        fwrite(STDERR, "Waiting for database...\n");
        sleep(2);
    }
}

$hash = password_hash('password', PASSWORD_DEFAULT);
$stmt = $pdo->prepare(
    "INSERT INTO users (full_name, email, password_hash, role, is_active)
     VALUES ('Decoy Admin', 'decoy.admin@cfdmt.test', ?, 'admin', 1)
     ON DUPLICATE KEY UPDATE
       password_hash = VALUES(password_hash),
       role = 'admin',
       is_active = 1"
);
$stmt->execute([$hash]);

fwrite(STDOUT, "Demo admin ready: decoy.admin@cfdmt.test / password\n");
