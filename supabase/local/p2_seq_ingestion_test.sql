-- ============================================================================
-- p2_seq_ingestion_test.sql  （LOCAL 専用・Production では実行しない）
--   Phase P2 seq allocator の synthetic 検証。前提: p2_transcript_seq_allocator.sql を local 適用済み。
--   1 トランザクションで seed → seq 採番 / 独立性 / anon・authenticated EXECUTE 拒否 を assert → ROLLBACK。
-- ============================================================================
\set ON_ERROR_STOP on
BEGIN;

INSERT INTO public.companies (id, name) VALUES
  ('11111111-1111-1111-1111-111111111111', 'P2 Co A');
INSERT INTO public.applicants (id, company_id) VALUES
  ('a0000001-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111');
INSERT INTO public.interviews (id, applicant_id, next_transcript_seq) VALUES
  ('c0000001-0000-0000-0000-000000000001', 'a0000001-0000-0000-0000-000000000001', 0),
  ('c0000002-0000-0000-0000-000000000002', 'a0000001-0000-0000-0000-000000000001', 0);

-- TEST 1: 同一 interview で 1,2,3 と採番される
DO $$
DECLARE s1 int; s2 int; s3 int;
BEGIN
  s1 := public.allocate_transcript_seq('c0000001-0000-0000-0000-000000000001');
  s2 := public.allocate_transcript_seq('c0000001-0000-0000-0000-000000000001');
  s3 := public.allocate_transcript_seq('c0000001-0000-0000-0000-000000000001');
  IF (s1,s2,s3) <> (1,2,3) THEN RAISE EXCEPTION 'TEST1 FAIL: expected 1,2,3 got %,%,%', s1,s2,s3; END IF;
  RAISE NOTICE 'TEST1 PASS: seq 1,2,3';
END $$;

-- TEST 2: 別 interview は独立（1 から）
DO $$
DECLARE s int;
BEGIN
  s := public.allocate_transcript_seq('c0000002-0000-0000-0000-000000000002');
  IF s <> 1 THEN RAISE EXCEPTION 'TEST2 FAIL: other interview expected 1 got %', s; END IF;
  RAISE NOTICE 'TEST2 PASS: independent interview starts at 1';
END $$;

-- TEST 3: 存在しない interview → NULL（呼び出し側で失敗扱い）
DO $$
DECLARE s int;
BEGIN
  s := public.allocate_transcript_seq('00000000-0000-0000-0000-000000000000');
  IF s IS NOT NULL THEN RAISE EXCEPTION 'TEST3 FAIL: unknown interview expected NULL got %', s; END IF;
  RAISE NOTICE 'TEST3 PASS: unknown interview -> NULL';
END $$;

-- TEST 4: anon / authenticated は EXECUTE 不可（service_role のみ）
DO $$
DECLARE denied boolean := false;
BEGIN
  SET LOCAL ROLE anon;
  BEGIN
    PERFORM public.allocate_transcript_seq('c0000001-0000-0000-0000-000000000001');
  EXCEPTION WHEN insufficient_privilege THEN denied := true;
  END;
  RESET ROLE;
  IF NOT denied THEN RAISE EXCEPTION 'TEST4 FAIL: anon could EXECUTE allocate_transcript_seq'; END IF;
  RAISE NOTICE 'TEST4a PASS: anon EXECUTE denied';
END $$;
DO $$
DECLARE denied boolean := false;
BEGIN
  SET LOCAL ROLE authenticated;
  BEGIN
    PERFORM public.allocate_transcript_seq('c0000001-0000-0000-0000-000000000001');
  EXCEPTION WHEN insufficient_privilege THEN denied := true;
  END;
  RESET ROLE;
  IF NOT denied THEN RAISE EXCEPTION 'TEST4 FAIL: authenticated could EXECUTE allocate_transcript_seq'; END IF;
  RAISE NOTICE 'TEST4b PASS: authenticated EXECUTE denied';
END $$;

ROLLBACK;
