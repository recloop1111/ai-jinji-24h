-- ============================================================================
-- phase2g_companies_billing_columns_authenticated_revoke.sql
--   RLSハードニング Phase 2-g（対象: companies の課金/契約/停止/設定PW列の authenticated 直接UPDATE 遮断）
--
-- 【重要】
--   * これは MIGRATION ではない。supabase/migrations には置かない（本番自動適用しない）。
--   * 手動実行専用（運用者が Supabase SQL Editor / psql で意図的に流す）。本ファイルは未実行。
--   * 本番DBへの適用は承認後に行う。
--
-- 背景 / 穴（Codex P1）:
--   companies には authenticated 向けの行レベル UPDATE ポリシー（company_update_own 等, USING auth.uid()=自社）が
--   残っている。Postgres の UPDATE ポリシー（RLS）は「行」を制限するが「列」は制限しない。
--   かつ authenticated ロールは companies に対しテーブル全体の UPDATE 権限を持つため、
--   ログイン企業ユーザーは PostgREST を直接叩いて自社行の課金/契約列
--   （price_per_interview / monthly_interview_limit / plan / is_suspended / status /
--    company_setting_password_hash / next_month_interview_limit / next_month_limit_effective_month）
--   を直接書き換えできてしまう（admin の設定パスワードゲートを回避）。
--
-- 対策（列レベル権限で機微列の UPDATE を禁止）:
--   * Postgres では「列単体の REVOKE」はテーブル全体 UPDATE 付与を上書きしないため効かない。
--     正しくは「テーブル全体 UPDATE を REVOKE → 許可列のみ列 GRANT」の 2 段で行う。
--   * service_role は本権限体系（および RLS）を bypass するため、admin / 公開フロー / 移行済み client API
--     （いずれも service-role 経由）には影響しない。
--
-- 前提（Tier2 コード移行・実施済み。これが無いと正規フローが壊れる）:
--   - client/plan PATCH の companies.next_month_* 書き込みを service-role 化済み。
--   - client/security/setting-password の company_setting_password_hash 書き込みを service-role 化済み。
--   - これにより authenticated が直接 UPDATE する companies 列は、
--     name / contact_person / contact_email / phone（client/settings 画面）/ onboarding_completed（onboarding）
--     / updated_at のみとなった（監査で確認）。
--
-- 適用前チェック（読み取りのみ・必ず流して現状を確認すること）:
--   SELECT grantee, privilege_type, column_name
--   FROM information_schema.role_column_grants
--   WHERE table_schema='public' AND table_name='companies' AND grantee='authenticated'
--   ORDER BY column_name;
--   -- ここで authenticated が UPDATE を持つ列を確認し、下の許可列リストに過不足がないか突き合わせる。
-- ============================================================================

BEGIN;

-- 1) authenticated のテーブル全体 UPDATE を剥奪（列制限を効かせる前提）
REVOKE UPDATE ON public.companies FROM authenticated;

-- 2) client が正規に自己更新する「非機微列のみ」を列 GRANT で戻す
--    （機微列＝price_per_interview / monthly_interview_limit / plan / is_suspended / status /
--      company_setting_password_hash / next_month_interview_limit / next_month_limit_effective_month は GRANT しない）
GRANT UPDATE (
  name,
  contact_person,
  contact_email,
  phone,
  onboarding_completed,
  updated_at
) ON public.companies TO authenticated;

COMMIT;

-- ============================================================================
-- 適用後の検証（読み取りのみ）:
--   SELECT column_name FROM information_schema.role_column_grants
--   WHERE table_schema='public' AND table_name='companies'
--     AND grantee='authenticated' AND privilege_type='UPDATE'
--   ORDER BY column_name;
--   -- 期待: name / contact_person / contact_email / phone / onboarding_completed / updated_at のみ。
--   --       機微8列が含まれないこと。
--
-- 動作確認（手動）:
--   - 企業ログインセッションで PostgREST 直に price_per_interview を UPDATE → 権限エラーになること。
--   - client/settings から会社名・連絡先の保存ができること（authenticated 直接UPDATE・許可列）。
--   - client/plan の翌月予約保存ができること（service-role 経由のため成功）。
--   - client/security/setting-password の設定/変更ができること（service-role 経由のため成功）。
--   - admin/companies/[id] PATCH（price/limit/plan/status 等・service-role）が従来どおり成功すること。
-- ============================================================================
