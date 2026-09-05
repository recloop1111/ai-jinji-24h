-- ============================================================================
-- e5_4_1_company_audit_logs.sql — 企業操作ログ（append-only audit）DB 基盤
--   ※ 手動SQL・**Production 未適用**（別承認・ROLLBACK 同梱: e5_4_1_company_audit_logs_ROLLBACK.sql）。
--   ※ 記録するのは「個人情報 export」と「meaningful mutation」のみ（閲覧/login/denied は対象外）。
--   ※ append-only: browser（anon/authenticated）からは一切アクセス不可（RLS 有効＋GRANT なし＋policy 0）。
--     service_role には SELECT/INSERT のみ GRANT（UPDATE/DELETE は与えない＝改竄/削除機能を作らない）。
--   ※ 運営用の admin_audit_logs（別テーブル）とは別物。混同しない。
--   ※ 過去操作の backfill はしない（空テーブルを作るだけ）。
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.company_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  actor_user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,   -- ユーザ削除でも履歴保持
  actor_company_role text CHECK (actor_company_role IS NULL OR actor_company_role IN ('owner','admin','recruiter','viewer')), -- 操作当時の role snapshot
  action text NOT NULL,                                    -- 英語 stable ID（app allowlist 側で制限・DB は text）
  resource_type text NOT NULL,                             -- applicant / member / member_invite / company / template
  resource_id uuid,                                        -- 対象 id（applicants.id / company_members.id / member_invites.id / companies.id / template id）
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),  -- 最小限のみ（PII/token/本文 禁止）
  created_at timestamptz NOT NULL DEFAULT now()
);

-- index: 企業ごと新しい順（一覧）/ action 絞り込み / resource 参照
CREATE INDEX IF NOT EXISTS idx_company_audit_logs_company_created ON public.company_audit_logs (company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_company_audit_logs_company_action ON public.company_audit_logs (company_id, action);
CREATE INDEX IF NOT EXISTS idx_company_audit_logs_resource ON public.company_audit_logs (company_id, resource_type, resource_id);

COMMENT ON TABLE public.company_audit_logs IS
  '企業操作ログ（append-only）。export/meaningful mutation のみ。metadata に PII/token/本文を入れない。運営用 admin_audit_logs とは別物。';
COMMENT ON COLUMN public.company_audit_logs.actor_company_role IS '操作当時の company_members.company_role snapshot（profiles.role とは別体系）。';

-- append-only RLS: browser 到達不可（GRANT なし・policy 0）。service_role は SELECT/INSERT のみ。
ALTER TABLE public.company_audit_logs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.company_audit_logs FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT ON public.company_audit_logs TO service_role;   -- UPDATE/DELETE は与えない

COMMIT;

-- ----------------------------------------------------------------------------
-- 適用後の検証（READ-ONLY・任意）
--   select to_regclass('public.company_audit_logs');
--   select relrowsecurity from pg_class where relname='company_audit_logs';         -- true
--   select count(*) from pg_policies where schemaname='public' and tablename='company_audit_logs'; -- 0
--   select privilege_type from information_schema.role_table_grants
--     where table_name='company_audit_logs' and grantee='service_role';             -- SELECT, INSERT のみ
-- ----------------------------------------------------------------------------
