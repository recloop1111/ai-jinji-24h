-- ============================================================================
-- e5_1_company_members_test.sql — Phase E-5-1 ローカル統合テスト（schema/CHECK/unique/RLS/backfill）
--   ※ LOCAL 専用。素の postgres:16-alpine で実行可（Supabase ロール/auth.uid() を stub 化）。
--   実行順: この上半分(base stub) → supabase/rls/e5_1_company_members.sql → この下半分(assertions)。
--   Scenario A（各 company に client candidate は1名）。fail-fast（複数候補）は runner の Scenario B で検証。
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

CREATE TABLE public.companies (id uuid primary key default gen_random_uuid(), name text, is_demo boolean default false);
CREATE TABLE public.profiles  (id uuid primary key, company_id uuid, role text);

-- seed: A/B/C, client u1(A)/u2(B), admin u3(A), 非候補 u5(company_id NULL)
INSERT INTO public.companies (id, name) VALUES
  ('11111111-1111-1111-1111-111111111111','CompanyA'),
  ('22222222-2222-2222-2222-222222222222','CompanyB'),
  ('33333333-3333-3333-3333-333333333333','CompanyC');
INSERT INTO public.profiles (id, company_id, role) VALUES
  ('a1000000-0000-0000-0000-0000000000a1','11111111-1111-1111-1111-111111111111', NULL),      -- u1 client(A)
  ('b1000000-0000-0000-0000-0000000000b1','22222222-2222-2222-2222-222222222222', NULL),      -- u2 client(B)
  ('ad000000-0000-0000-0000-0000000000ad','11111111-1111-1111-1111-111111111111','admin'),    -- u3 運営admin(A)
  ('c1000000-0000-0000-0000-0000000000c1', NULL, NULL);                                        -- u5 非候補

-- base grants（company_members の grant は migration が付与）
GRANT SELECT ON public.companies, public.profiles TO authenticated;
GRANT ALL ON public.companies, public.profiles TO service_role;

-- ===== ここで supabase/rls/e5_1_company_members.sql を適用する =====
-- \i supabase/rls/e5_1_company_members.sql

-- ===== [assertions] =====

-- TEST1: table + RLS
DO $$ BEGIN
  IF to_regclass('public.company_members') IS NULL THEN RAISE EXCEPTION 'FAIL: company_members not created'; END IF;
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE relname='company_members') THEN RAISE EXCEPTION 'FAIL: RLS not enabled'; END IF;
  RAISE NOTICE 'TEST1 PASS: table + RLS enabled';
END $$;

-- TEST2: backfill = client u1/u2 が owner/active、admin u3 は非対象
DO $$
DECLARE cnt int; admincnt int; u1role text; u1status text; u1joined timestamptz;
BEGIN
  SELECT count(*) INTO cnt FROM public.company_members;
  IF cnt <> 2 THEN RAISE EXCEPTION 'FAIL: backfill count=% (expected 2)', cnt; END IF;
  SELECT count(*) INTO admincnt FROM public.company_members m JOIN public.profiles p ON p.id=m.user_id WHERE p.role IN ('admin','super_admin');
  IF admincnt <> 0 THEN RAISE EXCEPTION 'FAIL: platform admin backfilled (% rows)', admincnt; END IF;
  SELECT company_role, status, joined_at INTO u1role, u1status, u1joined FROM public.company_members WHERE user_id='a1000000-0000-0000-0000-0000000000a1';
  IF u1role <> 'owner' OR u1status <> 'active' OR u1joined IS NULL THEN RAISE EXCEPTION 'FAIL: u1 owner/active/joined_at'; END IF;
  IF (SELECT full_name FROM public.company_members WHERE user_id='a1000000-0000-0000-0000-0000000000a1') IS NOT NULL THEN RAISE EXCEPTION 'FAIL: full_name should be NULL (no guess)'; END IF;
  RAISE NOTICE 'TEST2 PASS: backfill client→owner/active, admin excluded, full_name NULL';
END $$;

-- TEST3..7: constraints（service_role で INSERT・失敗のみ検証）
SET ROLE service_role;
DO $$ BEGIN
  BEGIN INSERT INTO public.company_members (company_id,user_id,company_role) VALUES ('33333333-3333-3333-3333-333333333333','c1000000-0000-0000-0000-0000000000c1','staff');
        RAISE EXCEPTION 'FAIL: invalid company_role accepted';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'TEST3 PASS: company_role CHECK (owner/admin/recruiter/viewer)';
  END;
  BEGIN INSERT INTO public.company_members (company_id,user_id,company_role,status) VALUES ('33333333-3333-3333-3333-333333333333','c1000000-0000-0000-0000-0000000000c1','viewer','banned');
        RAISE EXCEPTION 'FAIL: invalid status accepted';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'TEST4 PASS: status CHECK (active/suspended/removed)';
  END;
  BEGIN INSERT INTO public.company_members (company_id,user_id,company_role) VALUES ('22222222-2222-2222-2222-222222222222','a1000000-0000-0000-0000-0000000000a1','viewer');
        RAISE EXCEPTION 'FAIL: duplicate user_id accepted';
  EXCEPTION WHEN unique_violation THEN RAISE NOTICE 'TEST5 PASS: UNIQUE(user_id) 1 user=1 company';
  END;
  BEGIN INSERT INTO public.company_members (company_id,user_id,company_role) VALUES ('11111111-1111-1111-1111-111111111111','c1000000-0000-0000-0000-0000000000c1','owner');
        RAISE EXCEPTION 'FAIL: second owner in company accepted';
  EXCEPTION WHEN unique_violation THEN RAISE NOTICE 'TEST6 PASS: partial UNIQUE 1 company=1 OWNER';
  END;
  BEGIN INSERT INTO public.company_members (company_id,user_id,company_role,status) VALUES ('33333333-3333-3333-3333-333333333333','c1000000-0000-0000-0000-0000000000c1','owner','suspended');
        RAISE EXCEPTION 'FAIL: owner+suspended accepted';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'TEST7 PASS: owner must be active CHECK';
  END;
END $$;
RESET ROLE;

-- TEST8: RLS self-select（本人のみ）
SELECT set_config('request.jwt.claims', '{"sub":"a1000000-0000-0000-0000-0000000000a1"}', false);
SET ROLE authenticated;
DO $$
DECLARE own int; others int;
BEGIN
  SELECT count(*) INTO own FROM public.company_members;                    -- 自分の1行のみ見える
  IF own <> 1 THEN RAISE EXCEPTION 'FAIL: self-select expected 1, got %', own; END IF;
  SELECT count(*) INTO others FROM public.company_members WHERE user_id='b1000000-0000-0000-0000-0000000000b1';
  IF others <> 0 THEN RAISE EXCEPTION 'FAIL: can see other member row'; END IF;
  RAISE NOTICE 'TEST8 PASS: RLS self-select only (own membership)';
END $$;

-- TEST9: authenticated は INSERT/UPDATE/DELETE 不可（write policy 無し・grant は SELECT のみ）
DO $$ BEGIN
  BEGIN INSERT INTO public.company_members (company_id,user_id,company_role) VALUES ('33333333-3333-3333-3333-333333333333','c1000000-0000-0000-0000-0000000000c1','viewer');
        RAISE EXCEPTION 'FAIL: authenticated INSERT allowed';
  EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'TEST9a PASS: authenticated INSERT denied';
  END;
  BEGIN UPDATE public.company_members SET company_role='admin' WHERE user_id='a1000000-0000-0000-0000-0000000000a1';
        RAISE EXCEPTION 'FAIL: authenticated UPDATE allowed';
  EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'TEST9b PASS: authenticated UPDATE denied';
  END;
  BEGIN DELETE FROM public.company_members WHERE user_id='a1000000-0000-0000-0000-0000000000a1';
        RAISE EXCEPTION 'FAIL: authenticated DELETE allowed';
  EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'TEST9c PASS: authenticated DELETE denied';
  END;
END $$;
RESET ROLE;

-- TEST10: profiles を変更していない（role/company_id 不変・新列を足していない）
DO $$
DECLARE u1co uuid; u1role text; adrole text; cols int;
BEGIN
  SELECT company_id, role INTO u1co, u1role FROM public.profiles WHERE id='a1000000-0000-0000-0000-0000000000a1';
  IF u1co <> '11111111-1111-1111-1111-111111111111' OR u1role IS NOT NULL THEN RAISE EXCEPTION 'FAIL: profiles u1 mutated'; END IF;
  SELECT role INTO adrole FROM public.profiles WHERE id='ad000000-0000-0000-0000-0000000000ad';
  IF adrole <> 'admin' THEN RAISE EXCEPTION 'FAIL: profiles admin role mutated'; END IF;
  SELECT count(*) INTO cols FROM information_schema.columns WHERE table_schema='public' AND table_name='profiles' AND column_name IN ('company_role','status','full_name');
  IF cols <> 0 THEN RAISE EXCEPTION 'FAIL: profiles gained RBAC columns (SoT 二重化)'; END IF;
  RAISE NOTICE 'TEST10 PASS: profiles unchanged (role/company_id・no new RBAC columns)';
END $$;

-- TEST11: member_invites / company_audit_logs / login_events を今回作っていない
DO $$ BEGIN
  IF to_regclass('public.member_invites') IS NOT NULL THEN RAISE EXCEPTION 'FAIL: member_invites created (should be E-5-3)'; END IF;
  IF to_regclass('public.company_audit_logs') IS NOT NULL THEN RAISE EXCEPTION 'FAIL: company_audit_logs created (should be E-5-4)'; END IF;
  IF to_regclass('public.login_events') IS NOT NULL THEN RAISE EXCEPTION 'FAIL: login_events created (should be E-5-5)'; END IF;
  RAISE NOTICE 'TEST11 PASS: no out-of-scope tables created';
END $$;

SELECT 'ALL_TESTS_DONE' AS result;
