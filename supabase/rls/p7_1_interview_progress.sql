-- ============================================================================
-- p7_1_interview_progress.sql
--   Phase P7.1: サーバ権威の面接進行状態を interviews に持たせる（additive・1列のみ）。
--     interview_progress jsonb … lib/interview/interview-progress.ts の InterviewProgressState を保存。
--       { interviewId,totalQuestions,currentIndex,currentAnswered,completedCount,followupsUsed,
--         terminal,terminalReason,version,lastEventId }。PII は持たない（index/count のみ）。
--
--   なぜ新列が要るか（既存列で代替できない理由）:
--     * questions_snapshot は「凍結された質問リスト（不変）」であり、可変の進行カーソルを混ぜられない（不変性を壊す）。
--     * next_transcript_seq は「発話単位」の連番で、質問到達 index とは意味が異なる。
--     * status は in_progress/completed/cancelled の粗い状態で、現在質問 index / 完了数を表せない。
--   → 進行カーソルは専用の 1 列（nullable jsonb）が最小かつ安全。既存挙動は非変更（NULL 既定）。
--
--   ※ 手動SQL・Production 未適用（別承認）。additive・可逆。writer は service-role（RLS bypass）のみ。
--   ※ 楽観ロック: writer は (interview_progress->>'version')::int を compare-and-set して並行二重加算を防ぐ
--     （実 SQL は supabase/local/p7_1_interview_progress_test.sql で実証）。
-- ============================================================================
SET lock_timeout = '3s';

BEGIN;

ALTER TABLE public.interviews
  ADD COLUMN IF NOT EXISTS interview_progress jsonb;

COMMIT;

RESET lock_timeout;
