-- ============================================================================
-- e5_2b_selection_memo_actor_ROLLBACK.sql — e5_2b_selection_memo_actor.sql の逆操作（手動・Production 未適用）
--   本 script が追加した2列のみを DROP。selection_memo（本文）・result・selection_status には触れない。
--   ※ rollback 後は「最終更新者/日時」が失われる（本文 selection_memo は残る）。
-- ============================================================================

BEGIN;

ALTER TABLE public.applicants
  DROP COLUMN IF EXISTS selection_memo_updated_by,
  DROP COLUMN IF EXISTS selection_memo_updated_at;

COMMIT;
