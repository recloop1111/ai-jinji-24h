-- ============================================================================
-- pr4e3_evaluation_lock_state_precheck.sql  （適用前・SELECT のみ・未実行）
-- ============================================================================

-- 1) 対象テーブル存在（期待: public.interviews 非 NULL）。
SELECT to_regclass('public.interviews') AS interviews_table;

-- 2) 追加予定列が「まだ無い」こと（期待: 0行）。1行以上なら適用済み（IF NOT EXISTS で冪等）。
SELECT column_name
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'interviews'
  AND column_name IN ('evaluation_locked_until', 'evaluation_status', 'evaluation_error_code');

-- 3) 既存の同名 CHECK 制約が無いこと（期待: 0行）。
SELECT conname FROM pg_constraint
WHERE conrelid = 'public.interviews'::regclass AND conname = 'interviews_evaluation_status_chk';

-- 4) 既存の realtime ロック列（同思想の先行実装。参考）。
SELECT column_name FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'interviews' AND column_name = 'realtime_call_locked_until';

-- 5) interviews に対する長時間トランザクション/重いロックが無いこと（ADD COLUMN は一瞬 ACCESS EXCLUSIVE）。
SELECT pid, state, now() - xact_start AS xact_age, left(query, 100) AS query_head
FROM pg_stat_activity
WHERE datname = current_database() AND state <> 'idle' AND pid <> pg_backend_pid()
ORDER BY xact_start NULLS LAST;

SELECT l.pid, l.mode, l.granted
FROM pg_locks l WHERE l.relation = 'public.interviews'::regclass ORDER BY l.granted;
