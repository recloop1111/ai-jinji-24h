-- ============================================================================
-- p8_otp_state_ROLLBACK.sql
--   p8_otp_state.sql の逆操作（additive 列の除去）。手動SQL・Production 未適用。
--   otp_state は死蔵でも害はない（NULL 既定）ため通常 revert 不要だが、完全 revert 用に用意する。
-- ============================================================================
SET lock_timeout = '3s';

BEGIN;

ALTER TABLE public.interviews
  DROP COLUMN IF EXISTS otp_state;

COMMIT;

RESET lock_timeout;
