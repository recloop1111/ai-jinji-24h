-- ============================================================================
-- e5_1_company_members_ROLLBACK.sql — e5_1_company_members.sql の逆操作（手動・Production 未適用）
--   company_members（本 script で新規作成）を index/policy/constraint ごと DROP。
--   profiles・companies・既存 RLS には触れない（本 script は company_members のみを新設したため）。
--   ※ company_members に実データ（メンバー/招待/監査の下地）がある状態での DROP は失う。バックアップの上で実行すること。
-- ============================================================================

BEGIN;

DROP TABLE IF EXISTS public.company_members CASCADE;

COMMIT;
