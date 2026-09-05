-- ============================================================================
-- e5_3_1_member_invites.sql — 企業メンバー招待の DB 基盤（新規テーブル・additive）
--   ※ 手動SQL・**Production 未適用**（別承認・ROLLBACK 同梱: e5_3_1_member_invites_ROLLBACK.sql）。
--   ※ E-5-3-1 では table のみ作成。token 生成 / invite 作成API / メール送信 / accept は E-5-3-2。
--   ※ 企業内 role の SoT は company_members。member_invites は「招待の状態」を保持する補助テーブル。
--   ※ owner は招待 role として不可（CHECK で admin/recruiter/viewer のみ）。owner は 1 company 1 名で別管理。
--   ※ token は **hash のみ保存**（平文 token を DB にもログにも出さない）。
--   ※ browser からは一切アクセスさせない（RLS 有効＋anon/authenticated へ GRANT しない＝server+service_role 専用）。
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.member_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  email text NOT NULL,                                  -- E-5-3-2 で trim+lowercase 正規化して保存
  company_role text NOT NULL CHECK (company_role IN ('admin','recruiter','viewer')),  -- owner 招待は禁止
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','revoked','expired')),
  token_hash text NOT NULL,                             -- SHA-256 等の hash のみ（平文 token は保存しない）
  invited_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  expires_at timestamptz NOT NULL,
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- token collision / replay 防止（hash 一意）
CREATE UNIQUE INDEX IF NOT EXISTS uq_member_invites_token_hash ON public.member_invites (token_hash);
-- 同一 company + email で pending を複数持たせない（再送は古い pending を無効化して再発行する運用）
CREATE UNIQUE INDEX IF NOT EXISTS uq_member_invites_pending_email
  ON public.member_invites (company_id, email) WHERE status = 'pending';
-- 一覧取得（company 単位・status 絞り込み）用の最小 index
CREATE INDEX IF NOT EXISTS idx_member_invites_company ON public.member_invites (company_id, status);

COMMENT ON TABLE public.member_invites IS
  '企業メンバー招待の状態（pending/accepted/revoked/expired）。token は hash のみ保存。server+service_role 専用。';
COMMENT ON COLUMN public.member_invites.token_hash IS '招待 token の hash（SHA-256 等）。平文 token は保存しない。';

-- RLS: browser（anon/authenticated）からは SELECT/INSERT/UPDATE/DELETE いずれも不可。
--   GRANT を与えず policy も作らない＝到達不可。service_role は BYPASSRLS＋GRANT で server から操作。
ALTER TABLE public.member_invites ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.member_invites FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.member_invites TO service_role;

COMMIT;

-- ----------------------------------------------------------------------------
-- 適用後の検証（READ-ONLY・任意）
--   select to_regclass('public.member_invites');
--   select relrowsecurity from pg_class where relname='member_invites';         -- true
--   select count(*) from pg_policies where schemaname='public' and tablename='member_invites'; -- 0（policy 無し）
-- ----------------------------------------------------------------------------
