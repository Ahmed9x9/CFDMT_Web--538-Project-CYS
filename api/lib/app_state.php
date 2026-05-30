<?php
declare(strict_types=1);

require_once __DIR__ . '/policy.php';
require_once __DIR__ . '/file_access.php';
require_once __DIR__ . '/download_tokens.php';

function file_row_to_client(array $row): array
{
    $repairedDownloadUrl = null;
    if (
        (string) $row['status'] === 'repaired'
        && !empty($row['latest_repair_id'])
        && !empty($row['latest_repaired_path'])
        && !file_action_access_expired($row)
    ) {
        $ttl = max(60, min(3600, file_access_expires_timestamp($row) - time()));
        $token = make_repair_download_token(
            (int) $row['latest_repair_id'],
            (int) $row['id'],
            (int) $row['user_id'],
            (string) $row['latest_repaired_path'],
            $ttl
        );
        $repairedDownloadUrl = '/api/files/download_repaired.php?token=' . rawurlencode($token);
    }

    return [
        'id' => (string) $row['id'],
        'name' => $row['original_name'],
        'type' => $row['file_type'],
        'size' => format_size((int) $row['size_bytes']),
        'hash' => substr((string) $row['sha256'], 0, 12) . '...',
        'fullHash' => $row['sha256'],
        'status' => status_label((string) $row['status']),
        'evidence' => $row['latest_evidence'] ?: 'No corruption evidence found.',
        'date' => substr((string) $row['uploaded_at'], 0, 10),
        'user' => $row['owner_name'] ?? 'Unknown',
        'expiresAt' => file_access_expires_at($row),
        'isExpired' => file_action_access_expired($row),
        'repairedDownloadUrl' => $repairedDownloadUrl,
    ];
}

function action_row_to_client(array $row): array
{
    $action = str_replace('_', ' ', (string) $row['action']);
    $action = ucwords($action);
    return [
        'id' => (string) $row['id'],
        'date' => substr((string) $row['created_at'], 0, 10),
        'file' => $row['original_name'] ?: 'System',
        'fileType' => $row['file_type'] ?: '-',
        'fileSize' => isset($row['size_bytes']) && $row['size_bytes'] !== null ? format_size((int) $row['size_bytes']) : '-',
        'fileStatus' => !empty($row['file_status']) ? status_label((string) $row['file_status']) : null,
        'action' => $action,
        'user' => $row['full_name'] ?: 'System',
        'notes' => $row['notes'] ?: '',
    ];
}

function admin_public_id(string $prefix, mixed $id): string
{
    return $prefix . '-' . substr(hash('sha256', $prefix . ':' . (string) $id), 0, 12);
}

function admin_action_note(string $action, ?string $notes, ?string $metadata = null): string
{
    if ($action === 'user_update' && $metadata) {
        $decoded = json_decode($metadata, true);
        if (is_array($decoded)) {
            $parts = [];
            if (($decoded['role'] ?? null) === 'admin') {
                $parts[] = 'Promoted a user account to admin.';
            } elseif (($decoded['role'] ?? null) === 'user') {
                $parts[] = 'Demoted an admin account to user.';
            }

            if (array_key_exists('is_active', $decoded)) {
                $parts[] = $decoded['is_active'] ? 'Activated the account.' : 'Deactivated the account.';
            }

            if ($parts) {
                return implode(' ', $parts);
            }
        }
    }

    $adminActions = ['user_update', 'policy_update', 'export_audit', 'archive_logs', 'clear_failed_jobs', 'admin_update'];
    if (in_array($action, $adminActions, true) && $notes) {
        return $notes;
    }
    if ($action === 'scan' && $notes) {
        return $notes;
    }
    if ($action === 'repair' && $notes) {
        return $notes;
    }

    return match ($action) {
        'register' => 'Account registered.',
        'login' => 'Account login.',
        'logout' => 'Account logout.',
        'failed_login' => 'Failed login attempt.',
        'upload_rejected' => 'Upload rejected.',
        'export_audit' => 'Anonymized audit report exported.',
        'archive_logs' => 'Old logs archived.',
        'clear_failed_jobs' => 'Old failed repair jobs cleared.',
        'policy_update' => 'File policy updated.',
        'user_update' => 'User account updated.',
        'upload' => 'File uploaded.',
        'download' => 'File downloaded.',
        'delete' => 'File deleted.',
        'dismiss' => 'Finding dismissed.',
        'settings_update' => 'Settings updated.',
        'admin_update' => 'Admin update recorded.',
        default => 'Action recorded.',
    };
}

function admin_file_row_to_client(array $row): array
{
    return [
        'id' => admin_public_id('scan', $row['id']),
        'name' => 'Hidden file',
        'type' => $row['file_type'],
        'size' => '-',
        'hash' => '',
        'status' => status_label((string) $row['status']),
        'evidence' => '',
        'date' => substr((string) $row['uploaded_at'], 0, 10),
        'user' => 'Hidden user',
    ];
}

function admin_action_row_to_client(array $row): array
{
    $rawAction = (string) $row['action'];
    $action = ucwords(str_replace('_', ' ', $rawAction));
    $adminActions = ['user_update', 'policy_update', 'export_audit', 'archive_logs', 'clear_failed_jobs', 'admin_update'];
    $actor = 'Hidden user';
    if (in_array($rawAction, $adminActions, true)) {
        $actor = ($row['actor_role'] ?? '') === 'admin' && !empty($row['actor_name'])
            ? (string) $row['actor_name']
            : 'System';
    }

    return [
        'id' => admin_public_id('action', $row['id']),
        'date' => substr((string) $row['created_at'], 0, 10),
        'file' => empty($row['file_type']) ? 'System' : 'Hidden file',
        'fileType' => $row['file_type'] ?: '-',
        'fileSize' => '-',
        'fileStatus' => !empty($row['file_status']) ? status_label((string) $row['file_status']) : null,
        'action' => $action,
        'user' => $actor,
        'notes' => admin_action_note($rawAction, $row['notes'] ?? null, $row['metadata'] ?? null),
    ];
}

function user_scope_sql(array $user, string $tableAlias): array
{
    return [" WHERE {$tableAlias}.user_id = ? ", [(int) $user['id']]];
}

function auth_action_filter_sql(string $tableAlias): string
{
    return "{$tableAlias}.action NOT IN ('register', 'login', 'logout')";
}

function user_page_settings(int $userId): array
{
    $defaults = [
        'showExpiredFiles' => true,
        'hideClearedHistory' => true,
    ];

    try {
        $stmt = db()->prepare('SELECT show_expired_files, hide_cleared_history FROM user_settings WHERE user_id = ? LIMIT 1');
        $stmt->execute([$userId]);
        $row = $stmt->fetch();
        if (!$row) {
            return $defaults;
        }

        return [
            'showExpiredFiles' => (int) $row['show_expired_files'] === 1,
            'hideClearedHistory' => (int) $row['hide_cleared_history'] === 1,
        ];
    } catch (Throwable $exception) {
        return $defaults;
    }
}

function get_files_for_user(array $user): array
{
    [$where, $params] = user_scope_sql($user, 'f');
    $settings = user_page_settings((int) $user['id']);
    $hiddenFilter = $settings['hideClearedHistory'] ? ' AND f.user_hidden_at IS NULL ' : ' ';
    $accessWindowSeconds = file_access_window_seconds();
    $expiredFilter = $settings['showExpiredFiles'] ? ' ' : " AND f.uploaded_at >= DATE_SUB(NOW(), INTERVAL {$accessWindowSeconds} SECOND) ";

    $stmt = db()->prepare(
        "SELECT f.*, u.full_name AS owner_name,
                (
                  SELECT r.id
                  FROM repair_jobs r
                  WHERE r.file_id = f.id
                    AND r.user_id = f.user_id
                    AND r.status = 'succeeded'
                    AND r.user_hidden_at IS NULL
                  ORDER BY r.created_at DESC, r.id DESC
                  LIMIT 1
                ) AS latest_repair_id,
                (
                  SELECT r.repaired_path
                  FROM repair_jobs r
                  WHERE r.file_id = f.id
                    AND r.user_id = f.user_id
                    AND r.status = 'succeeded'
                    AND r.user_hidden_at IS NULL
                  ORDER BY r.created_at DESC, r.id DESC
                  LIMIT 1
                ) AS latest_repaired_path
         FROM files f
         JOIN users u ON u.id = f.user_id
         {$where}
           AND f.deleted_at IS NULL
           {$hiddenFilter}
           {$expiredFilter}
         ORDER BY f.uploaded_at DESC
         LIMIT 200"
    );
    $stmt->execute($params);
    return array_map('file_row_to_client', $stmt->fetchAll());
}

function get_actions_for_user(array $user): array
{
    $settings = user_page_settings((int) $user['id']);
    $hiddenFilter = $settings['hideClearedHistory'] ? ' AND a.user_hidden_at IS NULL ' : ' ';
    $where = ' WHERE a.user_id = ? AND a.archived_at IS NULL ' . $hiddenFilter . ' AND (a.file_id IS NULL OR f.deleted_at IS NULL) AND ' . auth_action_filter_sql('a') . ' ';
    $params = [(int) $user['id']];

    $stmt = db()->prepare(
        "SELECT a.*, u.full_name, f.original_name, f.file_type, f.size_bytes, f.status AS file_status
         FROM action_logs a
         LEFT JOIN users u ON u.id = a.user_id
         LEFT JOIN files f ON f.id = a.file_id
         {$where}
         ORDER BY a.created_at DESC
         LIMIT 200"
    );
    $stmt->execute($params);
    return array_map('action_row_to_client', $stmt->fetchAll());
}

function scalar_count(string $sql, array $params = []): int
{
    $stmt = db()->prepare($sql);
    $stmt->execute($params);
    return (int) $stmt->fetchColumn();
}

function get_metrics_for_user(array $user): array
{
    $settings = user_page_settings((int) $user['id']);
    $hiddenFilter = $settings['hideClearedHistory'] ? ' AND user_hidden_at IS NULL ' : ' ';
    $userFilter = ' WHERE user_id = ? ';
    $andUserFilter = ' AND user_id = ? ';
    $params = [(int) $user['id']];
    $recentActionsSql = 'SELECT COUNT(*) FROM action_logs WHERE user_id = ? AND archived_at IS NULL ' . $hiddenFilter . ' AND ' . auth_action_filter_sql('action_logs');

    return [
        'totalUploaded' => scalar_count("SELECT COUNT(*) FROM files {$userFilter} {$hiddenFilter} AND deleted_at IS NULL", $params),
        'totalScans' => scalar_count("SELECT COUNT(*) FROM scan_results {$userFilter} {$hiddenFilter}", $params),
        'corrupted' => scalar_count("SELECT COUNT(*) FROM files WHERE status = 'corrupted' {$hiddenFilter} AND deleted_at IS NULL {$andUserFilter}", $params),
        'repaired' => scalar_count("SELECT COUNT(*) FROM files WHERE status = 'repaired' {$hiddenFilter} AND deleted_at IS NULL {$andUserFilter}", $params),
        'failedRepair' => scalar_count("SELECT COUNT(*) FROM repair_jobs WHERE status = 'failed' {$hiddenFilter} {$andUserFilter}", $params),
        'needsRepair' => scalar_count("SELECT COUNT(*) FROM files WHERE status IN ('suspicious', 'corrupted', 'repair_failed') {$hiddenFilter} AND deleted_at IS NULL {$andUserFilter}", $params),
        'recentActions' => scalar_count($recentActionsSql, $params),
        'totalUsers' => scalar_count('SELECT COUNT(*) FROM users'),
    ];
}

function app_state_for_user(array $user): array
{
    return [
        'files' => get_files_for_user($user),
        'actions' => get_actions_for_user($user),
        'metrics' => get_metrics_for_user($user),
        'currentUser' => $user,
    ];
}

function get_admin_files_for_page(): array
{
    $stmt = db()->prepare(
        "SELECT id, file_type, status, uploaded_at
         FROM files
         WHERE deleted_at IS NULL
         ORDER BY uploaded_at DESC
         LIMIT 200"
    );
    $stmt->execute();
    return array_map('admin_file_row_to_client', $stmt->fetchAll());
}

function admin_user_row_to_client(array $row): array
{
    return [
        'id' => (string) $row['id'],
        'email' => $row['email'],
        'role' => $row['role'],
        'isActive' => (int) $row['is_active'] === 1,
        'joined' => substr((string) $row['created_at'], 0, 10),
    ];
}

function get_admin_users_for_page(): array
{
    $stmt = db()->prepare(
        "SELECT id, email, role, is_active, created_at
         FROM users
         ORDER BY created_at DESC
         LIMIT 500"
    );
    $stmt->execute();
    return array_map('admin_user_row_to_client', $stmt->fetchAll());
}

function get_admin_actions_for_page(): array
{
    $stmt = db()->prepare(
        "SELECT a.id, a.action, a.notes, a.metadata, a.created_at, f.file_type, f.status AS file_status,
                u.full_name AS actor_name, u.role AS actor_role
         FROM action_logs a
         LEFT JOIN users u ON u.id = a.user_id
         LEFT JOIN files f ON f.id = a.file_id
         WHERE a.archived_at IS NULL
           AND a.action IN ('user_update', 'policy_update', 'export_audit', 'archive_logs', 'clear_failed_jobs', 'admin_update')
         ORDER BY a.created_at DESC
         LIMIT 200"
    );
    $stmt->execute();
    return array_map('admin_action_row_to_client', $stmt->fetchAll());
}

function get_admin_metrics_for_page(): array
{
    return [
        'totalUploaded' => scalar_count('SELECT COUNT(*) FROM files'),
        'totalScans' => scalar_count('SELECT COUNT(*) FROM scan_results'),
        'corrupted' => scalar_count("SELECT COUNT(*) FROM files WHERE status = 'corrupted'"),
        'repaired' => scalar_count("SELECT COUNT(*) FROM files WHERE status = 'repaired'"),
        'failedRepair' => scalar_count("SELECT COUNT(*) FROM repair_jobs WHERE status = 'failed'"),
        'needsRepair' => scalar_count("SELECT COUNT(*) FROM files WHERE status IN ('suspicious', 'corrupted', 'repair_failed')"),
        'recentActions' => scalar_count('SELECT COUNT(*) FROM action_logs'),
        'totalUsers' => scalar_count('SELECT COUNT(*) FROM users'),
    ];
}

function get_admin_health_for_page(): array
{
    return [
        'database' => getenv('CFDMT_DB_NAME') ?: 'cfdmt_web',
        'activeUsers' => scalar_count('SELECT COUNT(*) FROM users WHERE is_active = 1'),
        'inactiveUsers' => scalar_count('SELECT COUNT(*) FROM users WHERE is_active = 0'),
        'storedFiles' => scalar_count('SELECT COUNT(*) FROM files WHERE deleted_at IS NULL'),
        'scanResults' => scalar_count('SELECT COUNT(*) FROM scan_results'),
        'openFailedJobs' => scalar_count("SELECT COUNT(*) FROM repair_jobs WHERE status = 'failed'"),
        'archivedLogs' => scalar_count('SELECT COUNT(*) FROM action_logs WHERE archived_at IS NOT NULL'),
        'activeLogs' => scalar_count('SELECT COUNT(*) FROM action_logs WHERE archived_at IS NULL'),
    ];
}

function get_admin_security_for_page(): array
{
    $highRiskStmt = db()->prepare(
        "SELECT file_type AS type, COUNT(*) AS count
         FROM files
         WHERE status IN ('suspicious', 'corrupted', 'repair_failed')
           AND deleted_at IS NULL
         GROUP BY file_type
         ORDER BY count DESC, file_type ASC
         LIMIT 10"
    );
    $highRiskStmt->execute();

    $eventsStmt = db()->prepare(
        "SELECT action, notes, ip_address, created_at
         FROM action_logs
         WHERE action IN ('failed_login', 'upload_rejected')
           AND archived_at IS NULL
         ORDER BY created_at DESC
         LIMIT 50"
    );
    $eventsStmt->execute();
    $events = array_map(static function (array $row): array {
        return [
            'date' => substr((string) $row['created_at'], 0, 10),
            'event' => ucwords(str_replace('_', ' ', (string) $row['action'])),
            'notes' => $row['notes'] ?: '',
            'ipAddress' => !empty($row['ip_address']) ? admin_public_id('source', $row['ip_address']) : 'Hidden source',
        ];
    }, $eventsStmt->fetchAll());

    return [
        'failedLoginAttempts' => scalar_count("SELECT COUNT(*) FROM action_logs WHERE action = 'failed_login'"),
        'uploadRejections' => scalar_count("SELECT COUNT(*) FROM action_logs WHERE action = 'upload_rejected'"),
        'suspiciousScans' => scalar_count("SELECT COUNT(*) FROM scan_results WHERE result_status = 'suspicious'"),
        'corruptedScans' => scalar_count("SELECT COUNT(*) FROM scan_results WHERE result_status = 'corrupted'"),
        'highRiskTypes' => array_map(static function (array $row): array {
            return [
                'type' => $row['type'],
                'count' => (int) $row['count'],
            ];
        }, $highRiskStmt->fetchAll()),
        'events' => $events,
    ];
}

function admin_state_for_page(array $adminUser): array
{
    return [
        'files' => get_admin_files_for_page(),
        'actions' => get_admin_actions_for_page(),
        'users' => get_admin_users_for_page(),
        'policies' => get_app_policy(),
        'health' => get_admin_health_for_page(),
        'security' => get_admin_security_for_page(),
        'metrics' => get_admin_metrics_for_page(),
        'currentUser' => $adminUser,
    ];
}
