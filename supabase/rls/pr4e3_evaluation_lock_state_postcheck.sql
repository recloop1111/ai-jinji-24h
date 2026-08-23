-- ============================================================================
-- pr4e3_evaluation_lock_state_postcheck.sql  （適用後・SELECT のみ・未実行）
-- ============================================================================

-- 1) 3列が追加され、いずれも NULL 許容・DEFAULT 無し。
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'interviews'
  AND column_name IN ('evaluation_locked_until', 'evaluation_status', 'evaluation_error_code', 'evaluation_retry_after', 'evaluation_cooldown_hash')
ORDER BY column_name;
-- 期待: evaluation_locked_until = timestamp with time zone / YES / NULL
--       evaluation_status = text / YES / NULL, evaluation_error_code = text / YES / NULL

-- 2) CHECK 制約（evaluation_status の値集合）。
SELECT conname, pg_get_constraintdef(oid) AS def
FROM pg_constraint
WHERE conrelid = 'public.interviews'::regclass AND conname = 'interviews_evaluation_status_chk';
-- 期待: CHECK (evaluation_status IS NULL OR evaluation_status IN ('not_started','evaluating','completed','failed'))

-- 3) 既存行に副作用が無いこと（追加直後は全行 NULL）。
SELECT count(*) AS total_rows,
       count(evaluation_locked_until) AS locked_non_null,
       count(evaluation_status)       AS status_non_null,
       count(evaluation_error_code)   AS error_non_null
FROM public.interviews;
-- 期待: locked_non_null = status_non_null = error_non_null = 0

-- 4) RLS/policy を増やしていないこと（interviews の policy 数が適用前と同じ）。
SELECT count(*) AS interviews_policy_count
FROM pg_policies WHERE schemaname = 'public' AND tablename = 'interviews';

-- 5) 条件付きクレーム述語が構文的に妥当か（read-only・UPDATE しない）。
SELECT count(*) AS claimable_rows
FROM public.interviews
WHERE (evaluation_locked_until IS NULL OR evaluation_locked_until < now());
