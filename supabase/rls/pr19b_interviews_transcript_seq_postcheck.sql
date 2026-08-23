-- ============================================================================
-- pr19b_interviews_transcript_seq_postcheck.sql  （適用後・SELECT のみ・未実行）
-- ============================================================================

-- 1) 列が追加され、integer / NOT NULL / DEFAULT 0 であること。
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'interviews'
  AND column_name = 'next_transcript_seq';
-- 期待: next_transcript_seq / integer / NO / 0

-- 2) 既存行に副作用が無いこと（追加直後は全行 0）。
SELECT count(*) AS total_rows,
       count(*) FILTER (WHERE next_transcript_seq <> 0) AS non_zero_rows,
       coalesce(max(next_transcript_seq), 0) AS max_seq
FROM public.interviews;
-- 期待: non_zero_rows = 0, max_seq = 0

-- 3) RLS/policy を増やしていないこと（interviews の policy 数が適用前と同じ）。
SELECT count(*) AS interviews_policy_count
FROM pg_policies WHERE schemaname = 'public' AND tablename = 'interviews';

-- 4) UNIQUE(interview_id, seq) が「無い」こと（PR-3A の判断維持・誤追加していない。期待: 0行）。
SELECT indexname FROM pg_indexes
WHERE schemaname = 'public' AND tablename = 'interview_transcripts'
  AND indexdef ILIKE '%UNIQUE%' AND indexdef ILIKE '%seq%' AND indexdef NOT ILIKE '%dedup_key%';

-- 5) 原子的採番文が構文的に妥当か（read-only 版・実際には UPDATE しない）。
--    本番の採番は `UPDATE ... SET next_transcript_seq = next_transcript_seq + 1 ... RETURNING`。
--    ここでは "+1 した値" を SELECT で確認するのみ（副作用なし）。
SELECT id, next_transcript_seq, next_transcript_seq + 1 AS would_allocate
FROM public.interviews
ORDER BY created_at DESC NULLS LAST
LIMIT 3;
