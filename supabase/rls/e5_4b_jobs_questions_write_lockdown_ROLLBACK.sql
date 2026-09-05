-- ============================================================================
-- e5_4b_jobs_questions_write_lockdown_ROLLBACK.sql
--   e5_4b_jobs_questions_write_lockdown.sql の取り消し（追加した RESTRICTIVE policy を削除）。
--   RLS 有効化・既存 permissive（tenant/admin_all_*）・e5_2 は触らない。
-- ============================================================================
BEGIN;

DROP POLICY IF EXISTS jobs_e54b_write_adminonly_insert ON public.jobs;
DROP POLICY IF EXISTS jobs_e54b_write_adminonly_update ON public.jobs;
DROP POLICY IF EXISTS jobs_e54b_write_adminonly_delete ON public.jobs;

DROP POLICY IF EXISTS job_questions_e54b_write_adminonly_insert ON public.job_questions;
DROP POLICY IF EXISTS job_questions_e54b_write_adminonly_update ON public.job_questions;
DROP POLICY IF EXISTS job_questions_e54b_write_adminonly_delete ON public.job_questions;

DROP POLICY IF EXISTS common_questions_e54b_write_adminonly_insert ON public.common_questions;
DROP POLICY IF EXISTS common_questions_e54b_write_adminonly_update ON public.common_questions;
DROP POLICY IF EXISTS common_questions_e54b_write_adminonly_delete ON public.common_questions;

COMMIT;
