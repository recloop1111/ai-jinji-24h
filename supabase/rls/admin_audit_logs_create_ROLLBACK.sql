-- ============================================================================
-- admin_audit_logs_create_ROLLBACK.sql
--   admin_audit_logs_create.sql の取り消し（テーブル削除）。
--
-- 【重要】
--   * MIGRATION ではない。手動実行専用・**未適用**。
--   * テーブルを削除すると監査ログも消える点に注意（必要なら事前に SELECT * でエクスポート）。
--   * 監査ログを残しつつロールバックしたい場合は DROP せず、関連 API/UI を無効化する方を推奨。
-- ============================================================================

-- 事前退避（任意・READ-ONLY）:
--   SELECT * FROM public.admin_audit_logs ORDER BY created_at;  -- 必要なら結果を保管

BEGIN;

DROP INDEX IF EXISTS public.idx_admin_audit_logs_company_created;
DROP INDEX IF EXISTS public.idx_admin_audit_logs_created;
DROP INDEX IF EXISTS public.idx_admin_audit_logs_action;

DROP TABLE IF EXISTS public.admin_audit_logs;

COMMIT;

-- 検証（READ-ONLY）:
--   SELECT to_regclass('public.admin_audit_logs');  -- NULL になっていれば削除完了
