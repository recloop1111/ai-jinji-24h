-- ============================================================================
-- pr19b_interviews_transcript_seq_precheck.sql  （適用前・SELECT のみ・未実行）
-- ============================================================================

-- 1) 対象テーブル存在（期待: public.interviews 非 NULL）。
SELECT to_regclass('public.interviews') AS interviews_table;

-- 2) 追加予定列が「まだ無い」こと（期待: 0行）。1行なら適用済み（IF NOT EXISTS で冪等）。
SELECT column_name
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'interviews'
  AND column_name = 'next_transcript_seq';

-- 3) 既存の realtime / evaluation ロック列（同思想の先行実装。参考・スキーマ健全性確認）。
SELECT column_name FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'interviews'
  AND column_name IN ('realtime_call_locked_until', 'evaluation_locked_until');

-- 4) UNIQUE(interview_id, seq) を「追加していない」ことの確認（PR-3A の判断維持。期待: 0行）。
SELECT indexname FROM pg_indexes
WHERE schemaname = 'public' AND tablename = 'interview_transcripts'
  AND indexdef ILIKE '%UNIQUE%' AND indexdef ILIKE '%seq%' AND indexdef NOT ILIKE '%dedup_key%';

-- 5) interviews への長時間 tx / 重いロックが無いこと（ADD COLUMN は一瞬 ACCESS EXCLUSIVE）。
SELECT pid, state, now() - xact_start AS xact_age, left(query, 100) AS query_head
FROM pg_stat_activity
WHERE datname = current_database() AND state <> 'idle' AND pid <> pg_backend_pid()
ORDER BY xact_start NULLS LAST;

SELECT l.pid, l.mode, l.granted
FROM pg_locks l WHERE l.relation = 'public.interviews'::regclass ORDER BY l.granted;
