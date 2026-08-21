-- ============================================================================
-- pr4e3_evaluation_lock_state_ROLLBACK.sql  （巻き戻し・未実行）
--   追加した3列 + CHECK を削除。既存 interviews の他列・データには触れない。
--   app 側は本列が無くても安全（ロック UPDATE がエラーなら fail-closed で評価に進まないだけ・面接フロー非影響）。
--   DROP COLUMN も ACCESS EXCLUSIVE を取るため lock_timeout でガード。
-- ============================================================================

SET lock_timeout = '3s';

BEGIN;

ALTER TABLE public.interviews DROP CONSTRAINT IF EXISTS interviews_evaluation_status_chk;
ALTER TABLE public.interviews
  DROP COLUMN IF EXISTS evaluation_locked_until,
  DROP COLUMN IF EXISTS evaluation_status,
  DROP COLUMN IF EXISTS evaluation_error_code;

COMMIT;

RESET lock_timeout;

-- 確認（期待: 0行 = 列が消えている）。
SELECT column_name FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'interviews'
  AND column_name IN ('evaluation_locked_until', 'evaluation_status', 'evaluation_error_code');
