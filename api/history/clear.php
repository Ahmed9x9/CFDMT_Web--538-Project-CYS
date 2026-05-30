<?php
declare(strict_types=1);

require_once __DIR__ . '/../bootstrap.php';
require_once __DIR__ . '/../lib/app_state.php';

require_method('POST');

$user = require_auth();
$userId = (int) $user['id'];
$data = read_json_body();
$mode = clean_string($data['mode'] ?? '', 20);
$entryId = (int) ($data['entryId'] ?? 0);

function history_auth_action_filter(): string
{
    return "action NOT IN ('register', 'login', 'logout')";
}

function history_range_for_mode(string $mode): array
{
    $now = new DateTimeImmutable('now');

    if ($mode === 'all') {
        return [null, null];
    }
    if ($mode === 'last24h') {
        return [$now->sub(new DateInterval('P1D'))->format('Y-m-d H:i:s'), null];
    }
    if ($mode === 'last7days') {
        return [$now->sub(new DateInterval('P7D'))->format('Y-m-d H:i:s'), null];
    }
    if ($mode === 'lastWeek') {
        $today = new DateTimeImmutable('today');
        $weekday = (int) $today->format('N');
        $daysSinceMonday = $weekday - 1;
        $thisWeekStart = $daysSinceMonday > 0
            ? $today->sub(new DateInterval('P' . $daysSinceMonday . 'D'))
            : $today;
        $lastWeekStart = $thisWeekStart->sub(new DateInterval('P7D'));
        return [$lastWeekStart->format('Y-m-d H:i:s'), $thisWeekStart->format('Y-m-d H:i:s')];
    }

    json_response(['error' => 'Invalid history clear range.'], 422);
}

function history_date_predicate(string $column, ?string $start, ?string $end): array
{
    if ($start === null && $end === null) {
        return ['1 = 1', []];
    }
    if ($end === null) {
        return ["{$column} >= ?", [$start]];
    }
    return ["{$column} >= ? AND {$column} < ?", [$start, $end]];
}

function hide_file_activity_for_entry(int $userId, int $fileId, string $action): array
{
    $counts = ['files' => 0, 'scans' => 0, 'repairs' => 0];
    if ($fileId <= 0) {
        return $counts;
    }

    if (in_array($action, ['upload', 'scan', 'delete', 'dismiss'], true)) {
        $stmt = db()->prepare('UPDATE scan_results SET user_hidden_at = NOW() WHERE user_id = ? AND file_id = ? AND user_hidden_at IS NULL');
        $stmt->execute([$userId, $fileId]);
        $counts['scans'] = $stmt->rowCount();
    }

    if (in_array($action, ['upload', 'repair', 'delete', 'dismiss'], true)) {
        $stmt = db()->prepare('UPDATE repair_jobs SET user_hidden_at = NOW() WHERE user_id = ? AND file_id = ? AND user_hidden_at IS NULL');
        $stmt->execute([$userId, $fileId]);
        $counts['repairs'] = $stmt->rowCount();
    }

    if (in_array($action, ['upload', 'scan', 'repair', 'delete', 'dismiss'], true)) {
        $stmt = db()->prepare('UPDATE files SET user_hidden_at = NOW() WHERE id = ? AND user_id = ? AND user_hidden_at IS NULL');
        $stmt->execute([$fileId, $userId]);
        $counts['files'] = $stmt->rowCount();
    }

    return $counts;
}

if ($mode === 'entry') {
    if ($entryId <= 0) {
        json_response(['error' => 'History entry id is required.'], 422);
    }

    $stmt = db()->prepare(
        'SELECT id, file_id, action
         FROM action_logs
         WHERE id = ?
           AND user_id = ?
           AND user_hidden_at IS NULL
           AND ' . history_auth_action_filter() . '
         LIMIT 1'
    );
    $stmt->execute([$entryId, $userId]);
    $entry = $stmt->fetch();
    if (!$entry) {
        json_response(['error' => 'History entry not found.'], 404);
    }

    $pdo = db();
    $pdo->beginTransaction();
    try {
        $updateLog = $pdo->prepare('UPDATE action_logs SET user_hidden_at = NOW() WHERE id = ? AND user_id = ? AND user_hidden_at IS NULL');
        $updateLog->execute([$entryId, $userId]);
        $counts = hide_file_activity_for_entry($userId, (int) ($entry['file_id'] ?? 0), (string) $entry['action']);
        $counts['actions'] = $updateLog->rowCount();
        $pdo->commit();
    } catch (Throwable $exception) {
        $pdo->rollBack();
        json_response(['error' => 'Could not clear history entry.'], 500);
    }

    json_response(['ok' => true, 'cleared' => $counts, 'state' => app_state_for_user($user)]);
}

[$start, $end] = history_range_for_mode($mode);
[$fileDateSql, $fileDateParams] = history_date_predicate('uploaded_at', $start, $end);
[$scanDateSql, $scanDateParams] = history_date_predicate('created_at', $start, $end);
[$repairDateSql, $repairDateParams] = history_date_predicate('created_at', $start, $end);
[$actionDateSql, $actionDateParams] = history_date_predicate('created_at', $start, $end);

$pdo = db();
$pdo->beginTransaction();
try {
    $updateFilesSql =
        "UPDATE files
         SET user_hidden_at = NOW()
         WHERE user_id = ?
           AND user_hidden_at IS NULL
           AND (
             {$fileDateSql}
             OR id IN (SELECT file_id FROM scan_results WHERE user_id = ? AND {$scanDateSql})
             OR id IN (SELECT file_id FROM repair_jobs WHERE user_id = ? AND {$repairDateSql})
             OR id IN (
                SELECT file_id
                FROM action_logs
                WHERE user_id = ?
                  AND file_id IS NOT NULL
                  AND action IN ('upload', 'scan', 'repair', 'delete', 'dismiss')
                  AND {$actionDateSql}
             )
           )";
    $updateFilesParams = array_merge(
        [$userId],
        $fileDateParams,
        [$userId],
        $scanDateParams,
        [$userId],
        $repairDateParams,
        [$userId],
        $actionDateParams
    );
    $updateFiles = $pdo->prepare($updateFilesSql);
    $updateFiles->execute($updateFilesParams);

    $updateScans = $pdo->prepare("UPDATE scan_results SET user_hidden_at = NOW() WHERE user_id = ? AND user_hidden_at IS NULL AND {$scanDateSql}");
    $updateScans->execute(array_merge([$userId], $scanDateParams));

    $updateRepairs = $pdo->prepare("UPDATE repair_jobs SET user_hidden_at = NOW() WHERE user_id = ? AND user_hidden_at IS NULL AND {$repairDateSql}");
    $updateRepairs->execute(array_merge([$userId], $repairDateParams));

    $updateActions = $pdo->prepare(
        "UPDATE action_logs
         SET user_hidden_at = NOW()
         WHERE user_id = ?
           AND user_hidden_at IS NULL
           AND " . history_auth_action_filter() . "
           AND {$actionDateSql}"
    );
    $updateActions->execute(array_merge([$userId], $actionDateParams));

    $counts = [
        'files' => $updateFiles->rowCount(),
        'scans' => $updateScans->rowCount(),
        'repairs' => $updateRepairs->rowCount(),
        'actions' => $updateActions->rowCount(),
    ];
    $pdo->commit();
} catch (Throwable $exception) {
    $pdo->rollBack();
    json_response(['error' => 'Could not clear history.'], 500);
}

json_response(['ok' => true, 'cleared' => $counts, 'state' => app_state_for_user($user)]);
