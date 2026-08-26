-- ============================================================================
-- p8_otp_state_test.sql  （LOCAL 専用・Production では実行しない）
--   Phase P8 の DB-level 検証。前提: p8_otp_state.sql を local 適用済み（interviews.otp_state jsonb）。
--   すべて 1 transaction・最後に ROLLBACK＝副作用ゼロ。
--   検証:
--     TEST1 optimistic CAS: version 一致時のみ書き込み成功（並行送信/照合の二重進行を防ぐ）。
--     TEST2 stale version の書き込みは 0 行（reject）。
--     TEST3 plaintext OTP/電話番号を保存しない（codeHash のみ・電話は列に無い）ことを構造で確認。
-- ============================================================================
\set ON_ERROR_STOP on
BEGIN;

INSERT INTO public.companies (id, name) VALUES ('f8000000-0000-0000-0000-000000000001', 'P8 Co');
INSERT INTO public.applicants (id, company_id) VALUES ('f8000000-0000-0000-0000-0000000000a1', 'f8000000-0000-0000-0000-000000000001');
INSERT INTO public.interviews (id, applicant_id, status, otp_state) VALUES
  ('f8000000-0000-0000-0000-0000000000c1', 'f8000000-0000-0000-0000-0000000000a1', 'in_progress',
   '{"interviewId":"f8000000-0000-0000-0000-0000000000c1","codeHash":"abcdef","expiresAtMs":9999999999999,"verifyAttempts":0,"resendCount":0,"sendCount":1,"lastSentAtMs":1000,"status":"pending","version":0}'::jsonb);

-- TEST1: version=0 期待の CAS（→ version 1・verifyAttempts++）。1 回目成功（1 行）。
DO $$
DECLARE n int;
BEGIN
  WITH upd AS (
    UPDATE public.interviews
      SET otp_state = jsonb_set(jsonb_set(otp_state, '{version}', '1'::jsonb), '{verifyAttempts}', '1'::jsonb)
      WHERE id = 'f8000000-0000-0000-0000-0000000000c1' AND (otp_state->>'version')::int = 0
      RETURNING id
  ) SELECT count(*) INTO n FROM upd;
  IF n <> 1 THEN RAISE EXCEPTION 'TEST1 FAIL: first CAS expected 1 got %', n; END IF;
  RAISE NOTICE 'TEST1 PASS: OTP optimistic CAS first writer wins (version 0 -> 1)';
END $$;

-- TEST2: もう 1 本が同じ version=0 を期待 → 既に version=1 で 0 行（conflict）。
DO $$
DECLARE n int;
BEGIN
  WITH upd AS (
    UPDATE public.interviews
      SET otp_state = jsonb_set(otp_state, '{resendCount}', '1'::jsonb)
      WHERE id = 'f8000000-0000-0000-0000-0000000000c1' AND (otp_state->>'version')::int = 0
      RETURNING id
  ) SELECT count(*) INTO n FROM upd;
  IF n <> 0 THEN RAISE EXCEPTION 'TEST2 FAIL: stale CAS expected 0 got %', n; END IF;
  RAISE NOTICE 'TEST2 PASS: OTP stale version CAS rejected (0 rows)';
END $$;

-- TEST3: plaintext を保存しない（codeHash はあるが、平文コード/電話番号キーは持たない）。
DO $$
DECLARE has_code bool; has_phone bool;
BEGIN
  SELECT (otp_state ? 'code') , (otp_state ? 'phone') INTO has_code, has_phone
    FROM public.interviews WHERE id = 'f8000000-0000-0000-0000-0000000000c1';
  IF has_code OR has_phone THEN RAISE EXCEPTION 'TEST3 FAIL: otp_state must not store plaintext code/phone'; END IF;
  RAISE NOTICE 'TEST3 PASS: otp_state holds no plaintext code/phone (codeHash only)';
END $$;

ROLLBACK;
