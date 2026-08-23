-- ============================================================================
-- pr19c_allocate_transcript_seq_fn_ROLLBACK.sql  （巻き戻し・未実行 / CANONICAL seq rollback）
--   採番機能の CANONICAL rollback。「採番 function ＋ 採番列」を両方削除する（順序: function → 列）。
--   → function を先に落とすため、列 DROP 時に function が dangling で壊れる P2-2 の危険がない。
--   → seq 機能全体の rollback は本ファイル 1 本で完結（旧 pr19b rollback は不要＝pr19b は削除済み）。
--   interviews の他列・テーブル・RLS には触れない。app 側は列/function が無くても安全（allocator RPC が
--   エラーなら fail-closed で保存に進まないだけ・gate OFF ＝呼び出し自体が存在しない）。
--   DROP も ACCESS EXCLUSIVE を取るため lock_timeout でガード。
-- ============================================================================

SET lock_timeout = '3s';

BEGIN;

-- 1) 採番 function を削除。
DROP FUNCTION IF EXISTS public.allocate_transcript_seq(uuid);

-- 2) 採番列を削除。
ALTER TABLE public.interviews
  DROP COLUMN IF EXISTS next_transcript_seq;

COMMIT;

RESET lock_timeout;

-- 確認（いずれも期待: 0行 = 消えている）。
SELECT p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'allocate_transcript_seq';

SELECT column_name FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'interviews' AND column_name = 'next_transcript_seq';
