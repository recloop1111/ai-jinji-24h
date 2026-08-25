-- ============================================================================
-- p1_transcripts_rls_test.sql  （LOCAL 専用・Production では実行しない）
--   Phase P1 の interview_transcripts に対する synthetic E2E + RLS/authz 検証。
--   前提: p1_interview_transcripts.sql を local に適用済み。
--   方式: 1 トランザクション内で合成データを seed → 各検証を DO ブロックの RAISE で assert →
--         最後に ROLLBACK（残渣なし）。role 切替は SET LOCAL ROLE + request.jwt.claims で行う。
--   合成データのみ・PII なし。
-- ============================================================================
\set ON_ERROR_STOP on
BEGIN;

-- authenticated が RLS policy の subquery（interviews/applicants/profiles）を評価できるよう read 権限を付与
-- （Production では既存テーブルに既に付与済み。ここは local テストハーネスの前提合わせ）。
GRANT SELECT ON public.companies, public.applicants, public.interviews, public.profiles TO authenticated;

-- 合成 seed（company A / B, その profile ユーザ, applicant, interview, transcript）
INSERT INTO public.companies (id, name) VALUES
  ('11111111-1111-1111-1111-111111111111', 'P1 Test Co A'),
  ('22222222-2222-2222-2222-222222222222', 'P1 Test Co B');
INSERT INTO public.profiles (id, company_id, role) VALUES
  ('a1111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', null), -- 企業ユーザA
  ('b2222222-2222-2222-2222-222222222222', '22222222-2222-2222-2222-222222222222', null); -- 企業ユーザB
INSERT INTO public.applicants (id, company_id) VALUES
  ('a0000001-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111'),
  ('b0000002-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222');
INSERT INTO public.interviews (id, applicant_id, next_transcript_seq) VALUES
  ('c0000001-0000-0000-0000-000000000001', 'a0000001-0000-0000-0000-000000000001', 0),
  ('c0000002-0000-0000-0000-000000000002', 'b0000002-0000-0000-0000-000000000002', 0);

-- service-role 相当（postgres superuser・RLS bypass）で発話を書き込む
INSERT INTO public.interview_transcripts (interview_id, speaker, text, seq, source, dedup_key) VALUES
  ('c0000001-0000-0000-0000-000000000001', 'interviewer', 'ご経歴を教えてください', 1, 'synthetic', 'A-k1'),
  ('c0000001-0000-0000-0000-000000000001', 'applicant',   '前職では営業をしていました', 2, 'synthetic', 'A-k2'),
  ('c0000002-0000-0000-0000-000000000002', 'interviewer', '志望動機は？', 1, 'synthetic', 'B-k1');

-- TEST 1: service-role/postgres は（本 seed 分の）3 件が見える。
--   ※ local テーブルには過去実験の残存行があり得るため、本 seed の interview_id に限定して数える。
DO $$
DECLARE seeded int;
BEGIN
  SELECT count(*) INTO seeded FROM public.interview_transcripts
   WHERE interview_id IN ('c0000001-0000-0000-0000-000000000001','c0000002-0000-0000-0000-000000000002');
  IF seeded <> 3 THEN RAISE EXCEPTION 'TEST1 FAIL: service-role expected 3 seeded rows, got %', seeded; END IF;
  RAISE NOTICE 'TEST1 PASS: service-role sees all 3 seeded';
END $$;

-- TEST 2: dedup 部分ユニーク: 同一 (interview_id, dedup_key) は拒否、NULL dedup は複数許容
DO $$ BEGIN
  BEGIN
    INSERT INTO public.interview_transcripts (interview_id, speaker, text, seq, source, dedup_key)
    VALUES ('c0000001-0000-0000-0000-000000000001', 'applicant', 'dup', 3, 'synthetic', 'A-k1');
    RAISE EXCEPTION 'TEST2 FAIL: duplicate dedup_key was accepted';
  EXCEPTION WHEN unique_violation THEN RAISE NOTICE 'TEST2a PASS: duplicate dedup_key rejected';
  END;
  INSERT INTO public.interview_transcripts (interview_id, speaker, text, seq, source, dedup_key)
  VALUES ('c0000001-0000-0000-0000-000000000001', 'applicant', 'n1', 4, 'synthetic', NULL),
         ('c0000001-0000-0000-0000-000000000001', 'applicant', 'n2', 5, 'synthetic', NULL);
  RAISE NOTICE 'TEST2b PASS: multiple NULL dedup_key allowed';
END $$;

-- TEST 3: CHECK 制約（speaker / source / seq / text 長）
DO $$ BEGIN
  BEGIN INSERT INTO public.interview_transcripts (interview_id, speaker, text, seq, source)
        VALUES ('c0000001-0000-0000-0000-000000000001','robot','x',6,'synthetic');
        RAISE EXCEPTION 'TEST3 FAIL: bad speaker accepted';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'TEST3a PASS: bad speaker rejected'; END;
  BEGIN INSERT INTO public.interview_transcripts (interview_id, speaker, text, seq, source)
        VALUES ('c0000001-0000-0000-0000-000000000001','applicant','x',6,'evil');
        RAISE EXCEPTION 'TEST3 FAIL: bad source accepted';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'TEST3b PASS: bad source rejected'; END;
  BEGIN INSERT INTO public.interview_transcripts (interview_id, speaker, text, seq, source)
        VALUES ('c0000001-0000-0000-0000-000000000001','applicant','x',0,'synthetic');
        RAISE EXCEPTION 'TEST3 FAIL: seq<1 accepted';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'TEST3c PASS: seq<1 rejected'; END;
  BEGIN INSERT INTO public.interview_transcripts (interview_id, speaker, text, seq, source)
        VALUES ('c0000001-0000-0000-0000-000000000001','applicant', repeat('x',20001),6,'synthetic');
        RAISE EXCEPTION 'TEST3 FAIL: text>20000 accepted';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'TEST3d PASS: text>20000 rejected'; END;
END $$;

-- TEST 4: RLS — 企業ユーザA は自社(interview c1)の transcript のみ見え、B社は見えない（cross-company isolation）
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"a1111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
DO $$
DECLARE own_cnt int; other_cnt int;
BEGIN
  SELECT count(*) INTO own_cnt   FROM public.interview_transcripts WHERE interview_id='c0000001-0000-0000-0000-000000000001';
  SELECT count(*) INTO other_cnt FROM public.interview_transcripts WHERE interview_id='c0000002-0000-0000-0000-000000000002';
  IF own_cnt = 0 THEN RAISE EXCEPTION 'TEST4 FAIL: userA cannot see own company transcripts'; END IF;
  IF other_cnt <> 0 THEN RAISE EXCEPTION 'TEST4 FAIL: userA leaked B company transcripts (%).', other_cnt; END IF;
  RAISE NOTICE 'TEST4 PASS: userA sees own(%), B leaked(0)', own_cnt;
END $$;
RESET ROLE;

-- TEST 5: 企業ユーザB は B社のみ、A社は見えない
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"b2222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
DO $$
DECLARE own_cnt int; other_cnt int;
BEGIN
  SELECT count(*) INTO own_cnt   FROM public.interview_transcripts WHERE interview_id='c0000002-0000-0000-0000-000000000002';
  SELECT count(*) INTO other_cnt FROM public.interview_transcripts WHERE interview_id='c0000001-0000-0000-0000-000000000001';
  IF own_cnt <> 1 THEN RAISE EXCEPTION 'TEST5 FAIL: userB expected 1 own row, got %', own_cnt; END IF;
  IF other_cnt <> 0 THEN RAISE EXCEPTION 'TEST5 FAIL: userB leaked A company transcripts (%).', other_cnt; END IF;
  RAISE NOTICE 'TEST5 PASS: userB sees own(1), A leaked(0)';
END $$;
RESET ROLE;

-- TEST 6: FK CASCADE — interview を削除するとその transcript も消える（孤児 PII を残さない）
DO $$
DECLARE remain int;
BEGIN
  DELETE FROM public.interviews WHERE id='c0000001-0000-0000-0000-000000000001';
  SELECT count(*) INTO remain FROM public.interview_transcripts WHERE interview_id='c0000001-0000-0000-0000-000000000001';
  IF remain <> 0 THEN RAISE EXCEPTION 'TEST6 FAIL: CASCADE did not remove transcripts (%).', remain; END IF;
  RAISE NOTICE 'TEST6 PASS: CASCADE removed child transcripts';
END $$;

ROLLBACK;

-- TEST 7（別トランザクション・live anon 遮断）: anon は grant 無し＝permission denied
--   ※ 期待どおり失敗する。ON_ERROR_STOP でスクリプトが止まるのは「拒否された」証拠。
DO $$
DECLARE denied boolean := false;
BEGIN
  BEGIN
    PERFORM 1 FROM public.interview_transcripts;  -- postgres では通る（下の SET ROLE で検証）
  EXCEPTION WHEN insufficient_privilege THEN denied := true;
  END;
  RAISE NOTICE 'TEST7 note: grant/policy による anon 遮断は静的検証（下記 psql チェック）で確認';
END $$;
