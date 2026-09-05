-- ============================================================================
-- e5_4b_jobs_questions_write_lockdown.sql
--   E-5-4-B: jobs / job_questions / common_questions の browser-direct write を
--   「運営 admin のみ」に締める（企業ユーザーの browser 直 write を DB で塞ぐ）。
--
--   ※ 手動SQL・**Production 未適用（意図どおり）= POST-DEPLOY migration**（ROLLBACK 同梱: e5_4b_..._ROLLBACK.sql）。
--   ※ 【適用タイミング厳守】このファイルは PR #79（最終完成版）が Production(main) へ deploy され、
--     企業側 jobs/questions が server route 経由（app/api/client/jobs・/questions・/company PATCH）に
--     なったことを確認した「直後」にのみ適用する。deploy 前に適用すると、現行 Production UI は
--     browser 直書きのため、企業ユーザーの求人・質問の作成/編集/公開/削除を破壊する。
--   ※ 依存（適用済み前提）: admin_all_*（phase_e・Production 適用済み確認）が運営admin 代理 write の permissive。
--     e5_2_role_aware_write.sql（Production 適用済み）と併存し、jobs/job_questions は AND で最終的に admin only に収束。
--
--   方式 = **RESTRICTIVE write policy（運営 admin のみ許可）を追加**（既存 permissive を DROP しない）。
--     - PostgreSQL RLS: restrictive は AND。既存 permissive（tenant/admin）と AND され、
--       「運営 admin（profiles.role∈admin/super_admin）」以外の authenticated write は全て拒否。
--     - SELECT には restrictive を足さない → 読み取り（企業ユーザーの閲覧含む）は一切変えない。
--     - service_role は BYPASSRLS → 企業側 server route（service-role）は不変。
--     - admin_all_*（phase_e・運営 admin の browser 代理管理）は restrictive を満たす → 不変。
--     - e5_2_role_aware_write.sql（company role RESTRICTIVE）と併存可（AND され最終的に admin only）。
--   ※ SECURITY DEFINER function は追加しない。company_members は参照しない（admin 判定のみ）。
-- ============================================================================

BEGIN;

DO $$ BEGIN
  IF to_regclass('public.profiles') IS NULL THEN
    RAISE EXCEPTION 'e5_4b aborted: public.profiles が存在しません';
  END IF;
END $$;

ALTER TABLE public.jobs             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_questions    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.common_questions ENABLE ROW LEVEL SECURITY;

-- 運営 admin 判定（restrictive の共通条件）: profiles.role ∈ (admin, super_admin)。
-- 企業ユーザーはこの条件を満たさない → browser 直 write は全て拒否（read は不変）。

-- ---- jobs ----
DROP POLICY IF EXISTS jobs_e54b_write_adminonly_insert ON public.jobs;
CREATE POLICY jobs_e54b_write_adminonly_insert ON public.jobs AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','super_admin')));
DROP POLICY IF EXISTS jobs_e54b_write_adminonly_update ON public.jobs;
CREATE POLICY jobs_e54b_write_adminonly_update ON public.jobs AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','super_admin')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','super_admin')));
DROP POLICY IF EXISTS jobs_e54b_write_adminonly_delete ON public.jobs;
CREATE POLICY jobs_e54b_write_adminonly_delete ON public.jobs AS RESTRICTIVE FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','super_admin')));

-- ---- job_questions ----
DROP POLICY IF EXISTS job_questions_e54b_write_adminonly_insert ON public.job_questions;
CREATE POLICY job_questions_e54b_write_adminonly_insert ON public.job_questions AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','super_admin')));
DROP POLICY IF EXISTS job_questions_e54b_write_adminonly_update ON public.job_questions;
CREATE POLICY job_questions_e54b_write_adminonly_update ON public.job_questions AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','super_admin')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','super_admin')));
DROP POLICY IF EXISTS job_questions_e54b_write_adminonly_delete ON public.job_questions;
CREATE POLICY job_questions_e54b_write_adminonly_delete ON public.job_questions AS RESTRICTIVE FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','super_admin')));

-- ---- common_questions ----
DROP POLICY IF EXISTS common_questions_e54b_write_adminonly_insert ON public.common_questions;
CREATE POLICY common_questions_e54b_write_adminonly_insert ON public.common_questions AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','super_admin')));
DROP POLICY IF EXISTS common_questions_e54b_write_adminonly_update ON public.common_questions;
CREATE POLICY common_questions_e54b_write_adminonly_update ON public.common_questions AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','super_admin')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','super_admin')));
DROP POLICY IF EXISTS common_questions_e54b_write_adminonly_delete ON public.common_questions;
CREATE POLICY common_questions_e54b_write_adminonly_delete ON public.common_questions AS RESTRICTIVE FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','super_admin')));

COMMIT;

-- ----------------------------------------------------------------------------
-- 適用後の検証（READ-ONLY）:
--   SELECT tablename, policyname, permissive, cmd, roles FROM pg_policies
--    WHERE schemaname='public' AND policyname LIKE '%_e54b_write_adminonly_%'
--    ORDER BY tablename, cmd;   -- permissive 列が RESTRICTIVE の 9 行（3表 × insert/update/delete）
-- 期待挙動:
--   - 企業ユーザー（authenticated・profiles.role が admin/super_admin でない）: 3表への INSERT/UPDATE/DELETE 不可。
--   - 運営 admin（profiles.role∈admin/super_admin）: 従来どおり可（admin_all_* permissive AND restrictive=true）。
--   - service_role（企業側 server route）: BYPASSRLS のため不変。
--   - SELECT（企業ユーザーの閲覧・公開フローの service-role 読み）: 変更なし。
-- ----------------------------------------------------------------------------
