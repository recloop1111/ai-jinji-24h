-- ============================================================================
-- b2_billing_records_rbac_test.sql — Billing B-2 ローカル検証（billing_records SELECT RLS ＋ grant 最小化）
--   ※ LOCAL 専用（素の postgres:16-alpine・Supabase ロール/auth.uid() stub）。
--   実行順: base stub（B-2 前の状態を再現）→ [MIGRATION] b2_billing_records_rbac.sql → assertions →
--           [ROLLBACK] b2_billing_records_rbac_ROLLBACK.sql → rollback assertions
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
CREATE TABLE public.company_members (id uuid primary key default gen_random_uuid(), company_id uuid NOT NULL, user_id uuid NOT NULL, company_role text NOT NULL, status text NOT NULL);
CREATE TABLE public.billing_records (id uuid primary key default gen_random_uuid(), company_id uuid NOT NULL, billing_month date, total_jpy int);

-- company A / B、A に owner/admin/recruiter/viewer/suspended、B に owner
INSERT INTO public.companies VALUES ('a0000000-0000-0000-0000-00000000000a','A'),('b0000000-0000-0000-0000-00000000000b','B');
INSERT INTO public.profiles (id, company_id, role) VALUES
  ('10000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-00000000000a','company'),  -- owner A
  ('10000000-0000-0000-0000-000000000002','a0000000-0000-0000-0000-00000000000a','company'),  -- admin A
  ('10000000-0000-0000-0000-000000000003','a0000000-0000-0000-0000-00000000000a','company'),  -- recruiter A
  ('10000000-0000-0000-0000-000000000004','a0000000-0000-0000-0000-00000000000a','company'),  -- viewer A
  ('10000000-0000-0000-0000-000000000005','a0000000-0000-0000-0000-00000000000a','company'),  -- suspended A
  ('20000000-0000-0000-0000-0000000000b1','b0000000-0000-0000-0000-00000000000b','company');  -- owner B
INSERT INTO public.company_members (company_id, user_id, company_role, status) VALUES
  ('a0000000-0000-0000-0000-00000000000a','10000000-0000-0000-0000-000000000001','owner','active'),
  ('a0000000-0000-0000-0000-00000000000a','10000000-0000-0000-0000-000000000002','admin','active'),
  ('a0000000-0000-0000-0000-00000000000a','10000000-0000-0000-0000-000000000003','recruiter','active'),
  ('a0000000-0000-0000-0000-00000000000a','10000000-0000-0000-0000-000000000004','viewer','active'),
  ('a0000000-0000-0000-0000-00000000000a','10000000-0000-0000-0000-000000000005','owner','suspended'),
  ('b0000000-0000-0000-0000-00000000000b','20000000-0000-0000-0000-0000000000b1','owner','active');
INSERT INTO public.billing_records (id, company_id, billing_month, total_jpy) VALUES
  ('c1000000-0000-0000-0000-0000000000c1','a0000000-0000-0000-0000-00000000000a','2026-08-01',13200),
  ('c2000000-0000-0000-0000-0000000000c2','b0000000-0000-0000-0000-00000000000b','2026-08-01',9900);

GRANT SELECT ON public.companies, public.profiles, public.company_members TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
-- B-2 前の状態: billing_records は anon/authenticated に全権限＋public SELECT policy（profiles ベース）
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.billing_records TO anon, authenticated;
ALTER TABLE public.billing_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY company_select_billing_records ON public.billing_records FOR SELECT TO public
  USING (company_id IN (SELECT profiles.company_id FROM public.profiles WHERE profiles.id = auth.uid()));

-- ===== [MIGRATION] b2_billing_records_rbac.sql を適用 =====
-- \i supabase/rls/b2_billing_records_rbac.sql

-- helper: 指定 user で SELECT 可視件数を返す
CREATE OR REPLACE FUNCTION visible_count(uid text) RETURNS int LANGUAGE plpgsql AS $$
DECLARE n int;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', uid)::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO n FROM public.billing_records;
  EXECUTE 'RESET ROLE';
  RETURN n;
END $$;

-- ---- TEST1: owner/admin(自社 active) は自社 record を SELECT 可（1件）----
DO $$ BEGIN
  IF visible_count('10000000-0000-0000-0000-000000000001') <> 1 THEN RAISE EXCEPTION 'FAIL: owner A cannot select'; END IF;
  IF visible_count('10000000-0000-0000-0000-000000000002') <> 1 THEN RAISE EXCEPTION 'FAIL: admin A cannot select'; END IF;
  RAISE NOTICE 'TEST1 PASS: owner/admin own-company SELECT=1';
END $$;

-- ---- TEST2: recruiter/viewer/suspended は 0 件 ----
DO $$ BEGIN
  IF visible_count('10000000-0000-0000-0000-000000000003') <> 0 THEN RAISE EXCEPTION 'FAIL: recruiter can select'; END IF;
  IF visible_count('10000000-0000-0000-0000-000000000004') <> 0 THEN RAISE EXCEPTION 'FAIL: viewer can select'; END IF;
  IF visible_count('10000000-0000-0000-0000-000000000005') <> 0 THEN RAISE EXCEPTION 'FAIL: suspended can select'; END IF;
  RAISE NOTICE 'TEST2 PASS: recruiter/viewer/suspended SELECT=0';
END $$;

-- ---- TEST3: 他社 owner は A の record を見られない（B owner は自社1件のみ）----
DO $$ BEGIN
  IF visible_count('20000000-0000-0000-0000-0000000000b1') <> 1 THEN RAISE EXCEPTION 'FAIL: owner B should see only own (1)'; END IF;
  RAISE NOTICE 'TEST3 PASS: cross-company isolation (owner B sees only B=1)';
END $$;

-- ---- TEST4: anon は SELECT 不可（grant 無し）----
SET ROLE anon;
DO $$ BEGIN
  BEGIN PERFORM 1 FROM public.billing_records LIMIT 1; RAISE EXCEPTION 'FAIL: anon SELECT allowed';
  EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'TEST4 PASS: anon SELECT denied (no grant)'; END;
END $$;
RESET ROLE;

-- ---- TEST5: authenticated は INSERT/UPDATE/DELETE 不可（grant 無し）----
SELECT set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000001"}', false);
SET ROLE authenticated;
DO $$ BEGIN
  BEGIN INSERT INTO public.billing_records (company_id, billing_month, total_jpy) VALUES ('a0000000-0000-0000-0000-00000000000a','2026-09-01',1); RAISE EXCEPTION 'FAIL: authenticated INSERT allowed';
  EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'TEST5a PASS: authenticated INSERT denied'; END;
  BEGIN UPDATE public.billing_records SET total_jpy=1 WHERE id='c1000000-0000-0000-0000-0000000000c1'; RAISE EXCEPTION 'FAIL: authenticated UPDATE allowed';
  EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'TEST5b PASS: authenticated UPDATE denied'; END;
  BEGIN DELETE FROM public.billing_records WHERE id='c1000000-0000-0000-0000-0000000000c1'; RAISE EXCEPTION 'FAIL: authenticated DELETE allowed';
  EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'TEST5c PASS: authenticated DELETE denied'; END;
END $$;
RESET ROLE;

-- ---- TEST6: policy 名・roles・grants ----
DO $$
DECLARE pol int; anon_g int; auth_ins int; auth_sel int;
BEGIN
  SELECT count(*) INTO pol FROM pg_policies WHERE tablename='billing_records' AND policyname='billing_records_owner_admin_select';
  IF pol <> 1 THEN RAISE EXCEPTION 'FAIL: new policy missing'; END IF;
  SELECT count(*) INTO anon_g FROM information_schema.role_table_grants WHERE table_name='billing_records' AND grantee='anon';
  IF anon_g <> 0 THEN RAISE EXCEPTION 'FAIL: anon still has grants (%)', anon_g; END IF;
  SELECT count(*) INTO auth_ins FROM information_schema.role_table_grants WHERE table_name='billing_records' AND grantee='authenticated' AND privilege_type IN ('INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER');
  IF auth_ins <> 0 THEN RAISE EXCEPTION 'FAIL: authenticated still has write grants (%)', auth_ins; END IF;
  SELECT count(*) INTO auth_sel FROM information_schema.role_table_grants WHERE table_name='billing_records' AND grantee='authenticated' AND privilege_type='SELECT';
  IF auth_sel <> 1 THEN RAISE EXCEPTION 'FAIL: authenticated missing SELECT grant'; END IF;
  RAISE NOTICE 'TEST6 PASS: policy renamed + grants minimized (anon 0 / authenticated SELECT-only)';
END $$;

-- ===== [ROLLBACK] =====
-- \i supabase/rls/b2_billing_records_rbac_ROLLBACK.sql
DO $$
DECLARE oldpol int;
BEGIN
  SELECT count(*) INTO oldpol FROM pg_policies WHERE tablename='billing_records' AND policyname='company_select_billing_records';
  IF oldpol <> 1 THEN RAISE EXCEPTION 'FAIL: rollback did not restore old policy'; END IF;
  -- rollback 後は recruiter も見える（旧 profiles ベース）
  IF visible_count('10000000-0000-0000-0000-000000000003') <> 1 THEN RAISE EXCEPTION 'FAIL: rollback should restore recruiter visibility'; END IF;
  RAISE NOTICE 'TEST7 PASS: rollback restores old policy (recruiter visible again)';
END $$;

SELECT 'ALL_TESTS_DONE' AS result;
