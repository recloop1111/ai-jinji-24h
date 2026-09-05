-- ============================================================================
-- p9_applicant_resume.sql  — デジタル履歴書 v1 / Phase B（schema + index + CHECK + RLS + atomic RPC）
--   ※ 手動SQL・**Production 未適用**（別承認）。additive・可逆（ROLLBACK 同梱: p9_applicant_resume_ROLLBACK.sql）。
--   ※ 既存 applicants 列（prefecture/birth_date/age/education/work_history/qualifications 等）は削除・rename しない。
--   ※ RLS: company(authenticated)=自社 applicant の子行のみ SELECT。admin/super_admin=全社 SELECT。
--       anon / authenticated の INSERT/UPDATE/DELETE ポリシーは付与しない＝公開 write は service-role 経由のみ。
--   ※ RPC: service-role（RLS bypass）が呼ぶ前提の SECURITY INVOKER。client の applicant_id/company_id を権威にしない。
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 0) rollback 安全化のための preflight 記録
--   この script が「新規に追加した列」だけを ROLLBACK が落とせるよう、適用“前”の存在状況を記録する。
--   （万一これらの列名が別経緯で既存だった場合、ROLLBACK が既存列とデータを誤って落とすのを防ぐ）。
--   meta table は移行内部用（列名のみ・PII なし）。default privilege に依存せず RLS 有効＋GRANT 無し＝
--   anon/authenticated からは到達不可（service-role / superuser のみ）。
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public._p9_resume_migration_meta (
  object_name text PRIMARY KEY,
  preexisted  boolean NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public._p9_resume_migration_meta ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._p9_resume_migration_meta FROM PUBLIC, anon, authenticated;

INSERT INTO public._p9_resume_migration_meta (object_name, preexisted)
SELECT c.col,
       EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_schema = 'public' AND table_name = 'applicants' AND column_name = c.col)
FROM (VALUES
  ('postal_code'),('city'),('town'),('address_line'),('building'),
  ('motivation'),('self_pr'),('personal_requests'),('resume_photo_path'),('resume_updated_at')
) AS c(col)
ON CONFLICT (object_name) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 1) applicants への additive 列（すべて NULL 許容・既存応募者を壊さない）
-- ----------------------------------------------------------------------------
ALTER TABLE public.applicants
  ADD COLUMN IF NOT EXISTS postal_code       text,
  ADD COLUMN IF NOT EXISTS city              text,
  ADD COLUMN IF NOT EXISTS town              text,
  ADD COLUMN IF NOT EXISTS address_line      text,
  ADD COLUMN IF NOT EXISTS building          text,
  ADD COLUMN IF NOT EXISTS motivation        text,
  ADD COLUMN IF NOT EXISTS self_pr           text,
  ADD COLUMN IF NOT EXISTS personal_requests text,
  ADD COLUMN IF NOT EXISTS resume_photo_path text,     -- private storage パス（v1 では列のみ・bucket は Phase F）
  ADD COLUMN IF NOT EXISTS resume_updated_at timestamptz;

-- ----------------------------------------------------------------------------
-- 2) 子テーブル: applicant_educations
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.applicant_educations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  applicant_id uuid NOT NULL REFERENCES public.applicants(id) ON DELETE CASCADE,
  sort_order integer NOT NULL DEFAULT 0,
  school_type text NOT NULL
    CHECK (school_type IN ('junior_high','high_school','vocational','junior_college','university','graduate_school','other')),
  school_name text NOT NULL,
  faculty_department text,
  entered_year_month text   CHECK (entered_year_month   IS NULL OR entered_year_month   ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  graduated_year_month text CHECK (graduated_year_month IS NULL OR graduated_year_month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  graduation_status text
    CHECK (graduation_status IS NULL OR graduation_status IN ('graduated','expected','withdrawn','enrolled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- 3) 子テーブル: applicant_work_experiences
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.applicant_work_experiences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  applicant_id uuid NOT NULL REFERENCES public.applicants(id) ON DELETE CASCADE,
  sort_order integer NOT NULL DEFAULT 0,
  company_name text NOT NULL,
  department text,
  position text,
  employment_type text,
  joined_year_month text CHECK (joined_year_month IS NULL OR joined_year_month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  left_year_month   text CHECK (left_year_month   IS NULL OR left_year_month   ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  is_current boolean NOT NULL DEFAULT false,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- 在職中なのに退職年月がある矛盾を禁止（joined>left 等の比較は domain validation 側）。
  CONSTRAINT work_current_no_left CHECK (NOT is_current OR left_year_month IS NULL)
);

-- ----------------------------------------------------------------------------
-- 4) 子テーブル: applicant_licenses
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.applicant_licenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  applicant_id uuid NOT NULL REFERENCES public.applicants(id) ON DELETE CASCADE,
  sort_order integer NOT NULL DEFAULT 0,
  name text NOT NULL,
  acquired_year_month text CHECK (acquired_year_month IS NULL OR acquired_year_month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- 5) Index（(applicant_id, sort_order) 中心。不要な index は増やさない）
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_applicant_educations_applicant       ON public.applicant_educations (applicant_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_applicant_work_experiences_applicant ON public.applicant_work_experiences (applicant_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_applicant_licenses_applicant         ON public.applicant_licenses (applicant_id, sort_order);

-- ----------------------------------------------------------------------------
-- 6) RLS（子3テーブル）: company=自社のみ SELECT / admin=全社 SELECT / write ポリシー無し（service-role のみ）
--     tenant boundary は既存 company_select_applicants / company_select_interview_transcripts と同型
--     （applicant → company_id → profiles.company_id where profiles.id=auth.uid()）。
-- ----------------------------------------------------------------------------
ALTER TABLE public.applicant_educations       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.applicant_work_experiences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.applicant_licenses         ENABLE ROW LEVEL SECURITY;

-- educations
DROP POLICY IF EXISTS company_select_applicant_educations ON public.applicant_educations;
CREATE POLICY company_select_applicant_educations ON public.applicant_educations
  FOR SELECT TO authenticated
  USING (
    applicant_id IN (
      SELECT a.id FROM public.applicants a
       WHERE a.company_id IN (SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid())
    )
  );
DROP POLICY IF EXISTS admin_select_applicant_educations ON public.applicant_educations;
CREATE POLICY admin_select_applicant_educations ON public.applicant_educations
  FOR SELECT TO authenticated
  USING (auth.uid() IN (SELECT p.id FROM public.profiles p WHERE p.role IN ('admin','super_admin')));

-- work_experiences
DROP POLICY IF EXISTS company_select_applicant_work_experiences ON public.applicant_work_experiences;
CREATE POLICY company_select_applicant_work_experiences ON public.applicant_work_experiences
  FOR SELECT TO authenticated
  USING (
    applicant_id IN (
      SELECT a.id FROM public.applicants a
       WHERE a.company_id IN (SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid())
    )
  );
DROP POLICY IF EXISTS admin_select_applicant_work_experiences ON public.applicant_work_experiences;
CREATE POLICY admin_select_applicant_work_experiences ON public.applicant_work_experiences
  FOR SELECT TO authenticated
  USING (auth.uid() IN (SELECT p.id FROM public.profiles p WHERE p.role IN ('admin','super_admin')));

-- licenses
DROP POLICY IF EXISTS company_select_applicant_licenses ON public.applicant_licenses;
CREATE POLICY company_select_applicant_licenses ON public.applicant_licenses
  FOR SELECT TO authenticated
  USING (
    applicant_id IN (
      SELECT a.id FROM public.applicants a
       WHERE a.company_id IN (SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid())
    )
  );
DROP POLICY IF EXISTS admin_select_applicant_licenses ON public.applicant_licenses;
CREATE POLICY admin_select_applicant_licenses ON public.applicant_licenses
  FOR SELECT TO authenticated
  USING (auth.uid() IN (SELECT p.id FROM public.profiles p WHERE p.role IN ('admin','super_admin')));

-- ----------------------------------------------------------------------------
-- 6b) 明示的 table privilege（ambient / default privilege に依存しない＝fresh Supabase へ移植可能）
--   Supabase の default privilege は環境により new table へ SELECT/DML を自動付与しない場合があり、
--   その場合 RLS policy が正しくても authenticated は「permission denied」、SECURITY INVOKER RPC を呼ぶ
--   service-role も INSERT 不可になる。よって既存 interview_transcripts と同じく REVOKE ALL + 明示 GRANT で確定する
--   （行の isolation は上の RLS policy が担い、authenticated は SELECT のみ・書き込みは service_role のみ）。
-- ----------------------------------------------------------------------------
REVOKE ALL ON public.applicant_educations       FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON public.applicant_work_experiences FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON public.applicant_licenses         FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.applicant_educations       TO authenticated;
GRANT SELECT ON public.applicant_work_experiences TO authenticated;
GRANT SELECT ON public.applicant_licenses         TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.applicant_educations       TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.applicant_work_experiences TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.applicant_licenses         TO service_role;

-- ----------------------------------------------------------------------------
-- 7) Atomic RPC: applicant + children を1トランザクションで作成
--     SECURITY INVOKER（＝呼び出しロールで実行）。service-role が呼ぶ想定で、service-role は RLS/権限を bypass するため
--     子テーブルへの INSERT が成立する。危険な SECURITY DEFINER は使わない。
--     - client の applicant_id は使わない（DB 生成）。子行の applicant_id は内部生成 id を使用。
--     - company_id は「server が slug から解決した権威値」を引数で受ける（request body の company_id をそのまま使わない）。
--     - job_id は p_company_id 所属の求人のみ許可（別会社 job を紐づけ不可）。
--     - sort_order は配列の ordinality から 0..N-1 に再採番（client の sort_order を信用しない）。
--     - enum / year-month は各テーブル CHECK で担保（違反時は関数全体が rollback）。
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_applicant_with_resume(
  p_company_id uuid,
  p_applicant jsonb,
  p_educations jsonb DEFAULT '[]'::jsonb,
  p_work_experiences jsonb DEFAULT '[]'::jsonb,
  p_licenses jsonb DEFAULT '[]'::jsonb
) RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_applicant_id uuid;
  v_job_id uuid;
BEGIN
  IF p_company_id IS NULL THEN
    RAISE EXCEPTION 'company_id is required';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.companies c WHERE c.id = p_company_id) THEN
    RAISE EXCEPTION 'company not found';
  END IF;

  -- job_id（任意）は当該 company 所属のみ許可。別会社 job を弾く。
  v_job_id := NULLIF(p_applicant->>'job_id','')::uuid;
  IF v_job_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.jobs j WHERE j.id = v_job_id AND j.company_id = p_company_id) THEN
      RAISE EXCEPTION 'job does not belong to company';
    END IF;
  END IF;

  -- applicant 本体（server 確定値: company_id / status / result / flags）。applicant id は DB 生成。
  INSERT INTO public.applicants (
    company_id, selection_status, status, result, duplicate_flag, inappropriate_flag,
    last_name, first_name, last_name_kana, first_name_kana,
    birth_date, age, gender, phone_number, email,
    postal_code, prefecture, city, town, address_line, building,
    education, work_history, qualifications,
    employment_type, industry_experience, job_id,
    motivation, self_pr, personal_requests, resume_updated_at
  ) VALUES (
    p_company_id, 'pending', '準備中', '未対応', false, false,
    p_applicant->>'last_name', p_applicant->>'first_name', p_applicant->>'last_name_kana', p_applicant->>'first_name_kana',
    NULLIF(p_applicant->>'birth_date','')::date,
    NULLIF(p_applicant->>'age','')::int,
    -- gender は任意入力。未入力(NULL/空)は既存 CHECK が許す 'no_answer' に寄せる（NOT NULL 制約でアトミック失敗させない）。
    COALESCE(NULLIF(p_applicant->>'gender',''), 'no_answer'),
    p_applicant->>'phone_number', p_applicant->>'email',
    p_applicant->>'postal_code', p_applicant->>'prefecture', p_applicant->>'city', p_applicant->>'town',
    p_applicant->>'address_line', p_applicant->>'building',
    p_applicant->>'education', p_applicant->>'work_history', p_applicant->>'qualifications',
    p_applicant->>'employment_type', p_applicant->>'industry_experience', v_job_id,
    p_applicant->>'motivation', p_applicant->>'self_pr', p_applicant->>'personal_requests', now()
  ) RETURNING id INTO v_applicant_id;

  -- educations（sort_order は ordinality-1 に再採番。applicant_id は内部生成 id）
  INSERT INTO public.applicant_educations (
    applicant_id, sort_order, school_type, school_name, faculty_department,
    entered_year_month, graduated_year_month, graduation_status
  )
  SELECT v_applicant_id, (ord - 1)::int,
         e->>'school_type', e->>'school_name', e->>'faculty_department',
         NULLIF(e->>'entered_year_month',''), NULLIF(e->>'graduated_year_month',''), NULLIF(e->>'graduation_status','')
  FROM jsonb_array_elements(COALESCE(p_educations,'[]'::jsonb)) WITH ORDINALITY AS t(e, ord);

  -- work_experiences
  INSERT INTO public.applicant_work_experiences (
    applicant_id, sort_order, company_name, department, position, employment_type,
    joined_year_month, left_year_month, is_current, description
  )
  SELECT v_applicant_id, (ord - 1)::int,
         w->>'company_name', w->>'department', w->>'position', w->>'employment_type',
         NULLIF(w->>'joined_year_month',''), NULLIF(w->>'left_year_month',''),
         COALESCE((w->>'is_current')::boolean, false), w->>'description'
  FROM jsonb_array_elements(COALESCE(p_work_experiences,'[]'::jsonb)) WITH ORDINALITY AS t(w, ord);

  -- licenses
  INSERT INTO public.applicant_licenses (
    applicant_id, sort_order, name, acquired_year_month
  )
  SELECT v_applicant_id, (ord - 1)::int,
         l->>'name', NULLIF(l->>'acquired_year_month','')
  FROM jsonb_array_elements(COALESCE(p_licenses,'[]'::jsonb)) WITH ORDINALITY AS t(l, ord);

  RETURN v_applicant_id;
END;
$$;

-- browser（anon/authenticated）から直接 RPC を呼ばせない。実行は service_role のみに限定。
REVOKE ALL ON FUNCTION public.create_applicant_with_resume(uuid, jsonb, jsonb, jsonb, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_applicant_with_resume(uuid, jsonb, jsonb, jsonb, jsonb) FROM anon;
REVOKE ALL ON FUNCTION public.create_applicant_with_resume(uuid, jsonb, jsonb, jsonb, jsonb) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.create_applicant_with_resume(uuid, jsonb, jsonb, jsonb, jsonb) TO service_role;

COMMIT;

-- ----------------------------------------------------------------------------
-- 適用後の検証（READ-ONLY・任意）
--   select to_regclass('public.applicant_educations'), to_regclass('public.applicant_work_experiences'), to_regclass('public.applicant_licenses');
--   select relrowsecurity from pg_class where relname='applicant_educations';
--   select proname, prosecdef from pg_proc where proname='create_applicant_with_resume';  -- prosecdef=false（INVOKER）
-- ----------------------------------------------------------------------------
