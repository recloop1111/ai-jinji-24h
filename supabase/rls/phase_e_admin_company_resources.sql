-- ============================================================================
-- phase_e_admin_company_resources.sql
--   Phase E: 運営（admin / super_admin）による企業リソースの代理管理 RLS
--   対象: public.jobs / public.job_questions / public.common_questions
--
-- 【重要】
--   * これは MIGRATION ではない。supabase/migrations には置かない（本番自動適用しない）。
--   * 手動実行専用（運用者が Supabase SQL Editor / psql で意図的に流す）。本ファイルは未実行。
--   * **追加のみ（additive）**。既存の company_* ポリシーは DROP も変更もしない。
--   * service_role / anon の扱いは変えない（service_role は RLS bypass・anon は対象外）。
--
-- 背景 / 目的:
--   - 認証済み client/admin UI は browser-direct + RLS を canonical とする方針。
--   - 運営管理画面（/admin/companies/[id]）の JobManager / QuestionEditor は browser-direct で
--     jobs / job_questions / common_questions を company_id で読み書きする（client と同一の shared component）。
--   - しかし admin/super_admin の profiles.company_id は null のため、既存の company スコープ RLS
--     （company_id IN (自分の profiles.company_id)）に弾かれ、他社リソースが 0 件になる。
--   - そこで admin/super_admin に jobs/job_questions/common_questions の代理 CRUD を許可する追加ポリシーを入れ、
--     shared component を無改修で運営側でも機能させる。
--
-- 判定述語（既存 phase2c/2d の admin_select_* と同一パターン・非再帰）:
--   auth.uid() IN ( SELECT profiles.id FROM profiles
--                    WHERE profiles.id = auth.uid() AND profiles.role IN ('admin','super_admin') )
--   ※ profiles の自分の行のみ参照（id = auth.uid()）。phase2c/2d で実行済みの形と同じで RLS 再帰は起きない。
--
-- 付与:
--   admin/super_admin に対し各テーブル FOR ALL（SELECT / INSERT / UPDATE / DELETE）を許可（USING ＋ WITH CHECK）。
--   company user の既存ポリシーは temporary に触れず併存（RLS は permissive＝OR 評価で自社アクセス維持）。
-- ============================================================================


-- ── §1. 実行前確認SQL（適用前に目視）──────────────────────────────────────────
-- (1-a) 対象テーブルの存在確認
-- SELECT table_name FROM information_schema.tables
--  WHERE table_schema='public' AND table_name IN ('jobs','job_questions','common_questions')
--  ORDER BY table_name;
--
-- (1-b) 既存ポリシー一覧（company_* が残ること・admin_all_* がまだ無いこと）
-- SELECT tablename, policyname, roles, cmd, qual, with_check
--   FROM pg_policies
--  WHERE schemaname='public' AND tablename IN ('jobs','job_questions','common_questions')
--  ORDER BY tablename, cmd, policyname;
--
-- (1-c) admin / super_admin ユーザーの role 確認
-- SELECT id, role, company_id FROM public.profiles
--  WHERE role IN ('admin','super_admin') ORDER BY role;
--
-- (1-d) admin の company_id が null であること（＝既存 company スコープに弾かれる根拠）
-- SELECT role, COUNT(*) AS n, COUNT(company_id) AS with_company_id
--   FROM public.profiles WHERE role IN ('admin','super_admin') GROUP BY role;
--   （with_company_id = 0 が想定）
--
-- (1-e) テスト会社（例）の jobs 件数（service_role/SQL Editor では RLS bypass で見える）
-- SELECT company_id, COUNT(*) FROM public.jobs
--  WHERE company_id='7a58cc1b-9f81-4da5-ae2c-fd3abea05c33' GROUP BY company_id;
--
-- 【中止条件】
--   * 既存 company_* ポリシーが想定と違う／admin_all_* が既に存在する場合は、重複作成を避け再確認する。
--   * profiles に role 列が無い等、判定述語が成立しない場合は実行しない。


-- ── §2. 追加ポリシー（admin/super_admin の代理 CRUD・additive）────────────────
BEGIN;

-- jobs: 運営は全企業の求人を SELECT/INSERT/UPDATE/DELETE 可
CREATE POLICY admin_all_jobs ON public.jobs
  FOR ALL TO authenticated
  USING (
    auth.uid() IN (
      SELECT profiles.id FROM public.profiles
       WHERE profiles.id = auth.uid()
         AND profiles.role IN ('admin', 'super_admin')
    )
  )
  WITH CHECK (
    auth.uid() IN (
      SELECT profiles.id FROM public.profiles
       WHERE profiles.id = auth.uid()
         AND profiles.role IN ('admin', 'super_admin')
    )
  );

-- job_questions: 運営は全企業の求人質問を SELECT/INSERT/UPDATE/DELETE 可
CREATE POLICY admin_all_job_questions ON public.job_questions
  FOR ALL TO authenticated
  USING (
    auth.uid() IN (
      SELECT profiles.id FROM public.profiles
       WHERE profiles.id = auth.uid()
         AND profiles.role IN ('admin', 'super_admin')
    )
  )
  WITH CHECK (
    auth.uid() IN (
      SELECT profiles.id FROM public.profiles
       WHERE profiles.id = auth.uid()
         AND profiles.role IN ('admin', 'super_admin')
    )
  );

-- common_questions: 運営は全企業の共通質問を SELECT/INSERT/UPDATE/DELETE 可
CREATE POLICY admin_all_common_questions ON public.common_questions
  FOR ALL TO authenticated
  USING (
    auth.uid() IN (
      SELECT profiles.id FROM public.profiles
       WHERE profiles.id = auth.uid()
         AND profiles.role IN ('admin', 'super_admin')
    )
  )
  WITH CHECK (
    auth.uid() IN (
      SELECT profiles.id FROM public.profiles
       WHERE profiles.id = auth.uid()
         AND profiles.role IN ('admin', 'super_admin')
    )
  );

COMMIT;


-- ── §3. rollback SQL（今回追加分だけ削除・既存 company_* には触れない）─────────
-- BEGIN;
-- DROP POLICY IF EXISTS admin_all_jobs            ON public.jobs;
-- DROP POLICY IF EXISTS admin_all_job_questions   ON public.job_questions;
-- DROP POLICY IF EXISTS admin_all_common_questions ON public.common_questions;
-- COMMIT;


-- ── §4. 実行後確認SQL（適用後に検証）──────────────────────────────────────────
-- (4-a) ポリシー一覧に今回の admin_all_* が追加され、既存 company_* が残ること
-- SELECT tablename, policyname, roles, cmd FROM pg_policies
--  WHERE schemaname='public' AND tablename IN ('jobs','job_questions','common_questions')
--  ORDER BY tablename, policyname;
--   期待: 各テーブルに company_*（既存）＋ admin_all_*（追加・cmd=ALL）が併存。
--
-- (4-b) 機能確認（ブラウザ）:
--   - 運営管理画面 /admin/companies/[テスト会社id] → 求人管理タブに 営業/Webエンジニア/カスタマーサポート/
--     ホールスタッフ/キッチンスタッフ が表示される（company 側と同じ）。
--   - 質問設定タブの求人プルダウンに同じ求人が出る。営業×正社員＝新卒/中途経験者/中途未経験者、
--     ホールスタッフ×パート＝経験者/未経験者 のタブで質問設定が見える・編集できる。
--   - 企業側（client）/client/jobs・/client/questions が従来どおり動作（company_* 維持で無影響）。
--   - 公開面接 /interview/test が従来どおり開ける（jobs/job_questions の取得は service-role API・無影響）。
--
-- (4-c) company user の既存アクセスが壊れていないこと:
--   - company ログインで自社 jobs/job_questions/common_questions の閲覧・編集が可能（company_* がそのまま）。


-- ── §5. 注意書き ────────────────────────────────────────────────────────────
-- * 本SQLは未実行。手動実行前に必ずレビューすること。
-- * 実行は Supabase SQL Editor（service_role 接続）で §2 の BEGIN..COMMIT を流す。
-- * 追加のみ（既存 company_* / anon 遮断 / service_role bypass は不変）。
-- * 実行後、運営管理画面で求人管理・質問設定が見える/編集できることを確認（§4-b）。
-- * 問題があれば §3 rollback を実行（追加 admin_all_* のみ DROP）。
-- * admin/super_admin は本ポリシーで全企業の jobs/job_questions/common_questions を代理 CRUD 可能になる
--   （運営の代理操作という要件どおり）。company user の越権は発生しない（company_* は自社限定のまま）。
