-- ============================================================================
-- p9_applicant_resume_ROLLBACK.sql — p9_applicant_resume.sql の逆操作（手動・Production 未適用）
--   子テーブル/RPC/追加列を除去。既存 applicants の従来列（prefecture/birth_date/age/education/
--   work_history/qualifications 等）には触れない。
--   ※ 子テーブルに実データがある状態での DROP は履歴書データを失う。バックアップの上で実行すること。
--   ※ 追加列の DROP は「forward script が新規追加した列だけ」に限定する（_p9_resume_migration_meta の
--     preexisted=false のみ）。万一これらの列名が別経緯で既存だった場合、その列とデータは温存する。
-- ============================================================================

BEGIN;

DROP FUNCTION IF EXISTS public.create_applicant_with_resume(uuid, jsonb, jsonb, jsonb, jsonb);

-- 子3テーブルは本 script で新規作成したもの（CREATE TABLE IF NOT EXISTS）。CASCADE で index/policy/FK も除去。
DROP TABLE IF EXISTS public.applicant_licenses         CASCADE;
DROP TABLE IF EXISTS public.applicant_work_experiences CASCADE;
DROP TABLE IF EXISTS public.applicant_educations       CASCADE;

-- applicants への追加列は「forward が新規追加した列（preexisted=false）」のみ DROP。
--   meta table が無い場合は安全側に倒して列 DROP をスキップ（手作業での確認を促す）。
DO $$
DECLARE r record;
BEGIN
  IF to_regclass('public._p9_resume_migration_meta') IS NULL THEN
    RAISE NOTICE '_p9_resume_migration_meta が見つかりません。追加列の DROP をスキップします（適用前状態が不明なため）。'
                 ' 手動で確認のうえ必要な列のみ DROP してください。';
  ELSE
    FOR r IN
      SELECT object_name FROM public._p9_resume_migration_meta WHERE preexisted = false
    LOOP
      EXECUTE format('ALTER TABLE public.applicants DROP COLUMN IF EXISTS %I', r.object_name);
    END LOOP;
  END IF;
END $$;

DROP TABLE IF EXISTS public._p9_resume_migration_meta;

COMMIT;
