-- ============================================================================
-- phase_h_realtime_call_lock_precheck.sql
--   Phase H 適用「前」の安全確認（読み取りのみ・変更なし）。
--   Supabase SQL Editor / psql で実行し、各結果が期待どおりであることを確認してから
--   phase_h_realtime_call_lock.sql を流す。本ファイルは DDL/DML を含まない（SELECT のみ）。
-- ============================================================================

-- 1) 対象テーブルが存在するか（期待: 1行・interviews）。
SELECT to_regclass('public.interviews') AS interviews_table;  -- 期待: public.interviews（NULLでない）

-- 2) 追加予定の列が「まだ無い」ことを確認（期待: 0行 = 未適用。1行なら適用済み＝冪等でOK）。
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'interviews'
  AND column_name = 'realtime_call_locked_until';
-- 期待: 0行（未適用）。

-- 3) 参考: interviews の現在の列一覧（想定外の同名列や型衝突が無いことの目視確認）。
SELECT ordinal_position, column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'interviews'
ORDER BY ordinal_position;

-- 4) 行数（参考値。NULL許容・DEFAULT無しの列追加はメタデータのみで rewrite しないため、
--    行数が多くても所要は一定。巨大テーブルでないことの目視確認用）。
SELECT count(*) AS interviews_row_count FROM public.interviews;

-- 5) 【重要】interviews に対する「長時間の実行中トランザクション/ロック」が無いか。
--    ADD COLUMN は一時的に ACCESS EXCLUSIVE ロックを取るため、既存の長トランザクションが
--    居ると待たされ後続を止め得る。下記が空（または短命）であることを確認してから適用する。
SELECT pid,
       state,
       now() - xact_start AS xact_age,
       now() - query_start AS query_age,
       left(query, 120)   AS query_head
FROM pg_stat_activity
WHERE datname = current_database()
  AND state <> 'idle'
  AND pid <> pg_backend_pid()
ORDER BY xact_start NULLS LAST;
-- 期待: interviews を長時間掴んでいる実行中クエリが無い（xact_age が短い/該当なし）。

-- 6) interviews リレーションに現在かかっているロック（AccessExclusiveLock 等の重いロックが無いこと）。
SELECT l.pid, l.mode, l.granted, left(a.query, 120) AS query_head
FROM pg_locks l
JOIN pg_stat_activity a ON a.pid = l.pid
WHERE l.relation = 'public.interviews'::regclass
ORDER BY l.granted, l.pid;
-- 期待: 重い未付与(granted=false)ロックや長命な排他ロックが無い。
