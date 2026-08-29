-- ============================================================================
-- p9_applicant_resume_ROLLBACK.sql — p9_applicant_resume.sql の逆操作（手動・Production 未適用）
--   子テーブル/RPC/追加列を除去。既存 applicants の従来列（prefecture/birth_date/age/education/
--   work_history/qualifications 等）には触れない。
--   ※ 子テーブルに実データがある状態での DROP は履歴書データを失う。バックアップの上で実行すること。
-- ============================================================================

BEGIN;

DROP FUNCTION IF EXISTS public.create_applicant_with_resume(uuid, jsonb, jsonb, jsonb, jsonb);

DROP TABLE IF EXISTS public.applicant_licenses;
DROP TABLE IF EXISTS public.applicant_work_experiences;
DROP TABLE IF EXISTS public.applicant_educations;

ALTER TABLE public.applicants
  DROP COLUMN IF EXISTS postal_code,
  DROP COLUMN IF EXISTS city,
  DROP COLUMN IF EXISTS town,
  DROP COLUMN IF EXISTS address_line,
  DROP COLUMN IF EXISTS building,
  DROP COLUMN IF EXISTS motivation,
  DROP COLUMN IF EXISTS self_pr,
  DROP COLUMN IF EXISTS personal_requests,
  DROP COLUMN IF EXISTS resume_photo_path,
  DROP COLUMN IF EXISTS resume_updated_at;

COMMIT;
