-- ============================================================================
-- pr3a_interview_transcripts_ROLLBACK.sql
--   PR-3A の巻き戻し。新テーブル public.interview_transcripts のみを安全に削除する。
--   * 手動実行専用・未実行。適用（= 本番反映）は承認後。
--   * 新テーブル1個の DROP のみ。既存 interviews / interview_logs / applicants /
--     interview_results 等には一切触れない。
--   * テーブルに紐づく索引 / policy / RLS 設定は DROP TABLE で自動的に一緒に消える
--     （明示 DROP INDEX / DROP POLICY は不要）。
--   * DROP TABLE は対象テーブルに ACCESS EXCLUSIVE を取るため lock_timeout でガードする。
--   * この時点でアプリ側に interview_transcripts を参照する本番経路は無い（PR-3A はスキーマ + 純ロジックのみ。
--     書込 API / 表示は PR-3B / PR-3D）。よって DROP しても本番フロー（面接・mock）は壊れない。
-- ============================================================================

SET lock_timeout = '3s';

DROP TABLE IF EXISTS public.interview_transcripts;  -- CASCADE 不要（他オブジェクトはこの表に依存しない）

RESET lock_timeout;

-- 確認（期待: NULL = テーブルが消えている）。
SELECT to_regclass('public.interview_transcripts') AS interview_transcripts_table;

-- 既存テーブルが無傷であることの確認（期待: いずれも非 NULL）。
SELECT to_regclass('public.interviews')     AS interviews_table,
       to_regclass('public.interview_logs') AS interview_logs_table;
