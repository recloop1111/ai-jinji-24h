-- ============================================================================
-- e5_1_company_members.sql — 企業RBAC DB foundation（company_members・追加のみ・非破壊）
--   ※ 手動SQL・**Production 未適用**（別承認・ROLLBACK 同梱: e5_1_company_members_ROLLBACK.sql）。
--   ※ additive のみ。profiles（.role=運営admin / .company_id=tenant anchor）は変更しない。
--     既存 RLS（applicants/interviews/jobs/job_questions/…）も変更しない＝既存挙動は不変（enforcement は E-5-2）。
--   ※ 企業内 role の SoT = company_members.company_role（owner/admin/recruiter/viewer）。
--     profiles.role（admin/super_admin）＝AIMEN24 運営専用で別物（流用しない）。
--   ※ v1: 1 user = 1 company（UNIQUE user_id）／1 company = 1 OWNER（partial unique）。
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 0) backfill 安全検査（fail-fast）: 1 company に client candidate が複数いるなら中止。
--    「誰を OWNER にするか」はセキュリティ判断であり migration が推測してはならない。
--    client candidate = profiles.company_id IS NOT NULL AND role が運営admin でない（NULL 含む）。
-- ----------------------------------------------------------------------------
DO $$
DECLARE v_bad int;
BEGIN
  SELECT count(*) INTO v_bad FROM (
    SELECT p.company_id
      FROM public.profiles p
     WHERE p.company_id IS NOT NULL
       AND (p.role IS NULL OR p.role NOT IN ('admin','super_admin'))
     GROUP BY p.company_id
    HAVING count(*) > 1
  ) t;
  IF v_bad > 0 THEN
    RAISE EXCEPTION 'company_members backfill aborted: % company(ies) に複数の client candidate が存在します。OWNER は手動で決定してください（migration は推測しません）。', v_bad;
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 1) company_members テーブル
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.company_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  -- profiles(id) = auth.users.id（既存の profiles 参照規約に合わせる）。
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  company_role text NOT NULL CHECK (company_role IN ('owner','admin','recruiter','viewer')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','removed')),
  full_name text,                                   -- 企業ユーザー氏名（現状 profiles に無い）。backfill は NULL（推測生成しない）
  invited_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,  -- 招待者（E-5-3）
  invited_at timestamptz,
  joined_at timestamptz,
  last_login_at timestamptz,                        -- login tracking は E-5-5
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- OWNER は必ず active（suspended/removed の owner を作らない）。owner 0 人化の完全防止は E-5-3 の server guard。
  CONSTRAINT company_members_owner_active CHECK (company_role <> 'owner' OR status = 'active')
);

-- ----------------------------------------------------------------------------
-- 2) 一意制約 / index
-- ----------------------------------------------------------------------------
-- v1: 1 user = 1 company（1 user につき membership は 1 行）。将来 multi-company 化はこの UNIQUE を外す migration で拡張。
CREATE UNIQUE INDEX IF NOT EXISTS uq_company_members_user ON public.company_members (user_id);
-- 1 company = 1 OWNER（partial unique）。
CREATE UNIQUE INDEX IF NOT EXISTS uq_company_members_one_owner ON public.company_members (company_id) WHERE company_role = 'owner';
-- company 単位の一覧用（小規模テーブル。過剰 index は作らない）。
CREATE INDEX IF NOT EXISTS idx_company_members_company ON public.company_members (company_id);

-- ----------------------------------------------------------------------------
-- 3) COMMENT（責務分離を明示）
-- ----------------------------------------------------------------------------
COMMENT ON TABLE public.company_members IS
  '企業内メンバーシップ/RBAC の SoT。company_role=企業RBAC(owner/admin/recruiter/viewer)。profiles.role(admin/super_admin)=AIMEN24 運営専用で別物。';
COMMENT ON COLUMN public.company_members.company_role IS '企業内 role（owner/admin/recruiter/viewer）。profiles.role とは別体系。';

-- ----------------------------------------------------------------------------
-- 4) RLS: 本人が自分の membership 行のみ SELECT。browser からの INSERT/UPDATE/DELETE policy は付けない
--     （role 変更を client から直接できる状態を絶対に作らない）。全社一覧は E-5-3 の API で扱う。
--     自己参照 USING (user_id = auth.uid()) で recursion なし。
-- ----------------------------------------------------------------------------
ALTER TABLE public.company_members ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.company_members FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.company_members TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.company_members TO service_role;

DROP POLICY IF EXISTS company_members_self_select ON public.company_members;
CREATE POLICY company_members_self_select ON public.company_members
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- ----------------------------------------------------------------------------
-- 5) 既存 client user を OWNER として backfill（重複 INSERT しない・既存 role を上書きしない）
--     対象 = client candidate（company_id あり・運営admin でない）。運営admin(profiles.role in admin/super_admin)は対象外。
--     full_name=NULL / invited_*=NULL / last_login_at=NULL（推測しない）。joined_at のみ実行時刻。
-- ----------------------------------------------------------------------------
INSERT INTO public.company_members (company_id, user_id, company_role, status, joined_at)
SELECT p.company_id, p.id, 'owner', 'active', now()
  FROM public.profiles p
 WHERE p.company_id IS NOT NULL
   AND (p.role IS NULL OR p.role NOT IN ('admin','super_admin'))
   AND NOT EXISTS (SELECT 1 FROM public.company_members m WHERE m.user_id = p.id)
ON CONFLICT (user_id) DO NOTHING;  -- 既存 membership は上書きしない（role を owner へ強制しない）

COMMIT;

-- ----------------------------------------------------------------------------
-- 適用後の検証（READ-ONLY・任意）
--   select to_regclass('public.company_members');
--   select relrowsecurity from pg_class where relname='company_members';                  -- true
--   select company_role, count(*) from public.company_members group by company_role;      -- owner のみ（backfill 直後）
--   select count(*) from public.company_members m join public.profiles p on p.id=m.user_id
--     where p.role in ('admin','super_admin');                                            -- 0（運営admin は非対象）
-- ----------------------------------------------------------------------------
