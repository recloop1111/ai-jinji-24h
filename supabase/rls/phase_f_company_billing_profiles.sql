-- ============================================================================
-- phase_f_company_billing_profiles.sql
--   Phase F: 企業ごとの請求先情報（company_billing_profiles）＋ 請求書スナップショット
--   （billing_records.invoice_snapshot）の追加。
--
-- 【重要】
--   * これは MIGRATION ではない。supabase/migrations には置かない（本番自動適用しない）。
--   * 手動実行専用（運用者が Supabase SQL Editor / psql で意図的に流す）。本ファイルは未実行。
--   * 本番=Preview 同一プロジェクトのため、適用＝本番反映。適用は承認後に行う。
--
-- 目的 / 設計:
--   - 企業は自社の「請求先情報（請求書の宛名）」を登録・更新できる（client/settings）。
--   - 運営(admin/super_admin)は全社の請求先情報を確認・代行編集できる（admin/companies/[id]）。
--   - 請求確定時に billing_records.invoice_snapshot へ { bill_to, issuer, bank } を凍結し、
--     後で企業が請求先を変更しても過去の請求書PDFが変わらないようにする。
--   - PDF生成: 確定済み請求 = invoice_snapshot 優先 / 未確定・プレビュー = profile(live)+billing.ts(live)
--     / profile 未登録 = companies.name / contact_person を fallback。
--
-- 方針（確定）:
--   * 請求先側の登録番号は持たない（インボイスで必須なのは発行者側の登録番号）。
--   * 請求先編集に設定パスワードは不要（機微度低）。
--   * client は請求先正式名称(billing_name)も変更可。
--   * paid 後は invoice_snapshot を writer 側で上書きしない（pending のみ更新）。
--   * authenticated への DELETE grant は付与しない（企業は登録/更新のみ）。service_role は DELETE 可。
-- ============================================================================


-- ----------------------------------------------------------------------------
-- ⓪ 適用前チェック（READ-ONLY・状態を変えない）
-- ----------------------------------------------------------------------------
-- (1) 既に存在しないか（再適用事故防止）
--   SELECT to_regclass('public.company_billing_profiles') AS table_exists;
--   SELECT column_name FROM information_schema.columns
--   WHERE table_schema='public' AND table_name='billing_records' AND column_name='invoice_snapshot';
--
-- (2) 依存テーブルの存在（FK先）
--   SELECT to_regclass('public.companies')        AS companies,
--          to_regclass('public.profiles')         AS profiles,
--          to_regclass('public.billing_records')  AS billing_records;
--
-- (3) 既存 billing_records 列の確認（invoice_snapshot 追加前スナップショット）
--   SELECT column_name, data_type FROM information_schema.columns
--   WHERE table_schema='public' AND table_name='billing_records' ORDER BY ordinal_position;
--
-- 判定: (1) が両方 未作成（NULL/0件）・(2) が全て非NULL であること。


BEGIN;

-- =========================================================
-- A) company_billing_profiles（現在の請求先情報・企業ごと1行）
-- =========================================================
CREATE TABLE IF NOT EXISTS public.company_billing_profiles (
  company_id    uuid PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE,
  billing_name  text,          -- 請求先正式名称（契約会社名と別でも可・client編集可）
  department    text,          -- 部署（任意）
  contact_name  text,          -- 担当者（様）
  contact_email text,
  postal_code   text,
  address       text,
  building      text,
  phone         text,
  note          text,          -- 備考（任意）
  updated_by    uuid REFERENCES public.profiles(id) ON DELETE SET NULL, -- 代行編集者(admin)監査
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
-- ※ 請求先側の登録番号は持たない（方針）。必要時に列追加で対応。

COMMENT ON TABLE public.company_billing_profiles IS
  '企業ごとの請求先情報（請求書の宛名）。確定請求時に billing_records.invoice_snapshot へ凍結する。';

-- =========================================================
-- B) billing_records にスナップショット列（請求先＋発行者＋振込先を凍結）
-- =========================================================
ALTER TABLE public.billing_records
  ADD COLUMN IF NOT EXISTS invoice_snapshot jsonb;
COMMENT ON COLUMN public.billing_records.invoice_snapshot IS
  '確定時の {bill_to, issuer, bank, snapshot_at} 凍結コピー。paid 後は不変（writerで保証）。PDFは確定請求でこれを優先参照。';

-- =========================================================
-- C) RLS（新テーブルのみ。既存は不変）
-- =========================================================
ALTER TABLE public.company_billing_profiles ENABLE ROW LEVEL SECURITY;

-- 企業: 自社行のみ read/write（auth.uid()→profiles.company_id 経由。既存 company スコープと同式）
CREATE POLICY company_all_own_billing_profile ON public.company_billing_profiles
  FOR ALL
  USING (
    company_id IN ( SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid() )
  )
  WITH CHECK (
    company_id IN ( SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid() )
  );

-- admin/super_admin: 全社 read/write（phase_e と同型）
CREATE POLICY admin_all_billing_profile ON public.company_billing_profiles
  FOR ALL
  USING (
    auth.uid() IN (
      SELECT pr.id FROM public.profiles pr
      WHERE pr.id = auth.uid() AND pr.role IN ('admin','super_admin')
    )
  )
  WITH CHECK (
    auth.uid() IN (
      SELECT pr.id FROM public.profiles pr
      WHERE pr.id = auth.uid() AND pr.role IN ('admin','super_admin')
    )
  );

-- =========================================================
-- D) grant/revoke（anon 遮断・authenticated は INSERT/UPDATE/SELECT のみ・service_role は CRUD）
-- =========================================================
REVOKE ALL ON public.company_billing_profiles FROM anon;
-- 企業は登録/更新のみ（DELETE は付与しない）。行制御は RLS。
GRANT  SELECT, INSERT, UPDATE ON public.company_billing_profiles TO authenticated;
-- service_role は RLS を bypass。DELETE も可（運営/メンテ用）。
GRANT  SELECT, INSERT, UPDATE, DELETE ON public.company_billing_profiles TO service_role;
-- ※ invoice_snapshot 列は billing_records 側。billing_records の権限/RLS は既存のまま（変更しない）。

COMMIT;


-- ----------------------------------------------------------------------------
-- ② 適用後の検証（READ-ONLY）
-- ----------------------------------------------------------------------------
-- (A) テーブル・列ができたか
--   SELECT to_regclass('public.company_billing_profiles') AS table_ok;
--   SELECT column_name, data_type FROM information_schema.columns
--   WHERE table_schema='public' AND table_name='company_billing_profiles' ORDER BY ordinal_position;
--   SELECT data_type FROM information_schema.columns
--   WHERE table_schema='public' AND table_name='billing_records' AND column_name='invoice_snapshot';
--
-- (B) RLS ポリシー（2件）と RLS 有効
--   SELECT policyname, cmd, roles FROM pg_policies
--   WHERE schemaname='public' AND tablename='company_billing_profiles' ORDER BY policyname;
--   SELECT relrowsecurity FROM pg_class WHERE oid='public.company_billing_profiles'::regclass;
--
-- (C) grant（anon=0行 / authenticated=SELECT,INSERT,UPDATE / service_role=+DELETE）
--   SELECT grantee, privilege_type FROM information_schema.role_table_grants
--   WHERE table_schema='public' AND table_name='company_billing_profiles'
--     AND grantee IN ('anon','authenticated','service_role')
--   ORDER BY grantee, privilege_type;
--   -- 期待: anon 0行 / authenticated = SELECT,INSERT,UPDATE（DELETEなし）/ service_role = +DELETE


-- ============================================================================
-- ③ ROLLBACK（適用取り消し・承認後）
--   ⚠️ データ（請求先プロファイル・確定済 invoice_snapshot）も削除される点に注意。
-- ============================================================================
-- BEGIN;
--   DROP POLICY IF EXISTS company_all_own_billing_profile ON public.company_billing_profiles;
--   DROP POLICY IF EXISTS admin_all_billing_profile       ON public.company_billing_profiles;
--   DROP TABLE IF EXISTS public.company_billing_profiles;          -- 行データも消える
--   ALTER TABLE public.billing_records DROP COLUMN IF EXISTS invoice_snapshot; -- 確定snapshotも消える
-- COMMIT;
-- ============================================================================
