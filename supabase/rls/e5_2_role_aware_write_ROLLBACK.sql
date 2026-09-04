-- ============================================================================
-- e5_2_role_aware_write_ROLLBACK.sql — e5_2_role_aware_write.sql の逆操作（手動・Production 未適用）
--   本 script が追加した RESTRICTIVE write policy のみを DROP。
--   既存の permissive policy（tenant SELECT/write）・company_members・RLS 有効状態には触れない
--   （e5_2 は policy を DROP せず RESTRICTIVE を上乗せしただけのため、逆操作もその上乗せを外すだけ）。
--   ※ rollback 後は VIEWER/inactive の DB レベル write ガードが外れる（server route の 403 は残る）。
-- ============================================================================

BEGIN;

DROP POLICY IF EXISTS jobs_rbac_write_insert ON public.jobs;
DROP POLICY IF EXISTS jobs_rbac_write_update ON public.jobs;
DROP POLICY IF EXISTS jobs_rbac_write_delete ON public.jobs;

DROP POLICY IF EXISTS job_questions_rbac_write_insert ON public.job_questions;
DROP POLICY IF EXISTS job_questions_rbac_write_update ON public.job_questions;
DROP POLICY IF EXISTS job_questions_rbac_write_delete ON public.job_questions;

DROP POLICY IF EXISTS applicants_rbac_write_insert ON public.applicants;
DROP POLICY IF EXISTS applicants_rbac_write_update ON public.applicants;
DROP POLICY IF EXISTS applicants_rbac_write_delete ON public.applicants;

DROP POLICY IF EXISTS internal_memos_rbac_write_insert ON public.internal_memos;
DROP POLICY IF EXISTS internal_memos_rbac_write_update ON public.internal_memos;
DROP POLICY IF EXISTS internal_memos_rbac_write_delete ON public.internal_memos;

COMMIT;
