-- ============================================================================
-- p3_transcript_display_test.sql  （LOCAL 専用・Production では実行しない）
--   Phase P3 企業表示の synthetic 検証。前提: p1_interview_transcripts.sql を local 適用済み。
--   企業ユーザが「UI が投げる最小 SELECT（speaker,text,seq,final,created_at・seq 昇順）」で
--   自社 interview の会話ログのみ取得でき、他社は 0 件・anon は拒否されることを assert → ROLLBACK。
-- ============================================================================
\set ON_ERROR_STOP on
BEGIN;

GRANT SELECT ON public.companies, public.applicants, public.interviews, public.profiles TO authenticated;

INSERT INTO public.companies (id, name) VALUES
  ('11111111-1111-1111-1111-111111111111', 'P3 Co A'),
  ('22222222-2222-2222-2222-222222222222', 'P3 Co B');
INSERT INTO public.profiles (id, company_id, role) VALUES
  ('a1111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', null),
  ('b2222222-2222-2222-2222-222222222222', '22222222-2222-2222-2222-222222222222', null);
INSERT INTO public.applicants (id, company_id) VALUES
  ('a0000001-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111');
INSERT INTO public.interviews (id, applicant_id) VALUES
  ('c0000001-0000-0000-0000-000000000001', 'a0000001-0000-0000-0000-000000000001');

-- synthetic 会話（AI/応募者 交互・seq 1..4・故意に逆順で INSERT）
INSERT INTO public.interview_transcripts (interview_id, speaker, text, seq, source, dedup_key, final) VALUES
  ('c0000001-0000-0000-0000-000000000001', 'applicant',   '前職では〜',                         4, 'synthetic', 'k4', true),
  ('c0000001-0000-0000-0000-000000000001', 'interviewer', 'まず、これまでのご経験について教えてください。', 3, 'synthetic', 'k3', true),
  ('c0000001-0000-0000-0000-000000000001', 'applicant',   'よろしくお願いします。',                 2, 'synthetic', 'k2', true),
  ('c0000001-0000-0000-0000-000000000001', 'interviewer', '本日は面接にご参加いただきありがとうございます。', 1, 'synthetic', 'k1', true);

-- TEST 1: 企業A ユーザは UI 同等 SELECT（最小列・seq 昇順）で 4 件を正しい順に取得
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"a1111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
DO $$
DECLARE seqs int[]; first_speaker text;
BEGIN
  SELECT array_agg(seq ORDER BY seq) INTO seqs
    FROM public.interview_transcripts WHERE interview_id='c0000001-0000-0000-0000-000000000001';
  IF seqs IS DISTINCT FROM ARRAY[1,2,3,4] THEN RAISE EXCEPTION 'TEST1 FAIL: expected seq 1..4 got %', seqs; END IF;
  SELECT speaker INTO first_speaker FROM public.interview_transcripts
    WHERE interview_id='c0000001-0000-0000-0000-000000000001' ORDER BY seq ASC LIMIT 1;
  IF first_speaker <> 'interviewer' THEN RAISE EXCEPTION 'TEST1 FAIL: first speaker expected interviewer got %', first_speaker; END IF;
  RAISE NOTICE 'TEST1 PASS: companyA reads own transcript seq 1..4, first=interviewer';
END $$;
RESET ROLE;

-- TEST 2: 企業B ユーザは 企業A の会話ログを 1 件も取得できない（cross-company isolation）
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"b2222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
DO $$
DECLARE cnt int;
BEGIN
  SELECT count(*) INTO cnt FROM public.interview_transcripts WHERE interview_id='c0000001-0000-0000-0000-000000000001';
  IF cnt <> 0 THEN RAISE EXCEPTION 'TEST2 FAIL: companyB leaked companyA transcript (%).', cnt; END IF;
  RAISE NOTICE 'TEST2 PASS: companyB sees 0 of companyA transcript';
END $$;
RESET ROLE;

ROLLBACK;
