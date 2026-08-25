-- ============================================================================
-- p2_transcript_seq_allocator_ROLLBACK.sql
--   Phase P2 の巻き戻し。allocate_transcript_seq 関数と next_transcript_seq 列を削除する。
--   ※ 手動実行専用（未実行）。Production 適用は別承認。
--   ※ 列削除は interviews に ACCESS EXCLUSIVE を一瞬取るため lock_timeout でガード。
-- ============================================================================
SET lock_timeout = '3s';
BEGIN;
DROP FUNCTION IF EXISTS public.allocate_transcript_seq(uuid);
ALTER TABLE public.interviews DROP COLUMN IF EXISTS next_transcript_seq;
COMMIT;
RESET lock_timeout;
SELECT to_regprocedure('public.allocate_transcript_seq(uuid)') AS fn; -- NULL 期待
SELECT count(*) AS next_transcript_seq_col FROM information_schema.columns
 WHERE table_schema='public' AND table_name='interviews' AND column_name='next_transcript_seq'; -- 0 期待
