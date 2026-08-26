-- ============================================================================
-- p7_1_interview_progress_ROLLBACK.sql
--   p7_1_interview_progress.sql の逆操作（additive 列の除去）。手動SQL・Production 未適用。
--   進行カーソルは死蔵でも害はない（NULL 既定）ため通常 revert 不要だが、完全 revert 用に用意する。
-- ============================================================================
SET lock_timeout = '3s';

BEGIN;

ALTER TABLE public.interviews
  DROP COLUMN IF EXISTS interview_progress;

COMMIT;

RESET lock_timeout;
