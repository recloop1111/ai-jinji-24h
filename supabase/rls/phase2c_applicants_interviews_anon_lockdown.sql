-- ============================================================================
-- phase2c_applicants_interviews_anon_lockdown.sql
--   RLSハードニング Phase 2-c（対象: applicants / interviews の anon アクセス遮断）
--
-- 【重要】
--   * これは MIGRATION ではない。supabase/migrations には置かない（本番自動適用しない）。
--   * 手動実行専用（運用者が Supabase SQL Editor / psql で意図的に流す）。本ファイルは未実行。
--   * 対象は applicants / interviews のみ。
--     companies / jobs / job_questions / common_questions / interview_results は触らない
--     （companies/jobs/job_questions の公開SELECTは Phase 2-d で別途。interview_results は Phase 1 済）。
--   * service role は RLS を bypass するため、公開フローの service-role API
--     （applicant / start / end / satisfaction / snapshot）には影響しない。
--
-- 前提（Phase 2-a 完了済み）:
--   - applicants / interviews への「公開フロー browser 直書き」は全廃
--     （作成・開始・終了・満足度・スナップショットは token 付き service-role API 経由）。
--   - applicants / interviews の「公開フロー browser 直読み」も無し（残るは companies/jobs/job_questions のみ）。
--   よって anon の applicants / interviews アクセスは不要。
--
-- 適用後の到達権限:
--   anon = applicants/interviews に一切アクセス不可
--   client(authenticated) = 自社のみ（company_select_* / company_update_applicants）
--   admin(authenticated, role admin/super_admin) = 全社 SELECT（admin_select_*）
--   書き込み（公開フロー）= service-role API のみ
-- ============================================================================


-- ── 実行前確認SELECT（適用前に現行ポリシーを目視。Phase 2-pre 実行有無で authenticated_* の有無は変わる）──
-- SELECT tablename, policyname, roles, cmd, qual, with_check
--   FROM pg_policies
--  WHERE schemaname = 'public' AND tablename IN ('applicants','interviews')
--  ORDER BY tablename, cmd, policyname;
-- 期待（適用前・anon系が存在すること）:
--   applicants: anon_insert_applicants(anon,INSERT) / anon_select_own_applicant(anon,SELECT) /
--               company_select_applicants(auth,SELECT) / company_update_applicants(auth,UPDATE)
--               〔Phase 2-pre 未実行なら authenticated_insert_applicants も〕
--   interviews: anon_insert_interviews(anon,INSERT) / anon_select_interviews(anon,SELECT) /
--               anon_update_interviews(anon,UPDATE) / company_select_interviews(auth,SELECT)
--               〔Phase 2-pre 未実行なら authenticated_insert_interviews / authenticated_update_interviews も〕


BEGIN;

-- ── applicants ─────────────────────────────────────────────────────────────
-- anon の作成・参照を遮断（作成は service-role API、参照は client=company / admin=admin policy）
DROP POLICY IF EXISTS anon_insert_applicants     ON applicants;
DROP POLICY IF EXISTS anon_select_own_applicant  ON applicants;
-- 残す: company_select_applicants（client 自社参照）／ company_update_applicants（client 自社更新）

-- admin / super_admin は全社の応募者を参照（admin 応募者一覧/詳細の browser 直読み用）
CREATE POLICY admin_select_applicants ON applicants
  FOR SELECT TO authenticated
  USING (
    auth.uid() IN (
      SELECT profiles.id FROM profiles
       WHERE profiles.id = auth.uid()
         AND profiles.role IN ('admin', 'super_admin')
    )
  );

-- ── interviews ─────────────────────────────────────────────────────────────
-- anon の作成・参照・更新を遮断（作成/更新は service-role API、参照は client=company / admin=admin policy）
DROP POLICY IF EXISTS anon_insert_interviews ON interviews;
DROP POLICY IF EXISTS anon_select_interviews ON interviews;
DROP POLICY IF EXISTS anon_update_interviews ON interviews;
-- 残す: company_select_interviews（client 自社参照）

-- admin / super_admin は全社の面接を参照
CREATE POLICY admin_select_interviews ON interviews
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
-- (a) ポリシー一覧: anon_* が消え、company_* と admin_select_* が残ること。
-- SELECT tablename, policyname, roles, cmd FROM pg_policies
--  WHERE schemaname = 'public' AND tablename IN ('applicants','interviews')
--  ORDER BY tablename, cmd, policyname;
--   applicants 期待: company_select_applicants / company_update_applicants / admin_select_applicants
--   interviews 期待: company_select_interviews / admin_select_interviews
--
-- (b) anon 実アクセス確認（anon key で REST）:
--   GET /rest/v1/applicants?select=id  → 0件 / 403相当（適用前は読めていた）
--   GET /rest/v1/interviews?select=id  → 0件 / 403相当
--   service-role では従来どおり読める（RLS bypass）。
--
-- 機能確認（壊れないこと）:
--   - 公開面接フロー: フォーム送信→面接開始→終了→満足度→スナップショット が service-role API 経由で動作。
--   - client企業ログイン: 応募者一覧/詳細・「面接中/途中離脱/完了」導出表示・選考ステータス更新が動作。
--   - admin: 応募者一覧（/api/admin/* service-role）＋ 応募者詳細（browser直読み）が admin_select で表示。


-- ── rollback SQL（元の anon 構成へ戻す・必要時のみ手動実行）─────────────────
-- BEGIN;
-- DROP POLICY IF EXISTS admin_select_applicants ON applicants;
-- DROP POLICY IF EXISTS admin_select_interviews ON interviews;
-- CREATE POLICY anon_insert_applicants    ON applicants FOR INSERT TO anon WITH CHECK (true);
-- CREATE POLICY anon_select_own_applicant ON applicants FOR SELECT TO anon USING (true);
-- CREATE POLICY anon_insert_interviews    ON interviews FOR INSERT TO anon WITH CHECK (true);
-- CREATE POLICY anon_select_interviews    ON interviews FOR SELECT TO anon USING (true);
-- CREATE POLICY anon_update_interviews    ON interviews FOR UPDATE TO anon USING (true);
-- COMMIT;
