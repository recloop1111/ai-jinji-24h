-- ============================================================================
-- pr3a_interview_transcripts_precheck.sql
--   PR-3A 適用「前」の安全確認（読み取りのみ・変更なし）。
--   Supabase SQL Editor / psql で実行し、各結果が期待どおりであることを確認してから
--   pr3a_interview_transcripts.sql を流す。本ファイルは DDL/DML を含まない（SELECT のみ）。
-- ============================================================================

-- 1) FK 参照先 interviews が存在するか（期待: public.interviews が非 NULL）。
SELECT to_regclass('public.interviews')  AS interviews_table;

-- 2) 新テーブルが「まだ無い」ことを確認（期待: NULL = 未適用。非 NULL なら適用済み＝冪等で再実行可）。
SELECT to_regclass('public.interview_transcripts') AS interview_transcripts_table;

-- 3) FK 参照先 interviews(id) の型を確認（期待: uuid。新テーブルの interview_id uuid と一致すること）。
SELECT c.column_name, c.data_type
FROM information_schema.columns c
WHERE c.table_schema = 'public' AND c.table_name = 'interviews' AND c.column_name = 'id';
-- 期待: data_type = 'uuid'。

-- 4) FK 参照先 interviews(id) が PK / UNIQUE で参照可能か（FK は参照先の一意制約が必要）。
SELECT conname, contype, pg_get_constraintdef(oid) AS def
FROM pg_constraint
WHERE conrelid = 'public.interviews'::regclass
  AND contype IN ('p', 'u')
ORDER BY contype;
-- 期待: id を含む primary key（contype='p'）が存在する。

-- 5) applicants.company_id / profiles.company_id / profiles.role の存在（RLS join が成立する前提）。
SELECT table_name, column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND ( (table_name = 'applicants' AND column_name = 'company_id')
     OR (table_name = 'profiles'   AND column_name IN ('id','company_id','role')) )
ORDER BY table_name, column_name;
-- 期待: applicants.company_id / profiles.id / profiles.company_id / profiles.role が揃う。

-- 6) 既存 interview_logs は「温存」対象。現状（存在 / 行数 / 列）を記録（本 PR では触れない）。
SELECT to_regclass('public.interview_logs') AS interview_logs_table;
SELECT count(*) AS interview_logs_row_count FROM public.interview_logs;  -- 期待: 現状値（触れない）
SELECT ordinal_position, column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'interview_logs'
ORDER BY ordinal_position;

-- 7) 名前衝突の確認（新テーブル/索引/policy 名が既存に無いこと）。
SELECT indexname FROM pg_indexes
WHERE schemaname = 'public'
  AND indexname IN ('idx_interview_transcripts_interview_seq',
                    'uq_interview_transcripts_interview_dedup');
-- 期待: 0行（未作成）。

-- 8) 【重要】interviews に対する長時間トランザクション/重いロックが無いか（FK 追加は参照先に一瞬ロックを取る）。
SELECT pid, state,
       now() - xact_start AS xact_age,
       now() - query_start AS query_age,
       left(query, 120)   AS query_head
FROM pg_stat_activity
WHERE datname = current_database()
  AND state <> 'idle'
  AND pid <> pg_backend_pid()
ORDER BY xact_start NULLS LAST;
-- 期待: interviews を長時間掴んでいる実行中クエリが無い（xact_age が短い / 該当なし）。

-- 9) interviews にかかっている重いロックが無いこと。
SELECT l.pid, l.mode, l.granted, left(a.query, 120) AS query_head
FROM pg_locks l
JOIN pg_stat_activity a ON a.pid = l.pid
WHERE l.relation = 'public.interviews'::regclass
ORDER BY l.granted, l.pid;
-- 期待: 重い未付与(granted=false)ロックや長命な排他ロックが無い。
