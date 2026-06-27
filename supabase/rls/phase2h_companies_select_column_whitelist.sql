-- ============================================================================
-- phase2h_companies_select_column_whitelist.sql
--   RLSハードニング Phase 2-h（対象: companies の SELECT を「安全列ホワイトリスト」化）
--
-- 【重要】
--   * これは MIGRATION ではない。supabase/migrations には置かない（本番自動適用しない）。
--   * 手動実行専用（運用者が Supabase SQL Editor / psql で意図的に流す）。本ファイルは未実行。
--   * 本番DBへの適用は承認後に行う。
--
-- 背景 / 穴（Codex P1）:
--   companies には authenticated / anon にテーブル全体 SELECT 権がある（実DB確認済み）。
--   RLS の `company_select_own`（authenticated・自社行）により、ログイン企業ユーザーは
--   PostgREST を直接叩いて自社行の任意列を読める。RLS は「行」を制限するが「列」は制限しない。
--   そのため company_setting_password_hash（CSV出力/停止/上限変更をゲートする scrypt hash）や
--   auth_user_id / stripe_* が authenticated から自己可読＝オフライン解析のリスク。
--   anon もテーブル全体 SELECT 権を持つ（RLSポリシーは phase2d で遮断済みだが、列権限は残存）。
--
-- 対策（列レベル SELECT 権で機微列を遮断）:
--   * Postgres では「列単体 REVOKE」はテーブル全体付与を上書きしないため効かない。
--     正しくは「テーブル全体 SELECT を REVOKE → 許可列のみ列 GRANT」の2段で行う（phase2g の SELECT版）。
--   * service_role は本権限体系（および RLS）を bypass するため、service-role 経由の
--     admin / 公開フロー / 移行済み client API には影響しない。
--
-- ============================================================================
-- 【適用前に必須の「コード前提（Tier2 SELECT 移行）」— 未了で適用すると下記が壊れる】
--   以下は現在 authenticated（cookie-session）で companies の機微列 / select('*') を読むため、
--   本SQL（テーブル全体 SELECT 剥奪）適用前に service-role もしくは安全列の明示 SELECT へ移行すること:
--     1) app/api/client/suspension/request/route.ts   : select('company_setting_password_hash') を service-role へ
--     2) app/api/client/suspension/emergency/route.ts : select('company_setting_password_hash') を service-role へ
--     3) app/api/client/plan/route.ts (PATCH)         : select('*')＋hash検証 を service-role へ（hash読みは service-role）
--     4) app/api/client/plan/route.ts (GET)           : select('*') を安全列の明示 select へ（hash不要）or service-role
--     5) app/api/client/security/setting-password/route.ts (GET) : select('*')（hash含む）を service-role へ
--   ※ これらを移行せずに適用すると、停止申請 / 緊急停止 / プラン取得・変更 / 設定PW状態取得 が
--     「列 permission denied」または hash 取得不可で失敗する。
--   ※ 移行は本SQLとは別コミット（DB変更なし）で先行する。承認後に [コード移行 → 本SQL適用] の順。
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 適用前チェック（READ-ONLY・状態を変えない）
-- ----------------------------------------------------------------------------
-- (1) authenticated / anon が現状 SELECT 権を持つ companies 列
-- SELECT grantee, privilege_type, column_name
-- FROM information_schema.role_column_grants
-- WHERE table_schema='public' AND table_name='companies'
--   AND grantee IN ('authenticated','anon') AND privilege_type='SELECT'
-- ORDER BY grantee, column_name;
--
-- (2) テーブル全体 SELECT 付与の有無
-- SELECT grantee, privilege_type FROM information_schema.role_table_grants
-- WHERE table_schema='public' AND table_name='companies'
--   AND grantee IN ('authenticated','anon') AND privilege_type='SELECT';
--
-- (3) 機微列が authenticated から見えているか（=穴の確認）
-- SELECT column_name FROM information_schema.role_column_grants
-- WHERE table_schema='public' AND table_name='companies'
--   AND grantee='authenticated' AND privilege_type='SELECT'
--   AND column_name IN ('company_setting_password_hash','auth_user_id',
--                       'stripe_customer_id','stripe_subscription_id');

BEGIN;

-- 1) anon のテーブル全体 SELECT を剥奪（公開フローは service-role API 経由＝anon直読み不要）。
--    anon には列 GRANT を一切戻さない（companies は anon から読ませない）。
REVOKE SELECT ON public.companies FROM anon;

-- 2) authenticated のテーブル全体 SELECT を剥奪（列制限を効かせる前提）。
REVOKE SELECT ON public.companies FROM authenticated;

-- 3) authenticated にはブラウザ/cookie-session で実際に読む「安全列のみ」を列 GRANT で戻す。
--    機微列（company_setting_password_hash / auth_user_id / stripe_customer_id /
--    stripe_subscription_id）と、ブラウザ直読みされない内部列
--    （culture_analysis_enabled / auto_upgrade_enabled / billing_cycle_start 等）は GRANT しない。
GRANT SELECT (
  id,
  name,
  email,
  phone,
  contact_person,
  contact_email,
  interview_slug,
  plan,
  monthly_interview_count,
  monthly_interview_limit,
  next_month_interview_limit,
  next_month_limit_effective_month,
  is_suspended,
  onboarding_completed,
  price_per_interview,
  created_at
) ON public.companies TO authenticated;

COMMIT;

-- ----------------------------------------------------------------------------
-- 適用後の検証（READ-ONLY）
-- ----------------------------------------------------------------------------
-- (A) authenticated の SELECT 可能列が上記16列のみであること
-- SELECT column_name FROM information_schema.role_column_grants
-- WHERE table_schema='public' AND table_name='companies'
--   AND grantee='authenticated' AND privilege_type='SELECT'
-- ORDER BY column_name;
--   -- 期待: 上記16列のみ。company_setting_password_hash / auth_user_id / stripe_* を含まないこと。
--
-- (B) anon が companies に SELECT 権を持たないこと（0行）
-- SELECT column_name FROM information_schema.role_column_grants
-- WHERE table_schema='public' AND table_name='companies'
--   AND grantee='anon' AND privilege_type='SELECT';
--
-- 動作確認（手動・コード前提 1〜5 を移行済みであること）:
--   - 企業ログインセッションで PostgREST 直に company_setting_password_hash を select → 権限エラー。
--   - client/settings 表示（name/contact_*/phone/email/interview_slug）OK。
--   - client/dashboard（monthly_interview_count/limit）/ client/billing（limit/price_per_interview）OK。
--   - GET /api/client/company（id/name/email/interview_slug/plan/limit/next_month_*/is_suspended/
--     onboarding_completed/created_at）OK。
--   - 停止申請 / 緊急停止 / プラン取得・変更 / 設定PW状態取得（=service-role 移行済み）OK。

-- ============================================================================
-- ROLLBACK（適用を取り消す場合・承認後）
-- ============================================================================
-- BEGIN;
--   REVOKE SELECT ON public.companies FROM authenticated; -- 念のため列GRANTを一旦剥がす
--   GRANT  SELECT ON public.companies TO authenticated;    -- テーブル全体 SELECT を復元
--   GRANT  SELECT ON public.companies TO anon;             -- anon テーブル全体 SELECT を復元
-- COMMIT;
-- ※ ロールバックは「列ホワイトリスト前（=全列可）」に戻すだけ。穴も復活する点に注意。
-- ============================================================================
