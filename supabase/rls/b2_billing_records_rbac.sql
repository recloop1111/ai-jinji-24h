-- ============================================================================
-- b2_billing_records_rbac.sql — billing_records の閲覧 RLS を company_members RBAC 基準へ（Billing B-2）
--   ※ 手動SQL・**Production 未適用**（別承認・ROLLBACK 同梱: b2_billing_records_rbac_ROLLBACK.sql）。
--   ※ 現状（Production）: policy `company_select_billing_records`（roles=public / SELECT / PERMISSIVE）は
--       company_id IN (SELECT company_id FROM profiles WHERE id=auth.uid()) ＝ role/status を見ないため
--       同一 company の recruiter/viewer も billing_records を SELECT できる。
--     さらに anon/authenticated に SELECT/INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER が付与されている。
--   ※ 本 script で: (a) 旧 SELECT policy を company_members(owner/admin, active) 基準へ置換、
--       (b) table grant を最小化（authenticated=SELECT のみ・anon=なし・service_role は維持）。
--     → owner/admin(自社・active) のみ SELECT 可。recruiter/viewer/suspended/removed/他社/anon は不可。
--   ※ 書き込みは server(service-role) のみ（batch/admin）。RLS だけでなく table privilege も最小化する多層防御。
-- ============================================================================

BEGIN;

-- (a) SELECT policy を置換（旧 public/profiles ベース → authenticated/company_members ベース）
DROP POLICY IF EXISTS company_select_billing_records ON public.billing_records;

CREATE POLICY billing_records_owner_admin_select ON public.billing_records
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.company_members cm
       WHERE cm.user_id = auth.uid()
         AND cm.company_id = billing_records.company_id
         AND cm.status = 'active'
         AND cm.company_role IN ('owner', 'admin')
    )
  );

-- (b) table 権限の最小化（RLS と併用の多層防御）。
--   anon: billing_records に権限不要。authenticated: SELECT のみ（INSERT/UPDATE/DELETE/TRUNCATE/TRIGGER/REFERENCES は剥奪）。
--   service_role: server/batch/admin が使うため維持（明示 GRANT）。
REVOKE ALL ON public.billing_records FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.billing_records TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.billing_records TO service_role;

COMMIT;

-- ----------------------------------------------------------------------------
-- 適用後の検証（READ-ONLY・任意）
--   -- RLS 有効 / policy 名・roles・cmd・qual:
--   SELECT relrowsecurity FROM pg_class WHERE relname='billing_records';  -- true
--   SELECT policyname, roles, cmd, qual FROM pg_policies
--     WHERE schemaname='public' AND tablename='billing_records';
--   -- 期待: billing_records_owner_admin_select / {authenticated} / SELECT /
--   --       EXISTS(... company_members ... status='active' ... company_role IN ('owner','admin'))
--   -- grants（anon 0件 / authenticated=SELECT のみ / service_role=SELECT,INSERT,UPDATE,DELETE）:
--   SELECT grantee, privilege_type FROM information_schema.role_table_grants
--     WHERE table_schema='public' AND table_name='billing_records'
--       AND grantee IN ('anon','authenticated','service_role') ORDER BY grantee, privilege_type;
-- ----------------------------------------------------------------------------
