-- ============================================================================
-- p7_1_interview_progress_test.sql  （LOCAL 専用・Production では実行しない）
--   Phase P7.1 の DB-level 検証。前提: p7_1_interview_progress.sql を local 適用済み
--   （interviews.interview_progress jsonb）。すべて 1 transaction・最後に ROLLBACK＝副作用ゼロ。
--   検証する不変条件:
--     TEST1 optimistic CAS: version 一致時のみ書き込み成功（並行二重更新の 1 本目だけ勝つ）。
--     TEST2 stale version: 期待 version が古い（不一致）の書き込みは 0 行（reject）。
--     TEST3 premature complete guard 相当（completedCount < total では completed にしない）を SQL 表現で確認。
-- ============================================================================
\set ON_ERROR_STOP on
BEGIN;

INSERT INTO public.companies (id, name) VALUES ('e7000000-0000-0000-0000-000000000001', 'P7.1 Co');
INSERT INTO public.applicants (id, company_id) VALUES ('e7000000-0000-0000-0000-0000000000a1', 'e7000000-0000-0000-0000-000000000001');
INSERT INTO public.interviews (id, applicant_id, status, interview_progress) VALUES
  ('e7000000-0000-0000-0000-0000000000c1', 'e7000000-0000-0000-0000-0000000000a1', 'in_progress',
   '{"interviewId":"e7000000-0000-0000-0000-0000000000c1","totalQuestions":3,"currentIndex":1,"currentAnswered":false,"completedCount":0,"followupsUsed":0,"terminal":"none","terminalReason":null,"version":0,"lastEventId":null}'::jsonb);

-- TEST1: version=0 を期待した CAS 更新（→ version 1 へ）。1 回目は成功（1 行）。
DO $$
DECLARE n int;
BEGIN
  WITH upd AS (
    UPDATE public.interviews
      SET interview_progress = jsonb_set(interview_progress, '{version}', '1'::jsonb)
      WHERE id = 'e7000000-0000-0000-0000-0000000000c1'
        AND (interview_progress->>'version')::int = 0
      RETURNING id
  ) SELECT count(*) INTO n FROM upd;
  IF n <> 1 THEN RAISE EXCEPTION 'TEST1 FAIL: first CAS expected 1 got %', n; END IF;
  RAISE NOTICE 'TEST1 PASS: optimistic CAS first writer wins (version 0 -> 1)';
END $$;

-- TEST2: もう 1 本が同じ version=0 を期待して CAS → 既に version=1 なので 0 行（conflict）。
DO $$
DECLARE n int;
BEGIN
  WITH upd AS (
    UPDATE public.interviews
      SET interview_progress = jsonb_set(interview_progress, '{followupsUsed}', '1'::jsonb)
      WHERE id = 'e7000000-0000-0000-0000-0000000000c1'
        AND (interview_progress->>'version')::int = 0
      RETURNING id
  ) SELECT count(*) INTO n FROM upd;
  IF n <> 0 THEN RAISE EXCEPTION 'TEST2 FAIL: stale CAS expected 0 got %', n; END IF;
  RAISE NOTICE 'TEST2 PASS: stale version CAS rejected (0 rows)';
END $$;

-- TEST3: premature complete guard 相当。completedCount(0) < total(3) では completed にしない。
DO $$
DECLARE completed bool;
BEGIN
  SELECT ((interview_progress->>'completedCount')::int >= (interview_progress->>'totalQuestions')::int)
    INTO completed
    FROM public.interviews WHERE id = 'e7000000-0000-0000-0000-0000000000c1';
  IF completed THEN RAISE EXCEPTION 'TEST3 FAIL: completed guard should be false when completedCount<total'; END IF;
  RAISE NOTICE 'TEST3 PASS: premature complete guard holds (completedCount<total → not completed)';
END $$;

ROLLBACK;
