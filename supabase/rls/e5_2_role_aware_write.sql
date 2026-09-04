-- ============================================================================
-- e5_2_role_aware_write.sql — 企業RBAC を DB レベルで enforcement（browser-direct write 対策）
--   ※ 手動SQL・**Production 未適用**（別承認・ROLLBACK 同梱: e5_2_role_aware_write_ROLLBACK.sql）。
--   ※ 目的: server route を 403 にしても、authenticated user が Supabase browser client から
--     直接 INSERT/UPDATE/DELETE できる RLS だと VIEWER が RBAC を回避できる。これを DB で塞ぐ。
--   ※ 対象（browser-direct write されるテーブル）: jobs / job_questions / applicants / internal_memos。
--
--   方式 = **RESTRICTIVE write policy を追加**（既存 permissive policy を DROP しない）。
--     - PostgreSQL RLS: permissive は OR、restrictive は AND。restrictive を足すと既存の tenant permissive と AND され、
--       「company 一致（既存）」かつ「active member かつ role∈(owner,admin,recruiter)」の両方を満たす write のみ許可。
--     - **SELECT には restrictive を足さない** → tenant read（VIEWER の閲覧含む）は一切変えない。
--     - 既存 policy 名を知らなくても安全に上乗せできる（DROP による取りこぼしリスクが無い）。
--     - service_role は BYPASSRLS のため影響なし（公開フロー/監査の service-role API は不変）。
--     - 運営 admin（profiles.role∈admin/super_admin）の admin_all_jobs 等を壊さないよう、OR で escape hatch を用意。
--   ※ 企業 role の判定は company_members（cm.user_id=auth.uid() で自己行のみ参照＝自己 self-select policy と一致・非再帰）。
--     SECURITY DEFINER function は追加しない。
-- ============================================================================

BEGIN;

-- 参照する company_members が存在しない環境では意味を持たない（E-5-1 前提）。fail-fast。
DO $$ BEGIN
  IF to_regclass('public.company_members') IS NULL THEN
    RAISE EXCEPTION 'e5_2 aborted: public.company_members が存在しません（先に e5_1_company_members.sql を適用してください）';
  END IF;
END $$;

-- ---- RLS を明示的に有効化（既存で有効。idempotent）----
ALTER TABLE public.jobs           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_questions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.applicants     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.internal_memos ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- jobs（company_id を直接持つ）
--   write 可 = 自社 active member(owner/admin/recruiter) OR 運営admin。
-- ============================================================================
DROP POLICY IF EXISTS jobs_rbac_write_insert ON public.jobs;
CREATE POLICY jobs_rbac_write_insert ON public.jobs AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.company_members cm
             WHERE cm.user_id = auth.uid() AND cm.company_id = jobs.company_id
               AND cm.status = 'active' AND cm.company_role IN ('owner','admin','recruiter'))
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','super_admin'))
  );

DROP POLICY IF EXISTS jobs_rbac_write_update ON public.jobs;
CREATE POLICY jobs_rbac_write_update ON public.jobs AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.company_members cm
             WHERE cm.user_id = auth.uid() AND cm.company_id = jobs.company_id
               AND cm.status = 'active' AND cm.company_role IN ('owner','admin','recruiter'))
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','super_admin'))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.company_members cm
             WHERE cm.user_id = auth.uid() AND cm.company_id = jobs.company_id
               AND cm.status = 'active' AND cm.company_role IN ('owner','admin','recruiter'))
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','super_admin'))
  );

DROP POLICY IF EXISTS jobs_rbac_write_delete ON public.jobs;
CREATE POLICY jobs_rbac_write_delete ON public.jobs AS RESTRICTIVE FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.company_members cm
             WHERE cm.user_id = auth.uid() AND cm.company_id = jobs.company_id
               AND cm.status = 'active' AND cm.company_role IN ('owner','admin','recruiter'))
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','super_admin'))
  );

-- ============================================================================
-- job_questions（company_id を持たず job_id 経由で jobs.company_id に紐づく）
-- ============================================================================
DROP POLICY IF EXISTS job_questions_rbac_write_insert ON public.job_questions;
CREATE POLICY job_questions_rbac_write_insert ON public.job_questions AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.jobs j
              JOIN public.company_members cm ON cm.company_id = j.company_id
             WHERE j.id = job_questions.job_id AND cm.user_id = auth.uid()
               AND cm.status = 'active' AND cm.company_role IN ('owner','admin','recruiter'))
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','super_admin'))
  );

DROP POLICY IF EXISTS job_questions_rbac_write_update ON public.job_questions;
CREATE POLICY job_questions_rbac_write_update ON public.job_questions AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.jobs j
              JOIN public.company_members cm ON cm.company_id = j.company_id
             WHERE j.id = job_questions.job_id AND cm.user_id = auth.uid()
               AND cm.status = 'active' AND cm.company_role IN ('owner','admin','recruiter'))
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','super_admin'))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.jobs j
              JOIN public.company_members cm ON cm.company_id = j.company_id
             WHERE j.id = job_questions.job_id AND cm.user_id = auth.uid()
               AND cm.status = 'active' AND cm.company_role IN ('owner','admin','recruiter'))
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','super_admin'))
  );

DROP POLICY IF EXISTS job_questions_rbac_write_delete ON public.job_questions;
CREATE POLICY job_questions_rbac_write_delete ON public.job_questions AS RESTRICTIVE FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.jobs j
              JOIN public.company_members cm ON cm.company_id = j.company_id
             WHERE j.id = job_questions.job_id AND cm.user_id = auth.uid()
               AND cm.status = 'active' AND cm.company_role IN ('owner','admin','recruiter'))
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','super_admin'))
  );

-- ============================================================================
-- applicants（company_id を直接持つ。client の browser-direct write = 選考ステータス更新 company_update_applicants）
--   SELECT（company_select_applicants / admin_select_applicants）は変更しない＝VIEWER も従来どおり閲覧可。
--   INSERT/DELETE は現状 authenticated に permissive が無く既に不可だが、defense-in-depth で restrictive も付す。
-- ============================================================================
DROP POLICY IF EXISTS applicants_rbac_write_insert ON public.applicants;
CREATE POLICY applicants_rbac_write_insert ON public.applicants AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.company_members cm
             WHERE cm.user_id = auth.uid() AND cm.company_id = applicants.company_id
               AND cm.status = 'active' AND cm.company_role IN ('owner','admin','recruiter'))
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','super_admin'))
  );

DROP POLICY IF EXISTS applicants_rbac_write_update ON public.applicants;
CREATE POLICY applicants_rbac_write_update ON public.applicants AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.company_members cm
             WHERE cm.user_id = auth.uid() AND cm.company_id = applicants.company_id
               AND cm.status = 'active' AND cm.company_role IN ('owner','admin','recruiter'))
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','super_admin'))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.company_members cm
             WHERE cm.user_id = auth.uid() AND cm.company_id = applicants.company_id
               AND cm.status = 'active' AND cm.company_role IN ('owner','admin','recruiter'))
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','super_admin'))
  );

DROP POLICY IF EXISTS applicants_rbac_write_delete ON public.applicants;
CREATE POLICY applicants_rbac_write_delete ON public.applicants AS RESTRICTIVE FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.company_members cm
             WHERE cm.user_id = auth.uid() AND cm.company_id = applicants.company_id
               AND cm.status = 'active' AND cm.company_role IN ('owner','admin','recruiter'))
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','super_admin'))
  );

-- ============================================================================
-- internal_memos（company_id を持たず applicant_id 経由で applicants.company_id に紐づく）
-- ============================================================================
DROP POLICY IF EXISTS internal_memos_rbac_write_insert ON public.internal_memos;
CREATE POLICY internal_memos_rbac_write_insert ON public.internal_memos AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.applicants a
              JOIN public.company_members cm ON cm.company_id = a.company_id
             WHERE a.id = internal_memos.applicant_id AND cm.user_id = auth.uid()
               AND cm.status = 'active' AND cm.company_role IN ('owner','admin','recruiter'))
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','super_admin'))
  );

DROP POLICY IF EXISTS internal_memos_rbac_write_update ON public.internal_memos;
CREATE POLICY internal_memos_rbac_write_update ON public.internal_memos AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.applicants a
              JOIN public.company_members cm ON cm.company_id = a.company_id
             WHERE a.id = internal_memos.applicant_id AND cm.user_id = auth.uid()
               AND cm.status = 'active' AND cm.company_role IN ('owner','admin','recruiter'))
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','super_admin'))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.applicants a
              JOIN public.company_members cm ON cm.company_id = a.company_id
             WHERE a.id = internal_memos.applicant_id AND cm.user_id = auth.uid()
               AND cm.status = 'active' AND cm.company_role IN ('owner','admin','recruiter'))
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','super_admin'))
  );

DROP POLICY IF EXISTS internal_memos_rbac_write_delete ON public.internal_memos;
CREATE POLICY internal_memos_rbac_write_delete ON public.internal_memos AS RESTRICTIVE FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.applicants a
              JOIN public.company_members cm ON cm.company_id = a.company_id
             WHERE a.id = internal_memos.applicant_id AND cm.user_id = auth.uid()
               AND cm.status = 'active' AND cm.company_role IN ('owner','admin','recruiter'))
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','super_admin'))
  );

COMMIT;

-- ----------------------------------------------------------------------------
-- 適用前の READ-ONLY 事前確認（任意・推奨）
--   -- 対象テーブルの現在の write policy（permissive）を把握しておく（restrictive はこれと AND される）:
--   SELECT schemaname, tablename, policyname, permissive, cmd, roles
--     FROM pg_policies
--    WHERE schemaname='public' AND tablename IN ('jobs','job_questions','applicants','internal_memos')
--    ORDER BY tablename, cmd, permissive;
-- 適用後の検証:
--   SELECT tablename, policyname, permissive, cmd FROM pg_policies
--    WHERE schemaname='public' AND policyname LIKE '%_rbac_write_%' ORDER BY tablename, cmd;   -- restrictive=RESTRICTIVE
-- ----------------------------------------------------------------------------
