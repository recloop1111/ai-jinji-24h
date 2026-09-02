-- ============================================================================
-- p9_applicant_resume_test.sql — Phase B ローカル統合テスト（RPC atomicity + RLS + CHECK + cascade）
--   ※ LOCAL 専用・Production では実行しない。Supabase 非依存の素の Postgres で実行可能
--     （Supabase ロール anon/authenticated/service_role・auth.uid() を stub 化）。
--   実行順: この上半分(base stub) → supabase/rls/p9_applicant_resume.sql → この下半分(assertions)。
--   検証済み(2026-08 / postgres:16-alpine): TEST1..9 全 PASS。RPC は SECURITY INVOKER(prosecdef=false)で
--     service_role から atomic insert 成立・他社の子行不可視・anon/authenticated write不可・cascade。
--     子3テーブルの GRANT は forward(p9) 内の明示 GRANT を検証（この test では masking GRANT を付けない）。
--     gender 省略→no_answer（TEST1）/ rollback preflight meta（TEST9）も検証。
--     legacy education NOT NULL 回帰（TEST10: 省略→23502 / 付与→成功）。applicants.education は実DB同様 NOT NULL。
--     別途 rollback collision（既存 city 列温存）を runner で実証済み。
-- ============================================================================

-- ===== [base stub] （Supabase 相当の最小環境） =====
-- Supabase-like roles
DO $$ BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE service_role NOLOGIN BYPASSRLS; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
GRANT anon, authenticated, service_role TO postgres;

CREATE SCHEMA IF NOT EXISTS auth;
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('request.jwt.claims', true)::jsonb->>'sub','')::uuid
$$;

-- minimal base tables (only what the RPC/RLS touch)
CREATE TABLE public.companies (id uuid primary key default gen_random_uuid(), name text, is_suspended boolean default false, is_demo boolean default false, interview_slug text);
CREATE TABLE public.profiles  (id uuid primary key, company_id uuid, role text);
CREATE TABLE public.jobs      (id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id));
CREATE TABLE public.applicants (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  selection_status text, status text, result text, duplicate_flag boolean default false, inappropriate_flag boolean default false,
  last_name text, first_name text, last_name_kana text, first_name_kana text,
  birth_date date, age int,
  gender text NOT NULL CHECK (gender IN ('male','female','other','no_answer')),  -- 実DBと同じ NOT NULL + CHECK（gender 省略時 fix を検証）
  phone_number text, email text,
  prefecture text,
  education text NOT NULL,  -- ★実DBと同じ NOT NULL（legacy 列）。RPC が education を渡さないと 23502 で atomic rollback する回帰の再現用
  work_history text, qualifications text,  -- work_history/qualifications は実DB nullable のまま
  employment_type text, industry_experience text, job_id uuid,
  created_at timestamptz default now(), updated_at timestamptz default now()
);
-- grants so RLS can be evaluated for authenticated (RLS filters on top)

-- ===== ここで supabase/rls/p9_applicant_resume.sql を適用する =====
-- \i supabase/rls/p9_applicant_resume.sql

-- ===== [assertions] =====
-- grants for the *base* tables only（real Supabase では既存＝ここで付与）。
--   ※ 新規子3テーブルの GRANT は敢えて付けない：forward script(p9) 内の明示 GRANT が正しく効くことを検証するため。
GRANT SELECT ON public.profiles, public.applicants, public.jobs, public.companies TO authenticated;
GRANT ALL ON public.companies, public.jobs, public.profiles, public.applicants TO service_role;

-- seed companies/jobs/profiles/users
INSERT INTO public.companies (id, name) VALUES
  ('11111111-1111-1111-1111-111111111111','CompanyA'),
  ('22222222-2222-2222-2222-222222222222','CompanyB');
INSERT INTO public.jobs (id, company_id) VALUES
  ('aaaa1111-1111-1111-1111-111111111111','11111111-1111-1111-1111-111111111111'),
  ('bbbb2222-2222-2222-2222-222222222222','22222222-2222-2222-2222-222222222222');
INSERT INTO public.profiles (id, company_id, role) VALUES
  ('a0000000-0000-0000-0000-0000000000a1','11111111-1111-1111-1111-111111111111','client'),  -- userA
  ('b0000000-0000-0000-0000-0000000000b1','22222222-2222-2222-2222-222222222222','client'),  -- userB
  ('ad000000-0000-0000-0000-0000000000ad','11111111-1111-1111-1111-111111111111','admin');    -- admin

-- ===== TEST 1: RPC atomic success (as service_role) =====
SET ROLE service_role;
DO $$
DECLARE v uuid;
BEGIN
  v := public.create_applicant_with_resume(
    '11111111-1111-1111-1111-111111111111',
    jsonb_build_object('id','99999999-9999-9999-9999-999999999999','last_name','山田','first_name','太郎','email','a@example.com','phone_number','09000000000','birth_date','2000-06-15','job_id','aaaa1111-1111-1111-1111-111111111111','postal_code','2200012','prefecture','神奈川県','education','university'),
    jsonb_build_array(jsonb_build_object('school_type','university','school_name','A大学','faculty_department','工学部','entered_year_month','2018-04','graduated_year_month','2022-03','graduation_status','graduated','sort_order',99)),
    jsonb_build_array(jsonb_build_object('company_name','X社','joined_year_month','2022-04','is_current',true)),
    jsonb_build_array(jsonb_build_object('name','TOEIC','acquired_year_month','2024-06'))
  );
  IF v = '99999999-9999-9999-9999-999999999999' THEN RAISE EXCEPTION 'FAIL: client applicant_id was used (should be DB-generated)'; END IF;
  IF (SELECT count(*) FROM applicant_educations WHERE applicant_id=v) <> 1 THEN RAISE EXCEPTION 'FAIL: education count'; END IF;
  IF (SELECT count(*) FROM applicant_work_experiences WHERE applicant_id=v) <> 1 THEN RAISE EXCEPTION 'FAIL: work count'; END IF;
  IF (SELECT count(*) FROM applicant_licenses WHERE applicant_id=v) <> 1 THEN RAISE EXCEPTION 'FAIL: license count'; END IF;
  IF (SELECT sort_order FROM applicant_educations WHERE applicant_id=v) <> 0 THEN RAISE EXCEPTION 'FAIL: sort_order not re-numbered'; END IF;
  -- gender 省略（jsonb に gender キー無し）→ NOT NULL CHECK を 'no_answer' で満たす（P1 fix）
  IF (SELECT gender FROM applicants WHERE id=v) <> 'no_answer' THEN RAISE EXCEPTION 'FAIL: omitted gender not mapped to no_answer'; END IF;
  RAISE NOTICE 'TEST1 PASS: atomic create + generated id + sort re-number + gender fallback';
END $$;

-- ===== TEST 2: invalid child -> full rollback (no orphan applicant) =====
DO $$
DECLARE before_ct int; after_ct int;
BEGIN
  SELECT count(*) INTO before_ct FROM applicants;
  BEGIN
    PERFORM public.create_applicant_with_resume(
      '11111111-1111-1111-1111-111111111111',
      jsonb_build_object('last_name','B','first_name','B','email','b@x.com','phone_number','090','education','university'),
      jsonb_build_array(jsonb_build_object('school_type','INVALID_TYPE','school_name','Z')),  -- CHECK violation
      '[]'::jsonb, '[]'::jsonb);
    RAISE EXCEPTION 'FAIL: expected rollback but succeeded';
  EXCEPTION WHEN check_violation THEN NULL; -- expected
  END;
  SELECT count(*) INTO after_ct FROM applicants;
  IF after_ct <> before_ct THEN RAISE EXCEPTION 'FAIL: orphan applicant created (before=% after=%)', before_ct, after_ct; END IF;
  RAISE NOTICE 'TEST2 PASS: invalid child -> full rollback, no orphan';
END $$;

-- ===== TEST 3: company/job mismatch -> reject =====
DO $$
BEGIN
  BEGIN
    PERFORM public.create_applicant_with_resume(
      '11111111-1111-1111-1111-111111111111',
      jsonb_build_object('last_name','C','first_name','C','email','c@x.com','phone_number','090','job_id','bbbb2222-2222-2222-2222-222222222222'), -- job of CompanyB
      '[]'::jsonb,'[]'::jsonb,'[]'::jsonb);
    RAISE EXCEPTION 'FAIL: cross-company job accepted';
  EXCEPTION WHEN others THEN
    IF SQLERRM NOT LIKE '%job does not belong to company%' THEN RAISE EXCEPTION 'FAIL: wrong error: %', SQLERRM; END IF;
  END;
  RAISE NOTICE 'TEST3 PASS: cross-company job rejected';
END $$;
RESET ROLE;

-- ===== TEST 4: RLS tenant isolation (authenticated) =====
-- userA sees only CompanyA children; CompanyB invisible
SELECT set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-0000000000a1"}', false);
SET ROLE authenticated;
DO $$
DECLARE own int; other int;
BEGIN
  SELECT count(*) INTO own FROM applicant_educations;       -- only CompanyA's (from TEST1)
  IF own < 1 THEN RAISE EXCEPTION 'FAIL: userA cannot see own company education'; END IF;
  RAISE NOTICE 'TEST4a PASS: userA sees own (% rows)', own;
END $$;
RESET ROLE;
-- add a CompanyB applicant+education (as service_role) then verify userA can't see it
SET ROLE service_role;
DO $$ BEGIN PERFORM public.create_applicant_with_resume('22222222-2222-2222-2222-222222222222',
  jsonb_build_object('last_name','D','first_name','D','email','d@x.com','phone_number','090','education','high_school'),
  jsonb_build_array(jsonb_build_object('school_type','high_school','school_name','B高校')),'[]'::jsonb,'[]'::jsonb); END $$;
RESET ROLE;
SELECT set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-0000000000a1"}', false);
SET ROLE authenticated;
DO $$
DECLARE b_visible int;
BEGIN
  SELECT count(*) INTO b_visible FROM applicant_educations e JOIN applicants a ON a.id=e.applicant_id WHERE a.company_id='22222222-2222-2222-2222-222222222222';
  IF b_visible <> 0 THEN RAISE EXCEPTION 'FAIL: userA can see CompanyB education (% rows)', b_visible; END IF;
  RAISE NOTICE 'TEST4b PASS: userA cannot see CompanyB (cross-tenant blocked)';
END $$;
RESET ROLE;

-- ===== TEST 5: admin sees all =====
SELECT set_config('request.jwt.claims', '{"sub":"ad000000-0000-0000-0000-0000000000ad"}', false);
SET ROLE authenticated;
DO $$
DECLARE total int;
BEGIN
  SELECT count(*) INTO total FROM applicant_educations;
  IF total < 2 THEN RAISE EXCEPTION 'FAIL: admin should see all educations (got %)', total; END IF;
  RAISE NOTICE 'TEST5 PASS: admin sees all (% rows)', total;
END $$;
RESET ROLE;

-- ===== TEST 6: anon/authenticated INSERT denied + RPC execute denied =====
SET ROLE anon;
DO $$ BEGIN
  BEGIN INSERT INTO applicant_educations (applicant_id, school_type, school_name) VALUES (gen_random_uuid(),'other','hack');
        RAISE EXCEPTION 'FAIL: anon insert allowed';
  EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'TEST6a PASS: anon insert denied';
  END;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-0000000000a1"}', false);
SET ROLE authenticated;
DO $$ BEGIN
  BEGIN INSERT INTO applicant_educations (applicant_id, school_type, school_name) VALUES (gen_random_uuid(),'other','hack');
        RAISE EXCEPTION 'FAIL: authenticated insert allowed';
  EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'TEST6b PASS: authenticated insert denied';
  END;
  BEGIN PERFORM public.create_applicant_with_resume('11111111-1111-1111-1111-111111111111', jsonb_build_object('last_name','x','first_name','x','email','x','phone_number','x'),'[]','[]','[]');
        RAISE EXCEPTION 'FAIL: authenticated executed RPC';
  EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'TEST6c PASS: authenticated cannot execute RPC';
  END;
END $$;
RESET ROLE;

-- ===== TEST 7: cascade delete + CHECK (is_current+left) + security mode =====
SET ROLE service_role;
DO $$
DECLARE v uuid; child_after int;
BEGIN
  v := public.create_applicant_with_resume('11111111-1111-1111-1111-111111111111',
        jsonb_build_object('last_name','E','first_name','E','email','e@x.com','phone_number','090','education','university'),
        jsonb_build_array(jsonb_build_object('school_type','university','school_name','U')),'[]','[]');
  DELETE FROM applicants WHERE id=v;
  SELECT count(*) INTO child_after FROM applicant_educations WHERE applicant_id=v;
  IF child_after <> 0 THEN RAISE EXCEPTION 'FAIL: cascade delete did not remove children'; END IF;
  RAISE NOTICE 'TEST7a PASS: ON DELETE CASCADE works';
END $$;
DO $$ BEGIN
  BEGIN INSERT INTO applicant_work_experiences (applicant_id, company_name, is_current, left_year_month)
        SELECT id,'W',true,'2020-01' FROM applicants LIMIT 1;
        RAISE EXCEPTION 'FAIL: is_current+left accepted';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'TEST7b PASS: is_current+left CHECK rejects';
  END;
  BEGIN INSERT INTO applicant_educations (applicant_id, school_type, school_name, entered_year_month)
        SELECT id,'other','S','2020-13' FROM applicants LIMIT 1;
        RAISE EXCEPTION 'FAIL: bad year-month accepted';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'TEST7c PASS: year-month CHECK rejects';
  END;
END $$;
RESET ROLE;
-- security mode = INVOKER (prosecdef false)
DO $$
DECLARE secdef boolean;
BEGIN
  SELECT prosecdef INTO secdef FROM pg_proc WHERE proname='create_applicant_with_resume';
  IF secdef THEN RAISE EXCEPTION 'FAIL: RPC is SECURITY DEFINER (must be INVOKER)'; END IF;
  RAISE NOTICE 'TEST8 PASS: RPC is SECURITY INVOKER (prosecdef=false)';
END $$;

-- ===== TEST 9: rollback preflight meta recorded new columns (preexisted=false) =====
DO $$
DECLARE recorded int; wrong int;
BEGIN
  IF to_regclass('public._p9_resume_migration_meta') IS NULL THEN RAISE EXCEPTION 'FAIL: meta table missing'; END IF;
  SELECT count(*) INTO recorded FROM public._p9_resume_migration_meta;
  IF recorded <> 10 THEN RAISE EXCEPTION 'FAIL: meta should record 10 columns (got %)', recorded; END IF;
  -- base applicants にこれら列は無かった → 全て preexisted=false であるべき
  SELECT count(*) INTO wrong FROM public._p9_resume_migration_meta WHERE preexisted <> false;
  IF wrong <> 0 THEN RAISE EXCEPTION 'FAIL: % columns wrongly flagged preexisted=true', wrong; END IF;
  RAISE NOTICE 'TEST9 PASS: rollback meta recorded 10 new columns (preexisted=false)';
END $$;

-- ===== TEST 10: legacy education NOT NULL 回帰（Prod と同等制約）=====
--   education を渡さない RPC は 23502 で失敗（＝実障害の再現）。渡せば成功（＝route 修正後の経路）。
SET ROLE service_role;
DO $$
DECLARE v uuid;
BEGIN
  -- (a) education 省略 → not_null_violation（バグ再現）
  BEGIN
    PERFORM public.create_applicant_with_resume('11111111-1111-1111-1111-111111111111',
      jsonb_build_object('last_name','F','first_name','F','email','f@x.com','phone_number','090'),
      '[]','[]','[]');
    RAISE EXCEPTION 'FAIL: education 省略でも INSERT が通ってしまった（NOT NULL 未再現）';
  EXCEPTION WHEN not_null_violation THEN RAISE NOTICE 'TEST10a PASS: education 省略は not_null_violation（実障害を再現）';
  END;
  -- (b) education を渡す（route 修正後 deriveLegacyEducation 相当）→ 成功
  v := public.create_applicant_with_resume('11111111-1111-1111-1111-111111111111',
    jsonb_build_object('last_name','F','first_name','F','email','f@x.com','phone_number','090','education','university'),
    '[]','[]','[]');
  IF (SELECT education FROM applicants WHERE id=v) <> 'university' THEN RAISE EXCEPTION 'FAIL: education が保存されていない'; END IF;
  RAISE NOTICE 'TEST10b PASS: education を渡すと保存成功（route 修正後の経路）';
END $$;
RESET ROLE;

SELECT 'ALL_TESTS_DONE' AS result;
