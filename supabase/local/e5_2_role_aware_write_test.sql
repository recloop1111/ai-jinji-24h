-- ============================================================================
-- e5_2_role_aware_write_test.sql — Phase E-5-2 ローカル統合テスト（role-aware write RLS）
--   ※ LOCAL 専用。素の postgres:16-alpine で実行可（Supabase ロール/auth.uid() を stub 化）。
--   実行順: この上半分(base stub＝production 相当の permissive policy を再現) →
--           supabase/rls/e5_2_role_aware_write.sql → この下半分(assertions)。
--   検証: owner/admin/recruiter=write PASS ／ viewer/suspended=write FAIL ／ SELECT不変 ／ platform admin=write PASS。
-- ============================================================================

-- ===== [base stub] =====
DO $$ BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE service_role NOLOGIN BYPASSRLS; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
GRANT anon, authenticated, service_role TO postgres;

CREATE SCHEMA IF NOT EXISTS auth;
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('request.jwt.claims', true)::jsonb->>'sub','')::uuid
$$;

CREATE TABLE public.companies (id uuid primary key, name text);
CREATE TABLE public.profiles  (id uuid primary key, company_id uuid, role text);
CREATE TABLE public.company_members (
  id uuid primary key default gen_random_uuid(),
  company_id uuid NOT NULL, user_id uuid NOT NULL UNIQUE,
  company_role text NOT NULL, status text NOT NULL DEFAULT 'active'
);
CREATE TABLE public.jobs (id uuid primary key default gen_random_uuid(), company_id uuid NOT NULL, title text, is_active boolean default true);
CREATE TABLE public.job_questions (id uuid primary key default gen_random_uuid(), job_id uuid NOT NULL, pattern_key text default 'default', category text default 'evaluation', question_text text, sort_order int default 1);
CREATE TABLE public.applicants (id uuid primary key default gen_random_uuid(), company_id uuid NOT NULL, selection_status text default 'pending');
CREATE TABLE public.internal_memos (id uuid primary key default gen_random_uuid(), applicant_id uuid NOT NULL, content text, created_by uuid);

-- seed: company A、5 role メンバー + platform admin（membership 無し）
INSERT INTO public.companies (id,name) VALUES ('a0000000-0000-0000-0000-00000000000a','CompanyA');
INSERT INTO public.profiles (id,company_id,role) VALUES
  ('10000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-00000000000a',NULL), -- owner
  ('10000000-0000-0000-0000-000000000002','a0000000-0000-0000-0000-00000000000a',NULL), -- admin(company)
  ('10000000-0000-0000-0000-000000000003','a0000000-0000-0000-0000-00000000000a',NULL), -- recruiter
  ('10000000-0000-0000-0000-000000000004','a0000000-0000-0000-0000-00000000000a',NULL), -- viewer
  ('10000000-0000-0000-0000-000000000005','a0000000-0000-0000-0000-00000000000a',NULL), -- suspended
  ('10000000-0000-0000-0000-0000000000a0', NULL,'admin');                                -- platform admin
INSERT INTO public.company_members (company_id,user_id,company_role,status) VALUES
  ('a0000000-0000-0000-0000-00000000000a','10000000-0000-0000-0000-000000000001','owner','active'),
  ('a0000000-0000-0000-0000-00000000000a','10000000-0000-0000-0000-000000000002','admin','active'),
  ('a0000000-0000-0000-0000-00000000000a','10000000-0000-0000-0000-000000000003','recruiter','active'),
  ('a0000000-0000-0000-0000-00000000000a','10000000-0000-0000-0000-000000000004','viewer','active'),
  ('a0000000-0000-0000-0000-00000000000a','10000000-0000-0000-0000-000000000005','recruiter','suspended');
INSERT INTO public.jobs (id,company_id,title) VALUES ('30000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-00000000000a','既存求人');
INSERT INTO public.job_questions (id,job_id,question_text) VALUES ('31000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','既存質問');
INSERT INTO public.applicants (id,company_id,selection_status) VALUES ('20000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-00000000000a','pending');
INSERT INTO public.internal_memos (id,applicant_id,content) VALUES ('40000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','既存メモ');

-- grants（production 相当: authenticated はコマンド権限を持つ。行は RLS が制御）
GRANT SELECT ON public.companies, public.profiles, public.company_members TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.jobs, public.job_questions, public.applicants, public.internal_memos TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;

-- RLS 有効化 + production 相当の permissive policy（tenant scope by profiles.company_id / self）
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY profiles_self ON public.profiles FOR SELECT TO authenticated USING (id = auth.uid());
ALTER TABLE public.company_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY cm_self ON public.company_members FOR SELECT TO authenticated USING (user_id = auth.uid());

ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY company_all_jobs ON public.jobs FOR ALL TO authenticated
  USING (company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid()))
  WITH CHECK (company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid()));
CREATE POLICY admin_all_jobs ON public.jobs FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','super_admin')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','super_admin')));

ALTER TABLE public.job_questions ENABLE ROW LEVEL SECURITY;
CREATE POLICY company_all_jq ON public.job_questions FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.jobs j WHERE j.id = job_questions.job_id AND j.company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid())))
  WITH CHECK (EXISTS (SELECT 1 FROM public.jobs j WHERE j.id = job_questions.job_id AND j.company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid())));

ALTER TABLE public.applicants ENABLE ROW LEVEL SECURITY;
CREATE POLICY company_select_applicants ON public.applicants FOR SELECT TO authenticated
  USING (company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid()));
CREATE POLICY company_update_applicants ON public.applicants FOR UPDATE TO authenticated
  USING (company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid()))
  WITH CHECK (company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid()));

ALTER TABLE public.internal_memos ENABLE ROW LEVEL SECURITY;
CREATE POLICY company_all_memos ON public.internal_memos FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.applicants a WHERE a.id = internal_memos.applicant_id AND a.company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid())))
  WITH CHECK (EXISTS (SELECT 1 FROM public.applicants a WHERE a.id = internal_memos.applicant_id AND a.company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid())));

-- ===== ここで supabase/rls/e5_2_role_aware_write.sql を適用する =====
-- \i supabase/rls/e5_2_role_aware_write.sql

-- ===== [assertions] =====
-- ヘルパ: role を authenticated + JWT sub にする
--   （psql から SELECT set_config(...) ; SET ROLE authenticated ; ... ; RESET ROLE の形で使う）

-- ---- write-allowed roles: owner / admin(company) / recruiter ----
DO $$
DECLARE r record; n int;
BEGIN
  FOR r IN SELECT * FROM (VALUES
      ('10000000-0000-0000-0000-000000000001','owner'),
      ('10000000-0000-0000-0000-000000000002','admin'),
      ('10000000-0000-0000-0000-000000000003','recruiter')) AS t(uid,label)
  LOOP
    PERFORM set_config('request.jwt.claims', json_build_object('sub', r.uid)::text, true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    -- jobs INSERT
    INSERT INTO public.jobs (company_id,title) VALUES ('a0000000-0000-0000-0000-00000000000a', r.label||'-job');
    -- job_questions INSERT
    INSERT INTO public.job_questions (job_id,question_text) VALUES ('30000000-0000-0000-0000-000000000001', r.label||'-q');
    -- applicants UPDATE
    UPDATE public.applicants SET selection_status='second_interview' WHERE id='20000000-0000-0000-0000-000000000001';
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n <> 1 THEN RAISE EXCEPTION 'FAIL: % applicant update rows=%', r.label, n; END IF;
    -- internal_memos INSERT
    INSERT INTO public.internal_memos (applicant_id,content) VALUES ('20000000-0000-0000-0000-000000000001', r.label||'-memo');
    EXECUTE 'RESET ROLE';
    RAISE NOTICE 'PASS: % write allowed (jobs/job_questions/applicants/memo)', r.label;
  END LOOP;
END $$;

-- ---- viewer: SELECT 可・write 全拒否 ----
DO $$
DECLARE n int; got boolean;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000004"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';

  -- SELECT は可能（read-only 閲覧を壊さない）
  SELECT count(*) > 0 INTO got FROM public.jobs WHERE company_id='a0000000-0000-0000-0000-00000000000a';
  IF NOT got THEN RAISE EXCEPTION 'FAIL: viewer cannot SELECT jobs (read must remain)'; END IF;
  SELECT count(*) > 0 INTO got FROM public.applicants WHERE id='20000000-0000-0000-0000-000000000001';
  IF NOT got THEN RAISE EXCEPTION 'FAIL: viewer cannot SELECT applicants'; END IF;

  -- jobs INSERT 拒否（WITH CHECK 違反 = RLS error）
  BEGIN
    INSERT INTO public.jobs (company_id,title) VALUES ('a0000000-0000-0000-0000-00000000000a','viewer-job');
    RAISE EXCEPTION 'FAIL: viewer INSERT job allowed';
  EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'PASS: viewer job INSERT denied'; END;

  -- job_questions INSERT 拒否
  BEGIN
    INSERT INTO public.job_questions (job_id,question_text) VALUES ('30000000-0000-0000-0000-000000000001','viewer-q');
    RAISE EXCEPTION 'FAIL: viewer INSERT job_question allowed';
  EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'PASS: viewer job_question INSERT denied'; END;

  -- internal_memos INSERT 拒否
  BEGIN
    INSERT INTO public.internal_memos (applicant_id,content) VALUES ('20000000-0000-0000-0000-000000000001','viewer-memo');
    RAISE EXCEPTION 'FAIL: viewer INSERT memo allowed';
  EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'PASS: viewer memo INSERT denied'; END;

  -- applicants UPDATE 拒否（restrictive USING で不可視 → 0 rows）
  UPDATE public.applicants SET selection_status='rejected' WHERE id='20000000-0000-0000-0000-000000000001';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL: viewer UPDATE applicant affected % rows', n; END IF;
  RAISE NOTICE 'PASS: viewer applicant UPDATE 0 rows';

  -- job_questions DELETE 拒否（0 rows）
  DELETE FROM public.job_questions WHERE id='31000000-0000-0000-0000-000000000001';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL: viewer DELETE job_question affected % rows', n; END IF;
  RAISE NOTICE 'PASS: viewer job_question DELETE 0 rows';

  EXECUTE 'RESET ROLE';
END $$;

-- ---- suspended member: write 全拒否 ----
DO $$
DECLARE n int;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000005"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    INSERT INTO public.jobs (company_id,title) VALUES ('a0000000-0000-0000-0000-00000000000a','susp-job');
    RAISE EXCEPTION 'FAIL: suspended INSERT job allowed';
  EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'PASS: suspended job INSERT denied'; END;
  UPDATE public.applicants SET selection_status='rejected' WHERE id='20000000-0000-0000-0000-000000000001';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL: suspended UPDATE applicant affected % rows', n; END IF;
  RAISE NOTICE 'PASS: suspended applicant UPDATE 0 rows';
  EXECUTE 'RESET ROLE';
END $$;

-- ---- platform admin（company membership 無し）: write PASS（admin_all_jobs + restrictive escape hatch）----
DO $$
BEGIN
  PERFORM set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-0000000000a0"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  INSERT INTO public.jobs (company_id,title) VALUES ('a0000000-0000-0000-0000-00000000000a','platform-admin-job');
  EXECUTE 'RESET ROLE';
  RAISE NOTICE 'PASS: platform admin job INSERT allowed (admin_all_jobs preserved)';
END $$;

SELECT 'ALL_TESTS_DONE' AS result;
