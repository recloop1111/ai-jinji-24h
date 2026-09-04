-- ============================================================================
-- e5_2b_selection_memo_actor_ROLLBACK.sql — e5_2b_selection_memo_actor.sql の逆操作（手動・Production 未適用）
--   本 script は **actor 2列のみ** を DROP する。
--   ※ selection_memo（本文）は **意図的に DROP しない**。理由:
--     - selection_memo は E-5-2B-2 以前から存在する環境（Production を含む）があり、無条件 DROP は
--       既存の選考メモ本文を失う破壊操作になる。「完全な逆操作」より **既存データ保護を優先**する。
--     - selection_memo 本体を戻したい場合のみ、バックアップの上で別途手動 DROP すること。
--   ※ result / selection_status にも触れない。
-- ============================================================================

BEGIN;

ALTER TABLE public.applicants
  DROP COLUMN IF EXISTS selection_memo_updated_by,
  DROP COLUMN IF EXISTS selection_memo_updated_at;

-- 注意: selection_memo は data loss 防止のため DROP しない（上記コメント参照）。

COMMIT;
