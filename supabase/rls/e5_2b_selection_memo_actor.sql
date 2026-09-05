-- ============================================================================
-- e5_2b_selection_memo_actor.sql — 選考メモ本体＋「最終更新者/最終更新日時」列を追加（additive・非破壊・idempotent）
--   ※ 手動SQL。**Production は3列とも適用済み**（selection_memo は Human QA 前に手動 ADD 済／actor 2列は
--     E-5-2B-1 で適用済）。本 script は再適用しても ADD COLUMN IF NOT EXISTS で安全（no-op）。
--   ※ SoT 是正（E-5-2B-2）: 従来 selection_memo は docs/MIGRATION_SQL.md にしか記載が無く、実行可能な
--     supabase/ SQL に無かったため「repo から再現できる schema」に selection_memo が欠けていた（drift）。
--     本 script に selection_memo の ADD を含め、新規環境でも repo だけで3列が揃うようにする。
--   ※ client/admin 共通の単一選考メモ = applicants.selection_memo（TEXT・NULL可）。最大2000文字は application
--     validation（DB CHECK は設けない）。actor 2列はその「誰がいつ更新したか」を残す。
--   ※ 完全 additive/idempotent: 既存列の削除/書換え無し・既存 selection_memo 内容は不変・過去分 actor は
--     backfill しない（推測しない＝NULL）。result / selection_status には触れない。
--   ※ FK は既存の billing_* 監査列（phase_f/phase_g）と同スタイル: profiles(id) ON DELETE SET NULL。
-- ============================================================================

BEGIN;

ALTER TABLE public.applicants
  -- 本体（既存環境では IF NOT EXISTS で no-op＝内容を絶対に書き換えない）
  ADD COLUMN IF NOT EXISTS selection_memo text,
  -- 最終更新者/日時
  ADD COLUMN IF NOT EXISTS selection_memo_updated_by uuid
    REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS selection_memo_updated_at timestamptz;

COMMENT ON COLUMN public.applicants.selection_memo IS
  '企業・運営管理画面で共有する応募者ごとの単一選考メモ（TEXT・NULL可）。最大2000文字は application validation。';
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
