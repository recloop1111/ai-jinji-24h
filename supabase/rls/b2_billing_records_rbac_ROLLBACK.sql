-- ============================================================================
-- b2_billing_records_rbac_ROLLBACK.sql — b2_billing_records_rbac.sql の逆操作（手動・Production 未適用）
--   B-2 の変更のみを戻す:
--     (a) 新 SELECT policy billing_records_owner_admin_select を撤去し、旧 company_select_billing_records
--         （roles=public / profiles.company_id ベース）を復元。
--     (b) B-2 で最小化した grant を B-2 適用前の状態へ戻す（anon/authenticated に全権限＝permissive に復帰）。
--   ⚠️ 注意: rollback すると recruiter/viewer/anon も billing_records にアクセスできる元の緩い状態へ戻る。
--            運用開始後の安易な rollback は避けること。companies/profiles/company_members には触れない。
-- ============================================================================

BEGIN;

-- (a) SELECT policy を旧定義へ戻す
DROP POLICY IF EXISTS billing_records_owner_admin_select ON public.billing_records;

CREATE POLICY company_select_billing_records ON public.billing_records
  FOR SELECT TO public
  USING (
    company_id IN (
      SELECT profiles.company_id FROM public.profiles WHERE profiles.id = auth.uid()
    )
  );

-- (b) grant を B-2 適用前（permissive）へ復元。forward で service_role も REVOKE ALL したため、
--     開始時 Production snapshot（anon/authenticated/service_role とも全 privilege）を正確に戻す。
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.billing_records TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.billing_records TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.billing_records TO service_role;

COMMIT;
