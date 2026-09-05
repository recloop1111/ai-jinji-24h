-- ============================================================================
-- e5_3_1_member_invites_ROLLBACK.sql — e5_3_1_member_invites.sql の逆操作（手動・Production 未適用）
--
--   ⚠️ 警告: DROP TABLE public.member_invites は **招待データ（pending/accepted/revoked/expired の全履歴）を
--            完全に失う破壊操作**です。Production 運用開始後（E-5-3-2 で招待作成が動き出した後）に
--            安易に実行しないこと。実行する場合は必ずバックアップを取得すること。
--   ※ 今回（E-5-3-1）は Production 未適用のため、local 検証での rollback 確認にのみ用いる。
--   ※ companies / profiles / company_members には触れない（本 script は member_invites のみを新設したため）。
-- ============================================================================

BEGIN;

DROP TABLE IF EXISTS public.member_invites CASCADE;

COMMIT;
