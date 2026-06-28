-- ============================================================================
-- phase2g_companies_billing_columns_authenticated_revoke_ROLLBACK.sql
--   Phase 2-g の取り消し（companies の authenticated UPDATE 権限を「テーブル全体」に戻す）。
--
-- 【重要】
--   * MIGRATION ではない。手動実行専用。本ファイルは未実行。
--   * phase2g を適用した状態から「元（authenticated がテーブル全体 UPDATE 可）」へ戻すための SQL。
--   * 戻すと機微列（price_per_interview 等）の直接 UPDATE 穴も復活する点に注意（緊急時の退避用）。
-- ============================================================================

BEGIN;

-- 1) phase2g で列 GRANT した非機微列の付与を取り消す
REVOKE UPDATE (
  name,
  contact_person,
  contact_email,
  phone,
  onboarding_completed,
  updated_at
) ON public.companies FROM authenticated;

-- 2) テーブル全体 UPDATE を再付与（phase2g 適用前の状態）
GRANT UPDATE ON public.companies TO authenticated;

COMMIT;

-- 検証（読み取りのみ）:
--   SELECT privilege_type, column_name FROM information_schema.role_column_grants
--   WHERE table_schema='public' AND table_name='companies' AND grantee='authenticated';
--   -- 期待: テーブル全体 UPDATE（column_name は NULL/全列）に戻っていること。
