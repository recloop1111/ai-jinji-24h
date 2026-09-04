-- ============================================================================
-- e5_2b_selection_memo_actor_test.sql — Phase E-5-2B-1 ローカル検証（actor 列の additive/非破壊）
--   ※ LOCAL 専用（素の postgres:16-alpine）。
--   実行順: この上半分(base stub) → supabase/rls/e5_2b_selection_memo_actor.sql → この下半分(assertions)。
-- ============================================================================

-- ===== [base stub] =====
CREATE TABLE public.profiles (id uuid primary key, company_id uuid, role text);
CREATE TABLE public.applicants (
  id uuid primary key default gen_random_uuid(),
  company_id uuid NOT NULL,
  result text DEFAULT '未対応',
  selection_status text DEFAULT 'pending',
  selection_memo text
);

INSERT INTO public.profiles (id, company_id, role) VALUES
  ('10000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-00000000000a', NULL);
-- 既存応募者: result/selection_memo は既に値を持つ（migration で不変であることを検証）
INSERT INTO public.applicants (id, company_id, result, selection_status, selection_memo) VALUES
  ('20000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-00000000000a','検討中','considering','既存の選考メモ本文');

-- ===== ここで supabase/rls/e5_2b_selection_memo_actor.sql を適用する =====
-- \i supabase/rls/e5_2b_selection_memo_actor.sql

-- ===== [assertions] =====

-- TEST1/2: 2列が追加されている（型も確認）
DO $$
DECLARE by_type text; at_type text;
BEGIN
  SELECT data_type INTO by_type FROM information_schema.columns
   WHERE table_schema='public' AND table_name='applicants' AND column_name='selection_memo_updated_by';
  SELECT data_type INTO at_type FROM information_schema.columns
   WHERE table_schema='public' AND table_name='applicants' AND column_name='selection_memo_updated_at';
  IF by_type IS NULL THEN RAISE EXCEPTION 'FAIL: selection_memo_updated_by not added'; END IF;
  IF by_type <> 'uuid' THEN RAISE EXCEPTION 'FAIL: selection_memo_updated_by type=% (expected uuid)', by_type; END IF;
  IF at_type IS NULL THEN RAISE EXCEPTION 'FAIL: selection_memo_updated_at not added'; END IF;
  IF at_type NOT LIKE 'timestamp%' THEN RAISE EXCEPTION 'FAIL: selection_memo_updated_at type=% (expected timestamptz)', at_type; END IF;
  RAISE NOTICE 'TEST1/2 PASS: actor 2列 added (uuid / timestamptz)';
END $$;

-- TEST3/4: FK が profiles(id) ON DELETE SET NULL
DO $$
DECLARE rule text; ftbl text;
BEGIN
  SELECT rc.delete_rule, ccu.table_name INTO rule, ftbl
    FROM information_schema.referential_constraints rc
    JOIN information_schema.key_column_usage kcu ON kcu.constraint_name = rc.constraint_name
    JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = rc.constraint_name
   WHERE kcu.table_name='applicants' AND kcu.column_name='selection_memo_updated_by';
  IF ftbl <> 'profiles' THEN RAISE EXCEPTION 'FAIL: FK target=% (expected profiles)', ftbl; END IF;
  IF rule <> 'SET NULL' THEN RAISE EXCEPTION 'FAIL: FK delete_rule=% (expected SET NULL)', rule; END IF;
  RAISE NOTICE 'TEST3/4 PASS: FK profiles(id) ON DELETE SET NULL';
END $$;

-- TEST5/6/7: 既存 selection_memo/result 不変・既存行の actor/time は NULL
DO $$
DECLARE m text; r text; ub uuid; ua timestamptz;
BEGIN
  SELECT selection_memo, result, selection_memo_updated_by, selection_memo_updated_at
    INTO m, r, ub, ua FROM public.applicants WHERE id='20000000-0000-0000-0000-000000000001';
  IF m <> '既存の選考メモ本文' THEN RAISE EXCEPTION 'FAIL: selection_memo mutated (%)', m; END IF;
  IF r <> '検討中' THEN RAISE EXCEPTION 'FAIL: result mutated (%)', r; END IF;
  IF ub IS NOT NULL OR ua IS NOT NULL THEN RAISE EXCEPTION 'FAIL: existing actor/time not NULL'; END IF;
  RAISE NOTICE 'TEST5/6/7 PASS: existing memo/result unchanged, actor/time NULL (no backfill)';
END $$;

-- TEST-FK-behavior: actor をセット→ profiles 削除で SET NULL（ON DELETE SET NULL 実挙動）
DO $$
DECLARE ub uuid;
BEGIN
  UPDATE public.applicants SET selection_memo_updated_by='10000000-0000-0000-0000-000000000001',
         selection_memo_updated_at=now() WHERE id='20000000-0000-0000-0000-000000000001';
  DELETE FROM public.profiles WHERE id='10000000-0000-0000-0000-000000000001';
  SELECT selection_memo_updated_by INTO ub FROM public.applicants WHERE id='20000000-0000-0000-0000-000000000001';
  IF ub IS NOT NULL THEN RAISE EXCEPTION 'FAIL: ON DELETE SET NULL did not null the actor'; END IF;
  RAISE NOTICE 'TEST8 PASS: ON DELETE SET NULL nulls actor (memo body preserved)';
END $$;

-- TEST9: destructive でない（selection_memo/result/selection_status 列が残っている）
DO $$
DECLARE cnt int;
BEGIN
  SELECT count(*) INTO cnt FROM information_schema.columns
   WHERE table_schema='public' AND table_name='applicants'
     AND column_name IN ('selection_memo','result','selection_status');
  IF cnt <> 3 THEN RAISE EXCEPTION 'FAIL: existing columns dropped (found %/3)', cnt; END IF;
  RAISE NOTICE 'TEST9 PASS: no destructive column drop';
END $$;

SELECT 'ALL_TESTS_DONE' AS result;
