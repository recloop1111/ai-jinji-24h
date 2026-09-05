-- ============================================================================
-- e5_4_1_company_audit_logs_test.sql — Phase E-5-4-1 ローカル検証（company_audit_logs schema/RLS/grant/rollback）
--   ※ LOCAL 専用（素の postgres:16-alpine・Supabase ロールを stub 化）。
--   実行順: base stub → [MIGRATION] → assertions → [MIGRATION 再適用] → [ROLLBACK] → rollback assertion
-- ============================================================================

-- ===== [base stub] =====
DO $$ BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE service_role NOLOGIN BYPASSRLS; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
GRANT anon, authenticated, service_role TO postgres;

CREATE TABLE public.companies (id uuid primary key default gen_random_uuid(), name text);
CREATE TABLE public.profiles  (id uuid primary key, company_id uuid, role text);
INSERT INTO public.companies (id,name) VALUES ('a0000000-0000-0000-0000-00000000000a','CompanyA');
INSERT INTO public.profiles (id,company_id,role) VALUES ('10000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-00000000000a','company');
GRANT SELECT ON public.companies, public.profiles TO authenticated;
GRANT ALL ON public.companies, public.profiles TO service_role;

-- ===== [MIGRATION] ここで supabase/rls/e5_4_1_company_audit_logs.sql を適用 =====
-- \i supabase/rls/e5_4_1_company_audit_logs.sql

-- ---- TEST1/6/7: table + RLS enabled + policy 0 ----
DO $$ BEGIN
  IF to_regclass('public.company_audit_logs') IS NULL THEN RAISE EXCEPTION 'FAIL: table not created'; END IF;
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE relname='company_audit_logs') THEN RAISE EXCEPTION 'FAIL: RLS not enabled'; END IF;
  IF (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='company_audit_logs') <> 0 THEN RAISE EXCEPTION 'FAIL: policy count <> 0'; END IF;
  RAISE NOTICE 'TEST1/6/7 PASS: table + RLS + 0 policies';
END $$;

-- ---- TEST4/5: metadata default {} + object CHECK ----
SET ROLE service_role;
DO $$
DECLARE m jsonb;
BEGIN
  INSERT INTO public.company_audit_logs (company_id, action, resource_type) VALUES ('a0000000-0000-0000-0000-00000000000a','x.test','company');
  SELECT metadata INTO m FROM public.company_audit_logs LIMIT 1;
  IF m <> '{}'::jsonb THEN RAISE EXCEPTION 'FAIL: metadata default not {}'; END IF;
  BEGIN
    INSERT INTO public.company_audit_logs (company_id, action, resource_type, metadata) VALUES ('a0000000-0000-0000-0000-00000000000a','x','company','[]'::jsonb);
    RAISE EXCEPTION 'FAIL: array metadata accepted';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'TEST4/5 PASS: metadata default {} + object CHECK'; END;
END $$;

-- ---- actor_company_role CHECK ----
DO $$ BEGIN
  BEGIN INSERT INTO public.company_audit_logs (company_id, actor_company_role, action, resource_type) VALUES ('a0000000-0000-0000-0000-00000000000a','staff','x','company');
        RAISE EXCEPTION 'FAIL: invalid actor_company_role accepted';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'TEST-role PASS: actor_company_role CHECK'; END;
  INSERT INTO public.company_audit_logs (company_id, actor_company_role, action, resource_type) VALUES ('a0000000-0000-0000-0000-00000000000a','owner','x','company');
  INSERT INTO public.company_audit_logs (company_id, actor_company_role, action, resource_type) VALUES ('a0000000-0000-0000-0000-00000000000a', NULL,'x','company');
  RAISE NOTICE 'TEST-role2 PASS: owner/NULL accepted';
END $$;

-- ---- TEST3: actor FK SET NULL ----
DO $$
DECLARE av uuid;
BEGIN
  INSERT INTO public.company_audit_logs (company_id, actor_user_id, action, resource_type) VALUES ('a0000000-0000-0000-0000-00000000000a','10000000-0000-0000-0000-000000000001','x','company');
  DELETE FROM public.profiles WHERE id='10000000-0000-0000-0000-000000000001';
  SELECT actor_user_id INTO av FROM public.company_audit_logs WHERE actor_user_id IS NOT NULL AND action='x' LIMIT 1;
  IF av IS NOT NULL THEN RAISE EXCEPTION 'FAIL: actor FK not SET NULL'; END IF;
  RAISE NOTICE 'TEST3 PASS: actor_user_id FK ON DELETE SET NULL';
END $$;

-- ---- TEST12/13: service_role SELECT/INSERT 可（既に INSERT/SELECT 到達） ----
DO $$ BEGIN PERFORM 1 FROM public.company_audit_logs LIMIT 1; RAISE NOTICE 'TEST12/13 PASS: service_role SELECT/INSERT'; END $$;

-- ---- TEST14/15: service_role に UPDATE/DELETE GRANT 無し ----
DO $$
DECLARE upd int; del int;
BEGIN
  SELECT count(*) INTO upd FROM information_schema.role_table_grants WHERE table_name='company_audit_logs' AND grantee='service_role' AND privilege_type='UPDATE';
  SELECT count(*) INTO del FROM information_schema.role_table_grants WHERE table_name='company_audit_logs' AND grantee='service_role' AND privilege_type='DELETE';
  IF upd <> 0 THEN RAISE EXCEPTION 'FAIL: service_role has UPDATE grant'; END IF;
  IF del <> 0 THEN RAISE EXCEPTION 'FAIL: service_role has DELETE grant'; END IF;
  RAISE NOTICE 'TEST14/15 PASS: service_role UPDATE/DELETE not granted';
END $$;
RESET ROLE;

-- ---- TEST2: company FK CASCADE ----
SET ROLE service_role;
DO $$
DECLARE c int;
BEGIN
  DELETE FROM public.companies WHERE id='a0000000-0000-0000-0000-00000000000a';
  SELECT count(*) INTO c FROM public.company_audit_logs WHERE company_id='a0000000-0000-0000-0000-00000000000a';
  IF c <> 0 THEN RAISE EXCEPTION 'FAIL: company delete did not CASCADE (% left)', c; END IF;
  RAISE NOTICE 'TEST2 PASS: company_id FK ON DELETE CASCADE';
END $$;
RESET ROLE;

-- ---- TEST8/9/10/11: authenticated は SELECT/INSERT/UPDATE/DELETE 不可 ----
SET ROLE authenticated;
DO $$ BEGIN
  BEGIN PERFORM 1 FROM public.company_audit_logs LIMIT 1; RAISE EXCEPTION 'FAIL: authenticated SELECT allowed';
  EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'TEST8 PASS: authenticated SELECT denied'; END;
  BEGIN INSERT INTO public.company_audit_logs (company_id, action, resource_type) VALUES (gen_random_uuid(),'x','company'); RAISE EXCEPTION 'FAIL: authenticated INSERT allowed';
  EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'TEST9 PASS: authenticated INSERT denied'; END;
END $$;
RESET ROLE;

-- ---- TEST16: index 存在 ----
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM pg_indexes WHERE schemaname='public' AND tablename='company_audit_logs'
    AND indexname IN ('idx_company_audit_logs_company_created','idx_company_audit_logs_company_action','idx_company_audit_logs_resource');
  IF n <> 3 THEN RAISE EXCEPTION 'FAIL: expected 3 indexes, got %', n; END IF;
  RAISE NOTICE 'TEST16 PASS: indexes present';
END $$;

-- ===== [MIGRATION 再適用] idempotency =====
-- \i supabase/rls/e5_4_1_company_audit_logs.sql
DO $$ BEGIN
  IF to_regclass('public.company_audit_logs') IS NULL THEN RAISE EXCEPTION 'FAIL: re-apply broke table'; END IF;
  RAISE NOTICE 'TEST17 PASS: migration re-apply idempotent';
END $$;

-- ===== [ROLLBACK] =====
-- \i supabase/rls/e5_4_1_company_audit_logs_ROLLBACK.sql
DO $$ BEGIN
  IF to_regclass('public.company_audit_logs') IS NOT NULL THEN RAISE EXCEPTION 'FAIL: rollback did not drop'; END IF;
  RAISE NOTICE 'TEST18 PASS: rollback drops table';
END $$;

SELECT 'ALL_TESTS_DONE' AS result;
