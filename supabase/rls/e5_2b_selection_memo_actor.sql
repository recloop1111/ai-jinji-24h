-- ============================================================================
-- e5_2b_selection_memo_actor.sql — 選考メモの「最終更新者/最終更新日時」列を追加（additive・非破壊）
--   ※ 手動SQL・**Production 未適用**（別承認・ROLLBACK 同梱: e5_2b_selection_memo_actor_ROLLBACK.sql）。
--   ※ client/admin 共通の単一選考メモ = applicants.selection_memo（既存 TEXT）。本 script は
--     その「誰がいつ更新したか」を残すための2列を applicants へ追加するだけ（本文列・result・selection_status は不変）。
--   ※ 完全 additive: 既存列の削除/書換え無し・既存データ不変・過去分の actor backfill はしない（推測しない＝NULL）。
--   ※ FK は既存の billing_* 監査列（phase_f/phase_g）と同スタイル: profiles(id) ON DELETE SET NULL。
-- ============================================================================

BEGIN;

ALTER TABLE public.applicants
  ADD COLUMN IF NOT EXISTS selection_memo_updated_by uuid
    REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS selection_memo_updated_at timestamptz;

COMMENT ON COLUMN public.applicants.selection_memo_updated_by IS
  '選考メモ(selection_memo)を最後に更新した企業ユーザー profiles(id)。過去分は NULL（backfill しない）。';
COMMENT ON COLUMN public.applicants.selection_memo_updated_at IS
  '選考メモ(selection_memo)の最終更新日時。本文が実際に変わった時のみ更新（result のみ変更では触らない）。';

COMMIT;

-- ----------------------------------------------------------------------------
-- 適用後の検証（READ-ONLY・任意）
--   SELECT column_name, data_type, is_nullable FROM information_schema.columns
--    WHERE table_schema='public' AND table_name='applicants'
--      AND column_name IN ('selection_memo','selection_memo_updated_by','selection_memo_updated_at');
--   -- 既存行はいずれも NULL（backfill していない）:
--   SELECT count(*) FILTER (WHERE selection_memo_updated_by IS NOT NULL) AS actor_set FROM public.applicants;  -- 0
-- ----------------------------------------------------------------------------
