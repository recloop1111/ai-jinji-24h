-- ============================================================================
-- e5_2b_selection_memo_actor_test.sql — Phase E-5-2B-2 ローカル検証（selection_memo 本体＋actor 列の additive/idempotent/rollback）
--   ※ LOCAL 専用（素の postgres:16-alpine）。
--   実行順:
--     この上半分(base stub＝selection_memo が「無い」新規環境) →
--     [MIGRATION] supabase/rls/e5_2b_selection_memo_actor.sql →  前半 assertions →
--     [MIGRATION 再適用] （idempotency） → 再適用 assertions →
--     [ROLLBACK] supabase/rls/e5_2b_selection_memo_actor_ROLLBACK.sql → rollback assertions
-- ============================================================================

-- ===== [base stub] = selection_memo が存在しない新規環境 =====
CREATE TABLE public.profiles (id uuid primary key, company_id uuid, role text);
CREATE TABLE public.applicants (
  id uuid primary key default gen_random_uuid(),
  company_id uuid NOT NULL,
  result text DEFAULT '未対応',
  selection_status text DEFAULT 'pending'
  -- ← selection_memo は敢えて無い（drift 前の新規環境を再現）
);

INSERT INTO public.profiles (id, company_id, role) VALUES
  ('10000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-00000000000a', NULL);
INSERT INTO public.applicants (id, company_id, result, selection_status) VALUES
  ('20000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-00000000000a','検討中','considering');

-- ===== [MIGRATION] ここで supabase/rls/e5_2b_selection_memo_actor.sql を適用 =====
-- \i supabase/rls/e5_2b_selection_memo_actor.sql

-- ---- TEST1: selection_memo が text/NULL可 で追加され、既存行は NULL ----
DO $$
DECLARE t text; nullable text; v text;
BEGIN
  SELECT data_type, is_nullable INTO t, nullable FROM information_schema.columns
   WHERE table_schema='public' AND table_name='applicants' AND column_name='selection_memo';
  IF t IS NULL THEN RAISE EXCEPTION 'FAIL: selection_memo not added (drift 未是正)'; END IF;
  IF t <> 'text' THEN RAISE EXCEPTION 'FAIL: selection_memo type=% (expected text)', t; END IF;
  IF nullable <> 'YES' THEN RAISE EXCEPTION 'FAIL: selection_memo not nullable'; END IF;
  SELECT selection_memo INTO v FROM public.applicants WHERE id='20000000-0000-0000-0000-000000000001';
  IF v IS NOT NULL THEN RAISE EXCEPTION 'FAIL: 既存行 selection_memo should be NULL'; END IF;
  RAISE NOTICE 'TEST1 PASS: selection_memo text/NULL added (absent→added)';
END $$;

-- ---- TEST2/3: actor 2列 + FK profiles(id) ON DELETE SET NULL ----
DO $$
DECLARE by_type text; at_type text; rule text; ftbl text;
BEGIN
  SELECT data_type INTO by_type FROM information_schema.columns
   WHERE table_schema='public' AND table_name='applicants' AND column_name='selection_memo_updated_by';
  SELECT data_type INTO at_type FROM information_schema.columns
   WHERE table_schema='public' AND table_name='applicants' AND column_name='selection_memo_updated_at';
  IF by_type <> 'uuid' OR at_type NOT LIKE 'timestamp%' THEN RAISE EXCEPTION 'FAIL: actor cols missing/typed wrong'; END IF;
  SELECT rc.delete_rule, ccu.table_name INTO rule, ftbl
    FROM information_schema.referential_constraints rc
    JOIN information_schema.key_column_usage kcu ON kcu.constraint_name = rc.constraint_name
    JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = rc.constraint_name
   WHERE kcu.table_name='applicants' AND kcu.column_name='selection_memo_updated_by';
  IF ftbl <> 'profiles' OR rule <> 'SET NULL' THEN RAISE EXCEPTION 'FAIL: FK not profiles(id) ON DELETE SET NULL (%/%)', ftbl, rule; END IF;
  RAISE NOTICE 'TEST2/3 PASS: actor 2列 + FK profiles(id) ON DELETE SET NULL';
END $$;

-- ---- TEST4: result/selection_status 不変 ----
DO $$
DECLARE r text; s text;
BEGIN
  SELECT result, selection_status INTO r, s FROM public.applicants WHERE id='20000000-0000-0000-0000-000000000001';
  IF r <> '検討中' OR s <> 'considering' THEN RAISE EXCEPTION 'FAIL: result/selection_status mutated'; END IF;
  RAISE NOTICE 'TEST4 PASS: result/selection_status unchanged';
END $$;

-- 既存環境の再現: selection_memo に本文を入れておく（再適用/rollback で不変であることを後で検証）
UPDATE public.applicants SET selection_memo='既存の選考メモ本文' WHERE id='20000000-0000-0000-0000-000000000001';

-- ===== [MIGRATION 再適用] idempotency（selection_memo が既に存在する環境） =====
-- \i supabase/rls/e5_2b_selection_memo_actor.sql

-- ---- TEST5/6: 再適用成功・selection_memo 内容不変・列は1つ ----
DO $$
DECLARE v text; cnt int;
BEGIN
  SELECT selection_memo INTO v FROM public.applicants WHERE id='20000000-0000-0000-0000-000000000001';
  IF v <> '既存の選考メモ本文' THEN RAISE EXCEPTION 'FAIL: 再適用で selection_memo が変化 (%)', v; END IF;
  SELECT count(*) INTO cnt FROM information_schema.columns
   WHERE table_schema='public' AND table_name='applicants' AND column_name='selection_memo';
  IF cnt <> 1 THEN RAISE EXCEPTION 'FAIL: selection_memo column count=% ', cnt; END IF;
  RAISE NOTICE 'TEST5/6 PASS: 再適用 idempotent・selection_memo 内容不変';
END $$;

-- ---- TEST7: ON DELETE SET NULL 実挙動（actor をセット→profiles 削除→actor NULL、本文は残る） ----
DO $$
DECLARE ub uuid; v text;
BEGIN
  UPDATE public.applicants SET selection_memo_updated_by='10000000-0000-0000-0000-000000000001',
         selection_memo_updated_at=now() WHERE id='20000000-0000-0000-0000-000000000001';
  DELETE FROM public.profiles WHERE id='10000000-0000-0000-0000-000000000001';
  SELECT selection_memo_updated_by, selection_memo INTO ub, v FROM public.applicants WHERE id='20000000-0000-0000-0000-000000000001';
  IF ub IS NOT NULL THEN RAISE EXCEPTION 'FAIL: ON DELETE SET NULL did not null actor'; END IF;
  IF v <> '既存の選考メモ本文' THEN RAISE EXCEPTION 'FAIL: memo body lost on profile delete'; END IF;
  RAISE NOTICE 'TEST7 PASS: ON DELETE SET NULL nulls actor, memo body preserved';
END $$;

-- ===== [ROLLBACK] ここで supabase/rls/e5_2b_selection_memo_actor_ROLLBACK.sql を適用 =====
-- \i supabase/rls/e5_2b_selection_memo_actor_ROLLBACK.sql

-- ---- TEST8/9/10: rollback は actor 2列のみ削除・selection_memo 本文は残す・result/status 不変 ----
DO $$
DECLARE has_by int; has_at int; v text; r text; s text;
BEGIN
  SELECT count(*) INTO has_by FROM information_schema.columns
   WHERE table_schema='public' AND table_name='applicants' AND column_name='selection_memo_updated_by';
  SELECT count(*) INTO has_at FROM information_schema.columns
   WHERE table_schema='public' AND table_name='applicants' AND column_name='selection_memo_updated_at';
  IF has_by <> 0 OR has_at <> 0 THEN RAISE EXCEPTION 'FAIL: rollback did not drop actor cols'; END IF;

  SELECT selection_memo, result, selection_status INTO v, r, s FROM public.applicants WHERE id='20000000-0000-0000-0000-000000000001';
  IF v <> '既存の選考メモ本文' THEN RAISE EXCEPTION 'FAIL: rollback dropped/lost selection_memo body (data loss!)'; END IF;
  IF r <> '検討中' OR s <> 'considering' THEN RAISE EXCEPTION 'FAIL: rollback mutated result/selection_status'; END IF;
  RAISE NOTICE 'TEST8/9/10 PASS: rollback drops actor cols only, selection_memo body + result/status preserved';
END $$;

SELECT 'ALL_TESTS_DONE' AS result;
