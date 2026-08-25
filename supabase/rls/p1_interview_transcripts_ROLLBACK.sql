-- ============================================================================
-- p1_interview_transcripts_ROLLBACK.sql
--   Phase P1 の巻き戻し。interview_transcripts テーブルを削除する（可逆・additive の逆操作）。
--   他オブジェクトはこの表に依存しないため CASCADE 不要。既存 interviews/applicants には触れない。
--   ※ 本ファイルは手動実行専用（未実行）。Production 適用は別承認。
-- ============================================================================
SET lock_timeout = '3s';
DROP TABLE IF EXISTS public.interview_transcripts;
RESET lock_timeout;
SELECT to_regclass('public.interview_transcripts') AS interview_transcripts_table; -- NULL 期待
SELECT to_regclass('public.interviews') AS interviews_table,                        -- 温存確認
       to_regclass('public.applicants') AS applicants_table;
