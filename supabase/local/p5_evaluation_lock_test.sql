-- ============================================================================
-- p5_evaluation_lock_test.sql  （LOCAL 専用・Production では実行しない）
--   Phase P5 の DB-level 検証。前提: p5_evaluation_lock_state.sql を local 適用済み
--   （interviews に evaluation_locked_until / evaluation_status / evaluation_retry_after 等）。
--   検証する不変条件（すべて 1 transaction 内・最後に ROLLBACK＝副作用ゼロ）:
--     TEST1  atomic claim: 条件付き UPDATE...RETURNING は「有効ロック保持中」は再取得できない（1 winner）。
--     TEST2  release/再取得: ロック解放（NULL 化）後は再取得できる。
--     TEST3  TTL stale 回復: locked_until が過去（失効）なら crash 後でも再取得できる（永久ロックしない）。
--     TEST4  writer idempotency: interview_results 相当への upsert(onConflict interview_id) は 1 行に集約。
--   ※ 実 concurrency（10-20 並行で 1 winner）は同一機構（原子的 UPDATE...RETURNING）を p2 seq allocator で
--     実証済み。本ファイルはロック「意味論」を、別途 shell の並行ランナーが「並行 1 winner」を担保する。
-- ============================================================================
\set ON_ERROR_STOP on
BEGIN;

-- 固定 fixture（ROLLBACK 前提。id は衝突回避のため専用値）。
INSERT INTO public.companies (id, name) VALUES ('d5000000-0000-0000-0000-000000000001', 'P5 Co A');
INSERT INTO public.applicants (id, company_id) VALUES ('d5000000-0000-0000-0000-0000000000a1', 'd5000000-0000-0000-0000-000000000001');
INSERT INTO public.interviews (id, applicant_id, status) VALUES ('d5000000-0000-0000-0000-0000000000c1', 'd5000000-0000-0000-0000-0000000000a1', 'completed');

-- TEST1: 1 回目 claim は成功、2 回目（有効ロック保持中）は 0 行（＝conflict）。
DO $$
DECLARE first_claim int; second_claim int;
BEGIN
  WITH upd AS (
    UPDATE public.interviews SET evaluation_locked_until = now() + interval '5 min'
    WHERE id = 'd5000000-0000-0000-0000-0000000000c1'
      AND (evaluation_locked_until IS NULL OR evaluation_locked_until < now())
    RETURNING id
  ) SELECT count(*) INTO first_claim FROM upd;

  WITH upd AS (
    UPDATE public.interviews SET evaluation_locked_until = now() + interval '5 min'
    WHERE id = 'd5000000-0000-0000-0000-0000000000c1'
      AND (evaluation_locked_until IS NULL OR evaluation_locked_until < now())
    RETURNING id
  ) SELECT count(*) INTO second_claim FROM upd;

  IF first_claim <> 1 THEN RAISE EXCEPTION 'TEST1 FAIL: first claim expected 1 got %', first_claim; END IF;
  IF second_claim <> 0 THEN RAISE EXCEPTION 'TEST1 FAIL: second claim (held) expected 0 got %', second_claim; END IF;
  RAISE NOTICE 'TEST1 PASS: atomic claim — 1 winner while held (first=1, second=0)';
END $$;

-- TEST2: 解放（NULL 化）後は再取得できる。
DO $$
DECLARE reclaim int;
BEGIN
  UPDATE public.interviews SET evaluation_locked_until = NULL WHERE id = 'd5000000-0000-0000-0000-0000000000c1';
  WITH upd AS (
    UPDATE public.interviews SET evaluation_locked_until = now() + interval '5 min'
    WHERE id = 'd5000000-0000-0000-0000-0000000000c1'
      AND (evaluation_locked_until IS NULL OR evaluation_locked_until < now())
    RETURNING id
  ) SELECT count(*) INTO reclaim FROM upd;
  IF reclaim <> 1 THEN RAISE EXCEPTION 'TEST2 FAIL: reclaim after release expected 1 got %', reclaim; END IF;
  RAISE NOTICE 'TEST2 PASS: reclaim after release succeeds';
END $$;

-- TEST3: TTL stale 回復（過去に失効した locked_until は crash 後でも再取得可＝永久ロックしない）。
DO $$
DECLARE reclaim int;
BEGIN
  UPDATE public.interviews SET evaluation_locked_until = now() - interval '1 min'
    WHERE id = 'd5000000-0000-0000-0000-0000000000c1';
  WITH upd AS (
    UPDATE public.interviews SET evaluation_locked_until = now() + interval '5 min'
    WHERE id = 'd5000000-0000-0000-0000-0000000000c1'
      AND (evaluation_locked_until IS NULL OR evaluation_locked_until < now())
    RETURNING id
  ) SELECT count(*) INTO reclaim FROM upd;
  IF reclaim <> 1 THEN RAISE EXCEPTION 'TEST3 FAIL: stale reclaim expected 1 got %', reclaim; END IF;
  RAISE NOTICE 'TEST3 PASS: stale (expired TTL) lock recovered';
END $$;

-- TEST4: writer idempotency（interview_results 相当・onConflict interview_id で 1 行）。
--   local に interview_results が無いため一時表で writer の upsert 意味論のみ検証。
CREATE TEMP TABLE tmp_interview_results (
  interview_id uuid PRIMARY KEY,
  evaluation_axes jsonb,
  total_score int,
  detail_json jsonb,
  updated_at timestamptz
) ON COMMIT DROP;

DO $$
DECLARE rows int; score int;
BEGIN
  INSERT INTO tmp_interview_results (interview_id, evaluation_axes, total_score, detail_json, updated_at)
    VALUES ('d5000000-0000-0000-0000-0000000000c1', '[]'::jsonb, 70, '{"schema_version":"ebca-1"}'::jsonb, now())
    ON CONFLICT (interview_id) DO UPDATE SET total_score = EXCLUDED.total_score, updated_at = EXCLUDED.updated_at;
  -- 再評価（上書き）: 同 interview へ再度 upsert。行は増えない・最新 score で上書き。
  INSERT INTO tmp_interview_results (interview_id, evaluation_axes, total_score, detail_json, updated_at)
    VALUES ('d5000000-0000-0000-0000-0000000000c1', '[]'::jsonb, 85, '{"schema_version":"ebca-1"}'::jsonb, now())
    ON CONFLICT (interview_id) DO UPDATE SET total_score = EXCLUDED.total_score, updated_at = EXCLUDED.updated_at;

  SELECT count(*), max(total_score) INTO rows, score FROM tmp_interview_results
    WHERE interview_id = 'd5000000-0000-0000-0000-0000000000c1';
  IF rows <> 1 THEN RAISE EXCEPTION 'TEST4 FAIL: expected 1 result row got %', rows; END IF;
  IF score <> 85 THEN RAISE EXCEPTION 'TEST4 FAIL: expected latest score 85 got %', score; END IF;
  RAISE NOTICE 'TEST4 PASS: writer upsert idempotent (1 row, latest score 85)';
END $$;

ROLLBACK;
