-- ============================================================================
-- pr19c_allocate_transcript_seq_fn_postcheck.sql  （適用後・SELECT のみ・未実行）
--   注意: 採番 function は UPDATE を伴うため postcheck では「実行しない」（metadata 検証のみ）。
--         動作確認は末尾の「BEGIN; ... ROLLBACK;」スニペットを手動で使う（副作用を残さない）。
-- ============================================================================

-- 1) 採番列が integer / NOT NULL / DEFAULT 0 であること。
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'interviews' AND column_name = 'next_transcript_seq';
-- 期待: next_transcript_seq / integer / NO / 0

-- 2) 採番 function が存在し、SECURITY INVOKER・search_path='' であること。
SELECT p.proname,
       pg_get_function_identity_arguments(p.oid) AS args,
       p.prosecdef AS security_definer,   -- 期待: false（= SECURITY INVOKER）
       p.proconfig AS config              -- 期待: {search_path=""}
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'allocate_transcript_seq';

-- 3) EXECUTE 権限が service_role のみ（public/anon/authenticated は持たない）。
SELECT grantee, privilege_type
FROM information_schema.role_routine_grants
WHERE routine_schema = 'public' AND routine_name = 'allocate_transcript_seq'
ORDER BY grantee;
-- 期待: grantee = service_role の EXECUTE のみ（PUBLIC / anon / authenticated が現れない）。

-- 4) 既存行に副作用が無いこと（全行 next_transcript_seq = 0）。
SELECT count(*) AS total_rows,
       count(*) FILTER (WHERE next_transcript_seq <> 0) AS non_zero_rows
FROM public.interviews;
-- 期待: non_zero_rows = 0

-- 5) UNIQUE(interview_id, seq) を追加していないこと（PR-3A 判断維持・期待: 0行）。
SELECT indexname FROM pg_indexes
WHERE schemaname = 'public' AND tablename = 'interview_transcripts'
  AND indexdef ILIKE '%UNIQUE%' AND indexdef ILIKE '%seq%' AND indexdef NOT ILIKE '%dedup_key%';

-- --- 任意: 実行動作の確認（副作用を残さない・手動で明示実行する）---
-- BEGIN;
--   SELECT public.allocate_transcript_seq(id) AS first_alloc  -- 期待: 1（DEFAULT 0 + post-increment）
--   FROM public.interviews ORDER BY created_at DESC NULLS LAST LIMIT 1;
--   SELECT public.allocate_transcript_seq((SELECT id FROM public.interviews ORDER BY created_at DESC NULLS LAST LIMIT 1)); -- 期待: 2
-- ROLLBACK;  -- 採番を戻す（本番 counter を進めない）
