-- ============================================================================
-- e5_4_1_company_audit_logs_ROLLBACK.sql — e5_4_1_company_audit_logs.sql の逆操作（手動・Production 未適用）
--
--   ⚠️ 警告: DROP TABLE public.company_audit_logs は **操作ログ（監査履歴）を完全に失う破壊操作**です。
--            Production 運用開始後（ログ記録が動き出した後）に安易に実行しないこと。必ずバックアップを取得すること。
--   ※ 今回（E-5-4-1）は Production 未適用のため、local 検証での rollback 確認にのみ用いる。
--   ※ companies / profiles / admin_audit_logs には触れない（本 script は company_audit_logs のみを新設したため）。
-- ============================================================================

BEGIN;

DROP TABLE IF EXISTS public.company_audit_logs CASCADE;

COMMIT;
