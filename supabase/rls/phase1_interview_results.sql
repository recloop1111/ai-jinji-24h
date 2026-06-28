-- ============================================================================
-- phase1_interview_results.sql  — RLSハードニング Phase 1（対象: interview_results のみ）
--
-- 【重要】
--   * これは MIGRATION ではない。supabase/migrations には置かない（本番自動適用しない）。
--   * 手動実行専用（運用者が Supabase SQL Editor / psql で意図的に流す）。本ファイルは未実行。
--   * 対象は interview_results のみ。applicants / interviews / companies / jobs /
--     common_questions / job_questions など他テーブルは一切触らない。
--   * service role は RLS を bypass するため、本変更は seed（demo_*.sql）および将来の
--     P-10 OpenAI writer（service-role 経由で interview_results に書き込む想定）に影響しない。
--
-- 目的:
--   - anon（未ログイン）の interview_results 読み取りを遮断（公開面接フローは interview_results に触れない）。
--   - authenticated の qual=true（全件）系 SELECT/INSERT/UPDATE を撤去（app側 writer はゼロ）。
--   - client 企業の自社閲覧用 company_select_interview_results は残す（DROPしない）。
--   - admin 応募者詳細（browser 直読み）のため admin/super_admin 用 SELECT policy を追加。
--
-- 適用後の到達権限:
--   anon = 不可 / client(authenticated) = 自社のみ(company_select) /
--   admin(authenticated, role admin/super_admin) = 全社(admin_select) /
--   INSERT・UPDATE = service-role のみ。
-- ============================================================================


-- ── 実行前確認SELECT（適用前に現行ポリシーを目視）─────────────────────────────
-- SELECT policyname, roles, cmd, qual, with_check
--   FROM pg_policies
--  WHERE schemaname = 'public' AND tablename = 'interview_results'
--  ORDER BY cmd, policyname;
-- 期待（適用前）: anon_select / anon_insert / authenticated_select / authenticated_insert /
--                 authenticated_update / company_select の6ポリシー。


BEGIN;

-- (1) anon は interview_results に触れない（公開面接フローは interview_results を読み書きしない）
DROP POLICY IF EXISTS anon_select_interview_results ON interview_results;
DROP POLICY IF EXISTS anon_insert_interview_results ON interview_results;

-- (2) authenticated の qual=true（全件）系を撤去（app側 writer はゼロ・読みは下記2ポリシーに集約）
DROP POLICY IF EXISTS authenticated_select_interview_results ON interview_results;
DROP POLICY IF EXISTS authenticated_update_interview_results ON interview_results;
DROP POLICY IF EXISTS authenticated_insert_interview_results ON interview_results;

-- (3) company_select_interview_results（client企業が自社応募者の評価を閲覧）は残す＝DROPしない。
--     参考（既存定義 / 変更しない）:
--       USING (applicant_id IN (
--         SELECT applicants.id FROM applicants
--          WHERE applicants.company_id IN (
--            SELECT profiles.company_id FROM profiles WHERE profiles.id = auth.uid()
--          )
--       ))

-- (4) admin / super_admin は全社の評価を閲覧（admin 応募者詳細の browser 直読み用）。
--     company_select と同じ auth.uid()→profiles 参照パターン。
CREATE POLICY admin_select_interview_results ON interview_results
  FOR SELECT TO authenticated
  USING (
    auth.uid() IN (
      SELECT profiles.id FROM profiles
       WHERE profiles.id = auth.uid()
         AND profiles.role IN ('admin', 'super_admin')
    )
  );

COMMIT;


-- ── 実行後確認SELECT（適用後に検証）──────────────────────────────────────────
-- (a) ポリシー一覧: anon_* と authenticated_(select|insert|update) が消え、
--     company_select_interview_results と admin_select_interview_results が残ること。
-- SELECT policyname, roles, cmd FROM pg_policies
--  WHERE schemaname = 'public' AND tablename = 'interview_results'
--  ORDER BY cmd, policyname;
--
-- (b) anon 実読み確認（REST/curl を anon key で実行）:
--     GET /rest/v1/interview_results?select=id  → 0件 / 403相当（適用前は 7件）。
--     service-role では従来どおり 7件読めること（RLS bypass）。


-- ── rollback SQL（元の6ポリシー構成へ戻す・必要時のみ手動実行）─────────────────
-- BEGIN;
-- DROP POLICY IF EXISTS admin_select_interview_results ON interview_results;
-- CREATE POLICY anon_select_interview_results          ON interview_results FOR SELECT TO anon          USING (true);
-- CREATE POLICY anon_insert_interview_results          ON interview_results FOR INSERT TO anon          WITH CHECK (true);
-- CREATE POLICY authenticated_select_interview_results ON interview_results FOR SELECT TO authenticated USING (true);
-- CREATE POLICY authenticated_update_interview_results ON interview_results FOR UPDATE TO authenticated USING (true);
-- CREATE POLICY authenticated_insert_interview_results ON interview_results FOR INSERT TO authenticated WITH CHECK (true);
-- COMMIT;
