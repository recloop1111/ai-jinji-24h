-- ============================================================================
-- pr19c_allocate_transcript_seq_fn_precheck.sql  （適用前・SELECT のみ・未実行）
-- ============================================================================

-- 1) 対象テーブル存在（期待: public.interviews 非 NULL）。
SELECT to_regclass('public.interviews') AS interviews_table;

-- 2) 採番列の現状（未適用なら 0 行 / PR-19B 適用済なら 1 行）。IF NOT EXISTS で冪等。
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'interviews' AND column_name = 'next_transcript_seq';

-- 3) 採番 function が「まだ無い」こと（期待: 0行）。CREATE OR REPLACE で冪等。
SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'allocate_transcript_seq';

-- 4) service_role ロールが存在すること（grant 先。期待: 1行）。
SELECT rolname FROM pg_roles WHERE rolname = 'service_role';

-- 5) 既存の原子的 function パターン（参考・auth_throttle_*）が存在＝同方式の前例確認。
SELECT p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname LIKE 'auth_throttle_%'
ORDER BY p.proname;

-- 6) interviews への長時間 tx / 重いロックが無いこと（ADD COLUMN は一瞬 ACCESS EXCLUSIVE）。
SELECT pid, state, now() - xact_start AS xact_age, left(query, 100) AS query_head
FROM pg_stat_activity
WHERE datname = current_database() AND state <> 'idle' AND pid <> pg_backend_pid()
ORDER BY xact_start NULLS LAST;
