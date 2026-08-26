-- ============================================================================
-- p5_evaluation_lock_state_ROLLBACK.sql
--   p5_evaluation_lock_state.sql の逆操作（additive 列 + CHECK 制約の除去）。
--   ※ 手動SQL・Production 未適用。列は死蔵でも害は無い（NULL 既定）ため通常は revert 不要だが、
--     完全 revert 用に用意する。DROP は評価結果（interview_results）には触れない。
-- ============================================================================
SET lock_timeout = '3s';

BEGIN;

ALTER TABLE public.interviews
  DROP CONSTRAINT IF EXISTS interviews_evaluation_status_chk;

ALTER TABLE public.interviews
  DROP COLUMN IF EXISTS evaluation_locked_until,
  DROP COLUMN IF EXISTS evaluation_status,
  DROP COLUMN IF EXISTS evaluation_error_code,
  DROP COLUMN IF EXISTS evaluation_retry_after,
  DROP COLUMN IF EXISTS evaluation_cooldown_hash;

COMMIT;

RESET lock_timeout;
