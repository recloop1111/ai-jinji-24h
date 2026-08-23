-- ============================================================================
-- pr19b_interviews_transcript_seq_ROLLBACK.sql  （巻き戻し・未実行）
--   追加した列 next_transcript_seq のみ削除。interviews の他列・データには触れない。
--   app 側は本列が無くても安全（採番 UPDATE がエラーなら allocator が fail-closed で保存に進ませないだけ・
--   面接フロー非影響。19C 未配線の現時点では呼び出し自体が存在しない）。
--   DROP COLUMN も ACCESS EXCLUSIVE を取るため lock_timeout でガード。
-- ============================================================================

SET lock_timeout = '3s';

BEGIN;

ALTER TABLE public.interviews
  DROP COLUMN IF EXISTS next_transcript_seq;

COMMIT;

RESET lock_timeout;

-- 確認（期待: 0行 = 列が消えている）。
SELECT column_name FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'interviews'
  AND column_name = 'next_transcript_seq';
