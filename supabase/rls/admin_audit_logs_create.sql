-- ============================================================================
-- admin_audit_logs_create.sql
--   運営の重要操作（企業ログイン情報の閲覧/再設定/仮PW発行/メール変更 等）の監査ログ table。
--
-- 【重要】
--   * これは MIGRATION ではない。supabase/migrations には置かない（本番自動適用しない）。
--   * 手動実行専用・**承認待ち（未適用）**。本番DBへの実行は承認後。
--   * service-role のみ読み書き可（anon / authenticated は不可）。
--   * detail(jsonb) に **パスワード / 仮パスワード / ハッシュは絶対に保存しない**（アプリ側で保証）。
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 0) 適用前チェック（READ-ONLY・先に流して前提を確認）
-- ---------------------------------------------------------------------------
--   SELECT to_regclass('public.admin_audit_logs') AS table_exists;      -- NULL=未作成（作成してよい）
--   SELECT to_regclass('public.companies')        AS companies_exists;  -- 非NULL であること（FK先）
--   SELECT extname FROM pg_extension WHERE extname='pgcrypto';          -- gen_random_uuid 用（Supabaseは既定で有効）

BEGIN;

-- 1) テーブル作成
CREATE TABLE IF NOT EXISTS public.admin_audit_logs (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id       uuid,                       -- 実行 admin の auth.users.id（FKなし: ユーザ削除でも監査履歴を残す）
  actor_role          text,                       -- 'admin' / 'super_admin'
  target_company_id   uuid REFERENCES public.companies(id) ON DELETE SET NULL, -- 企業削除でも履歴保持
  target_auth_user_id uuid,                       -- 対象企業の auth.users.id（FKなし: 同上）
  action              text NOT NULL,              -- view_login_info / send_password_reset / issue_temp_password / change_login_email
  detail              jsonb NOT NULL DEFAULT '{}'::jsonb, -- 例 {"old_email":"..","new_email":".."}。PW/仮PW/ハッシュは禁止
  ip                  text,
  user_agent          text,
  created_at          timestamptz NOT NULL DEFAULT now()
);

-- 2) インデックス（企業ごと新しい順 / 全体新しい順 / action 絞り込み）
CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_company_created
  ON public.admin_audit_logs (target_company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_created
  ON public.admin_audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_action
  ON public.admin_audit_logs (action);

-- 3) RLS 有効化（ポリシーは作らない＝anon/authenticated は到達不可。service_role は RLS を bypass）
ALTER TABLE public.admin_audit_logs ENABLE ROW LEVEL SECURITY;

-- 4) 明示的に anon/authenticated のテーブル権限を剥奪（多層防御。既定 grant が付いていても遮断）
REVOKE ALL ON public.admin_audit_logs FROM anon, authenticated;

-- 5) service_role には明示付与（Supabase 既定でも付くが明示）
GRANT ALL ON public.admin_audit_logs TO service_role;

COMMIT;

-- ---------------------------------------------------------------------------
-- 6) 適用後の検証（READ-ONLY）
-- ---------------------------------------------------------------------------
--   SELECT relrowsecurity FROM pg_class WHERE oid='public.admin_audit_logs'::regclass;        -- true（RLS有効）
--   SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='admin_audit_logs'; -- 0（ポリシー無し＝service-roleのみ）
--   SELECT grantee, privilege_type FROM information_schema.role_table_grants
--     WHERE table_schema='public' AND table_name='admin_audit_logs' AND grantee IN ('anon','authenticated'); -- 0 行（権限なし）
--   SELECT grantee, privilege_type FROM information_schema.role_table_grants
--     WHERE table_schema='public' AND table_name='admin_audit_logs' AND grantee='service_role'; -- 権限あり
-- ============================================================================
