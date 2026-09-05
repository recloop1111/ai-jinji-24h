-- ============================================================================
-- e5_3_1_member_invites_test.sql — Phase E-5-3-1 ローカル検証（member_invites schema/constraint/RLS/rollback）
--   ※ LOCAL 専用（素の postgres:16-alpine・Supabase ロールを stub 化）。
--   実行順: 上半分(base stub) → [MIGRATION] e5_3_1_member_invites.sql → assertions →
--           [MIGRATION 再適用](idempotency) → [ROLLBACK] e5_3_1_member_invites_ROLLBACK.sql → rollback assertions
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

-- ===== [MIGRATION] ここで supabase/rls/e5_3_1_member_invites.sql を適用 =====
-- \i supabase/rls/e5_3_1_member_invites.sql

-- ---- TEST1/11: table 作成 + RLS 有効 ----
DO $$ BEGIN
  IF to_regclass('public.member_invites') IS NULL THEN RAISE EXCEPTION 'FAIL: member_invites not created'; END IF;
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE relname='member_invites') THEN RAISE EXCEPTION 'FAIL: RLS not enabled'; END IF;
  IF (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='member_invites') <> 0 THEN
    RAISE EXCEPTION 'FAIL: unexpected policy on member_invites (should be 0)'; END IF;
  RAISE NOTICE 'TEST1/11 PASS: table + RLS enabled + 0 policies';
END $$;

-- ---- TEST3/4/5/6: CHECK 制約（owner 拒否 / admin,recruiter,viewer 許可 / status / token_hash NOT NULL） ----
SET ROLE service_role;
DO $$ BEGIN
  BEGIN INSERT INTO public.member_invites (company_id,email,company_role,token_hash,expires_at)
        VALUES ('a0000000-0000-0000-0000-00000000000a','x@e.com','owner','h_owner', now()+interval '7 day');
        RAISE EXCEPTION 'FAIL: owner invite accepted';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'TEST3 PASS: owner invite rejected'; END;

  INSERT INTO public.member_invites (company_id,email,company_role,token_hash,expires_at) VALUES
    ('a0000000-0000-0000-0000-00000000000a','admin@e.com','admin','h_admin', now()+interval '7 day'),
    ('a0000000-0000-0000-0000-00000000000a','rec@e.com','recruiter','h_rec', now()+interval '7 day'),
    ('a0000000-0000-0000-0000-00000000000a','view@e.com','viewer','h_view', now()+interval '7 day');
  RAISE NOTICE 'TEST4 PASS: admin/recruiter/viewer accepted';

  BEGIN INSERT INTO public.member_invites (company_id,email,company_role,status,token_hash,expires_at)
        VALUES ('a0000000-0000-0000-0000-00000000000a','y@e.com','viewer','banned','h_y', now()+interval '7 day');
        RAISE EXCEPTION 'FAIL: invalid status accepted';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'TEST5 PASS: status CHECK'; END;

  BEGIN INSERT INTO public.member_invites (company_id,email,company_role,expires_at)
        VALUES ('a0000000-0000-0000-0000-00000000000a','z@e.com','viewer', now()+interval '7 day');
        RAISE EXCEPTION 'FAIL: null token_hash accepted';
  EXCEPTION WHEN not_null_violation THEN RAISE NOTICE 'TEST6 PASS: token_hash NOT NULL'; END;
END $$;

-- ---- TEST7: token_hash unique ----
DO $$ BEGIN
  BEGIN INSERT INTO public.member_invites (company_id,email,company_role,token_hash,expires_at)
        VALUES ('a0000000-0000-0000-0000-00000000000a','dup@e.com','viewer','h_admin', now()+interval '7 day');
        RAISE EXCEPTION 'FAIL: duplicate token_hash accepted';
  EXCEPTION WHEN unique_violation THEN RAISE NOTICE 'TEST7 PASS: token_hash unique'; END;
END $$;

-- ---- TEST8/9: 同一 company+email の pending 重複拒否 / accepted 後に新 pending 可 ----
DO $$ BEGIN
  BEGIN INSERT INTO public.member_invites (company_id,email,company_role,token_hash,expires_at)
        VALUES ('a0000000-0000-0000-0000-00000000000a','admin@e.com','recruiter','h_admin2', now()+interval '7 day');
        RAISE EXCEPTION 'FAIL: duplicate pending (company,email) accepted';
  EXCEPTION WHEN unique_violation THEN RAISE NOTICE 'TEST8 PASS: pending(company,email) unique'; END;

  -- admin@e.com の pending を accepted に遷移 → 新しい pending を作れる
  UPDATE public.member_invites SET status='accepted', accepted_at=now() WHERE email='admin@e.com' AND status='pending';
  INSERT INTO public.member_invites (company_id,email,company_role,token_hash,expires_at)
    VALUES ('a0000000-0000-0000-0000-00000000000a','admin@e.com','viewer','h_admin3', now()+interval '7 day');
  RAISE NOTICE 'TEST9 PASS: accepted 後に新 pending 作成可（partial unique）';
END $$;

-- ---- TEST10: invited_by FK SET NULL ----
DO $$
DECLARE ib uuid;
BEGIN
  UPDATE public.member_invites SET invited_by='10000000-0000-0000-0000-000000000001' WHERE email='rec@e.com';
  DELETE FROM public.profiles WHERE id='10000000-0000-0000-0000-000000000001';
  SELECT invited_by INTO ib FROM public.member_invites WHERE email='rec@e.com';
  IF ib IS NOT NULL THEN RAISE EXCEPTION 'FAIL: invited_by not SET NULL on profile delete'; END IF;
  RAISE NOTICE 'TEST10 PASS: invited_by FK ON DELETE SET NULL';
END $$;
RESET ROLE;

-- ---- TEST2: company_id FK CASCADE（company 削除で invite も消える） ----
SET ROLE service_role;
DO $$
DECLARE cnt int;
BEGIN
  DELETE FROM public.companies WHERE id='a0000000-0000-0000-0000-00000000000a';
  SELECT count(*) INTO cnt FROM public.member_invites WHERE company_id='a0000000-0000-0000-0000-00000000000a';
  IF cnt <> 0 THEN RAISE EXCEPTION 'FAIL: company delete did not CASCADE invites (% left)', cnt; END IF;
  RAISE NOTICE 'TEST2 PASS: company_id FK ON DELETE CASCADE';
END $$;
RESET ROLE;

-- ---- TEST12/13: authenticated は SELECT/INSERT/UPDATE/DELETE 不可（GRANT 無し・policy 無し） ----
SET ROLE authenticated;
DO $$ BEGIN
  BEGIN PERFORM 1 FROM public.member_invites LIMIT 1;
        RAISE EXCEPTION 'FAIL: authenticated SELECT allowed';
  EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'TEST12 PASS: authenticated SELECT denied'; END;
  BEGIN INSERT INTO public.member_invites (company_id,email,company_role,token_hash,expires_at)
        VALUES (gen_random_uuid(),'a@e.com','viewer','h_auth', now()+interval '1 day');
        RAISE EXCEPTION 'FAIL: authenticated INSERT allowed';
  EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'TEST13a PASS: authenticated INSERT denied'; END;
END $$;
RESET ROLE;

-- ---- TEST14: service_role は操作可（既に上で INSERT/UPDATE/DELETE 済＝到達している） ----
DO $$ BEGIN RAISE NOTICE 'TEST14 PASS: service_role operations succeeded above'; END $$;

-- ===== [MIGRATION 再適用] idempotency =====
-- \i supabase/rls/e5_3_1_member_invites.sql
DO $$ BEGIN
  IF to_regclass('public.member_invites') IS NULL THEN RAISE EXCEPTION 'FAIL: re-apply broke table'; END IF;
  RAISE NOTICE 'TEST15 PASS: migration 再適用 idempotent';
END $$;

-- ===== [ROLLBACK] =====
-- \i supabase/rls/e5_3_1_member_invites_ROLLBACK.sql
DO $$ BEGIN
  IF to_regclass('public.member_invites') IS NOT NULL THEN RAISE EXCEPTION 'FAIL: rollback did not drop table'; END IF;
  RAISE NOTICE 'TEST16 PASS: rollback drops member_invites';
END $$;

SELECT 'ALL_TESTS_DONE' AS result;
