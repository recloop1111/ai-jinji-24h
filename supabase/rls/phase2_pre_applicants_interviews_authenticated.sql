-- ============================================================================
-- phase2_pre_applicants_interviews_authenticated.sql
--   RLSハードニング Phase 2-pre（対象: applicants / interviews の authenticated true系のみ）
--
-- 【重要】
--   * これは MIGRATION ではない。supabase/migrations には置かない（本番自動適用しない）。
--   * 手動実行専用（運用者が Supabase SQL Editor / psql で意図的に流す）。本ファイルは未実行。
--   * 対象は applicants / interviews のみ。他テーブルは触らない。
--   * anon policy（anon_insert / anon_select / anon_update）は **絶対に触らない**
--     （応募者公開フォーム・面接セッションが依存。閉じるのは Phase 2-a のAPI化後）。
--   * service role は RLS を bypass するため、本変更は seed / 将来の writer に影響しない。
--
-- 目的:
--   公開フロー非依存・利用経路ゼロの authenticated INSERT/UPDATE（qual/with_check=true）を削除し、
--   攻撃面を先に縮小する。漏えい本体（anon SELECT）は Phase 2-a 完了後に別途閉じる。
--
-- 削除対象（いずれも認証済み browser からの利用経路がコード上ゼロ。作成/更新は anon公開フロー or service-role）:
--   - applicants.authenticated_insert_applicants  (INSERT, with_check=true)
--   - interviews.authenticated_insert_interviews  (INSERT, with_check=true)
--   - interviews.authenticated_update_interviews  (UPDATE, qual=true)  ← 最も危険
--
-- 温存（DROPしない）:
--   - applicants.company_select_applicants / company_update_applicants（client 自社の閲覧・選考更新）
--   - interviews.company_select_interviews（client 自社の閲覧）
--   - applicants/interviews の anon_* 一式（公開フロー用・今回対象外）
-- ============================================================================


-- ── 実行前確認SELECT（適用前に現行ポリシーを目視）─────────────────────────────
-- SELECT tablename, policyname, roles, cmd, qual, with_check
--   FROM pg_policies
--  WHERE schemaname = 'public' AND tablename IN ('applicants','interviews')
--  ORDER BY tablename, cmd, policyname;
-- 期待（適用前 / applicants 5本）:
--   anon_insert_applicants(anon,INSERT) / anon_select_own_applicant(anon,SELECT,true) /
--   authenticated_insert_applicants(auth,INSERT) / company_select_applicants(auth,SELECT) /
--   company_update_applicants(auth,UPDATE)
-- 期待（適用前 / interviews 6本）:
--   anon_insert_interviews(anon,INSERT) / anon_select_interviews(anon,SELECT,true) /
--   anon_update_interviews(anon,UPDATE,true) / authenticated_insert_interviews(auth,INSERT) /
--   authenticated_update_interviews(auth,UPDATE,true) / company_select_interviews(auth,SELECT)


BEGIN;

-- applicants: 認証済みの不要 INSERT（作成は anon 公開フォームのみ）
DROP POLICY IF EXISTS authenticated_insert_applicants ON applicants;

-- interviews: 認証済みの不要 INSERT / UPDATE（開始・更新は anon 公開フロー or service-role のみ）
DROP POLICY IF EXISTS authenticated_insert_interviews ON interviews;
DROP POLICY IF EXISTS authenticated_update_interviews ON interviews;

-- ※ anon_* / company_* は DROP しない（温存）。

COMMIT;


-- ── 実行後確認SELECT（適用後に検証）──────────────────────────────────────────
-- SELECT tablename, policyname, roles, cmd FROM pg_policies
--  WHERE schemaname = 'public' AND tablename IN ('applicants','interviews')
--  ORDER BY tablename, cmd, policyname;
-- 期待（適用後）:
--   applicants 4本: anon_insert_applicants / anon_select_own_applicant /
--                   company_select_applicants / company_update_applicants
--   interviews 4本: anon_insert_interviews / anon_select_interviews /
--                   anon_update_interviews / company_select_interviews
--   → authenticated_insert_applicants / authenticated_insert_interviews /
--     authenticated_update_interviews が消えていること。
--
-- 機能確認（壊れないこと）:
--   - client企業ログイン: 応募者一覧/詳細が表示される（company_select_applicants / company_select_interviews）。
--   - client選考ステータス更新: company_update_applicants で動く。
--   - 公開面接フロー（未ログイン=anon）: anon_* を温存しているので INSERT/SELECT/UPDATE が従来どおり動く。
--   - service-role: RLS bypass で seed / 将来 writer に影響なし。


-- ── rollback SQL（元に戻す・必要時のみ手動実行）──────────────────────────────
-- BEGIN;
-- CREATE POLICY authenticated_insert_applicants ON applicants  FOR INSERT TO authenticated WITH CHECK (true);
-- CREATE POLICY authenticated_insert_interviews ON interviews  FOR INSERT TO authenticated WITH CHECK (true);
-- CREATE POLICY authenticated_update_interviews ON interviews  FOR UPDATE TO authenticated USING (true);
-- COMMIT;
