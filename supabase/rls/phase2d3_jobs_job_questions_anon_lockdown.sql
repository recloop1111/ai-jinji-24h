-- ============================================================================
-- phase2d3_jobs_job_questions_anon_lockdown.sql
--   RLSハードニング Phase 2-d-3（対象: jobs / job_questions の anon SELECT 遮断）
--
-- 【重要】
--   * これは MIGRATION ではない。supabase/migrations には置かない（本番自動適用しない）。
--   * 手動実行専用（運用者が Supabase SQL Editor / psql で意図的に流す）。本ファイルは未実行。
--   * 対象は jobs / job_questions のみ。
--     companies / common_questions（Phase 2-d で対応済）/ applicants / interviews / interview_results
--     （Phase 1 / 2-c 済）は触らない。
--   * service role は RLS を bypass するため、公開フローの service-role API には影響しない。
--
-- 背景 / 前提（公開フローの anon 直読みは解消済み）:
--   - jobs の公開フォーム取得（求人ドロップダウン）は public-config API（service-role）へ移行済み
--     （/interview/[slug] の page / verify / prepare / form は anon で jobs を読まない）。
--   - job_questions の面接質問取得は POST /api/interview/[slug]/questions（service-role + capability token）
--     へ移行済み（/interview/[slug]/session の browser 直SELECTは撤去済み）。
--   - 調査結果（コード全文検索）:
--       jobs を読むコード   = API 5本（admin/dashboard, interview applicant/public-config/questions/start: 全て service-role/server）
--                            ＋ JobManager / QuestionEditor（browser, authenticated: client自社 / admin companies[id]）
--       job_questions を読むコード = questions API（service-role）＋ QuestionEditor（browser, authenticated）
--     → 公開フロー（/interview・/survey）の anon 直読みは「両テーブルとも 0 件」。
--
-- 影響分析（DROP しても壊れない根拠）:
--   * anon_select_jobs / anon_select_job_questions はいずれも role = anon。
--     authenticated（ログイン済 client / admin）の SELECT には元々マッチしない。
--   * 公開フローは service-role API（RLS bypass）に統一済みのため anon SELECT は不要。
--   * client / admin の JobManager・QuestionEditor は authenticated で動作し、
--     既存の company系 / authenticated系 / FOR ALL ポリシーに依存（本DROPは TO anon のみ対象なので無影響）。
--
-- 適用後の到達権限:
--   anon            = jobs / job_questions に一切アクセス不可
--   client(auth)    = 既存 company系 / authenticated系 ポリシーで自社の CRUD（JobManager / QuestionEditor）
--   admin(auth)     = 既存 authenticated系 / FOR ALL ポリシーで companies[id] の CRUD（本ファイルでは追加しない／後述NOTE）
--   公開応募フロー  = public-config API（jobs）/ questions API（job_questions）= service-role で従来どおり動作
-- ============================================================================


-- ── 実行前確認SELECT（適用前に現行ポリシーを目視）──────────────────────────────
-- SELECT tablename, policyname, roles, cmd, qual, with_check
--   FROM pg_policies
--  WHERE schemaname = 'public' AND tablename IN ('jobs','job_questions')
--  ORDER BY tablename, cmd, policyname;
--
-- 期待（適用前・anon系が存在すること。company系/authenticated系の正確な policyname は環境で確認）:
--   jobs:
--     anon_select_jobs        (roles={anon},          cmd=SELECT, qual=true 相当)   ← DROP 対象
--     company_all_jobs 等     (roles={authenticated}, cmd=ALL or 各cmd)             ← 残す（client/admin CRUD を担う）
--   job_questions:
--     anon_select_job_questions (roles={anon},          cmd=SELECT)                 ← DROP 対象
--     company_all_job_questions 等 (roles={authenticated}, cmd=ALL or 各cmd)        ← 残す
--
-- 【中止条件 / 要再検討】
--   * anon_select_jobs / anon_select_job_questions の roles が {anon} ではなく
--     {public} 等で authenticated にも適用されている場合、client/admin の SELECT が
--     これに依存している可能性がある。その場合は本ファイルを流さず再設計すること。
--   * client（自社）/ admin（companies[id]・全社）の JobManager / QuestionEditor の
--     SELECT/INSERT/UPDATE/DELETE を実際に許可している authenticated ポリシーが
--     存在することを qual / cmd で確認すること（無ければ DROP 後に管理画面が壊れる）。


BEGIN;

-- ── jobs ─────────────────────────────────────────────────────────────────────
-- anon の SELECT を遮断（公開フォームの求人取得は public-config API＝service-role に移行済み）。
DROP POLICY IF EXISTS anon_select_jobs ON jobs;
-- 残す: client/admin の JobManager / QuestionEditor を支える既存 company系 / authenticated系 ポリシー。

-- ── job_questions ────────────────────────────────────────────────────────────
-- anon の SELECT を遮断（面接質問取得は questions API＝service-role + token に移行済み）。
DROP POLICY IF EXISTS anon_select_job_questions ON job_questions;
-- 残す: client/admin の QuestionEditor を支える既存 company系 / authenticated系 ポリシー。

-- NOTE: jobs / job_questions に admin_select_* ポリシーは追加しない。
--   理由 ① anon 読み手が存在せず、anon SELECT の DROP は authenticated に無影響。
--        ② admin は /admin/companies/[id] の JobManager / QuestionEditor で SELECT だけでなく
--           INSERT/UPDATE/DELETE（CRUD）を行うため、SELECT-only 追加では不十分。
--        ③ admin のクロス社アクセスは既存 authenticated系 / FOR ALL ポリシーに依存する想定。
--   admin の全社 CRUD ポリシーが必要であれば、本フェーズとは独立に別タスクで設計する
--   （common_questions と同じ判断）。

COMMIT;


-- ── 実行後確認SELECT（適用後に検証）──────────────────────────────────────────
-- (a) ポリシー一覧: anon_* が消え、company系/authenticated系が残ること。
-- SELECT tablename, policyname, roles, cmd FROM pg_policies
--  WHERE schemaname = 'public' AND tablename IN ('jobs','job_questions')
--  ORDER BY tablename, cmd, policyname;
--   jobs 期待:          company系/authenticated系のみ（anon_select_jobs は消える）
--   job_questions 期待: company系/authenticated系のみ（anon_select_job_questions は消える）
--
-- (b) anon 実アクセス確認（anon key で REST）:
--   GET /rest/v1/jobs?select=id           → 0件 / 403相当（適用前は読めていた）
--   GET /rest/v1/job_questions?select=id  → 0件 / 403相当
--   service-role では従来どおり読める（RLS bypass）。
--
-- 機能確認（壊れないこと）:
--   - 公開応募フロー: /interview/[slug] の form 求人ドロップダウン（public-config API）と
--     session の質問取得（questions API）が service-role 経由で動作（jobs/job_questions anon 遮断後も無影響）。
--   - client: /client/jobs の求人管理（JobManager）と /client/questions の質問編集（QuestionEditor）が
--     authenticated で自社 CRUD 動作。
--   - admin: /admin/companies/[id] の求人管理（JobManager）・質問編集（QuestionEditor）が
--     既存 authenticated系 / FOR ALL ポリシーで動作（他社 CRUD 可否を実機確認。本DROPとは独立だが併せて検証推奨）。


-- ── rollback SQL（元の anon 構成へ戻す・必要時のみ手動実行）─────────────────
-- BEGIN;
-- CREATE POLICY anon_select_jobs          ON jobs          FOR SELECT TO anon USING (true);
-- CREATE POLICY anon_select_job_questions ON job_questions FOR SELECT TO anon USING (true);
-- COMMIT;
