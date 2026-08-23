-- ============================================================================
-- pr19c_allocate_transcript_seq_fn_precheck.sql  （適用前・SELECT のみ・未実行）
-- ============================================================================

-- 1) 対象テーブル存在（期待: public.interviews 非 NULL）。
SELECT to_regclass('public.interviews') AS interviews_table;

-- 2) 採番列の現状（未適用なら 0 行 / 適用済なら 1 行）。本 pr19c が canonical（列＋function を自己完結で作成）。
--    ※ 旧 pr19b_interviews_transcript_seq*.sql は本ファイルへ統合され SUPERSEDED＝削除済み。pr19b は流さない。
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'interviews' AND column_name = 'next_transcript_seq';

-- 3) 採番 function が「まだ無い」こと（期待: 0行）。CREATE OR REPLACE で冪等。
SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'allocate_transcript_seq';

-- 4) service_role ロールが存在すること（EXECUTE grant 先。期待: 1行）。
SELECT rolname FROM pg_roles WHERE rolname = 'service_role';

-- 4b) 【PR-19F / P1-1 参考】現状 service_role が interviews を直接 UPDATE できるか（read-only introspection）。
--     本 function は SECURITY DEFINER のため採番はこの grant に依存しないが、既存 /end route 等が
--     service-role で interviews を UPDATE している事実（= true 期待）を明示的に確認する。
SELECT has_table_privilege('service_role', 'public.interviews', 'UPDATE') AS service_role_can_update_interviews; -- 参考: 期待 true

-- 4c) 本 function を実行する owner 候補（migration 実行ロール）が interviews を UPDATE できること（DEFINER の前提）。
--     Supabase では通常 postgres / supabase_admin。current_user が owner になる（CREATE FUNCTION 実行者）。
SELECT current_user AS will_be_function_owner,
       has_table_privilege(current_user, 'public.interviews', 'UPDATE') AS owner_can_update_interviews; -- 期待 true

-- 5) 既存の原子的 function パターン（参考・auth_throttle_*）が存在＝同方式の前例確認。
SELECT p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname LIKE 'auth_throttle_%'
ORDER BY p.proname;

-- 6) interviews への長時間 tx / 重いロックが無いこと（ADD COLUMN は一瞬 ACCESS EXCLUSIVE）。
SELECT pid, state, now() - xact_start AS xact_age, left(query, 100) AS query_head
FROM pg_stat_activity
WHERE datname = current_database() AND state <> 'idle' AND pid <> pg_backend_pid()
ORDER BY xact_start NULLS LAST;
