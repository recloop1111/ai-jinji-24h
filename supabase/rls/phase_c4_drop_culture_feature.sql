-- ============================================================================
-- phase_c4_drop_culture_feature.sql
--   Phase C-4: 社風分析 / survey / culture fit の DB 撤去（テーブル/列 DROP）
--
-- 【重要】
--   * これは MIGRATION ではない。supabase/migrations には置かない（本番自動適用しない）。
--   * 手動実行専用（運用者が Supabase SQL Editor / psql で意図的に流す）。本ファイルは未実行。
--   * **破壊的・不可逆**。実行前に必ずバックアップを取得すること（§2）。
--   * 前提: 社風機能はコード撤去済み（Phase C-1〜C-3）。実コード（app/components/lib）・supabase/
--     からの culture_* 参照はゼロ（確認済み）。よってこれらは死蔵。
--
-- 撤去対象:
--   テーブル: culture_survey_responses / culture_surveys / culture_profiles
--   列:       companies.culture_analysis_enabled
--             interview_results.culture_fit_score / culture_fit_detail / big_five_scores
--
-- FK 関係（DROP 順序の根拠）:
--   culture_survey_responses.survey_id → culture_surveys(id) ON DELETE CASCADE
--   → 子（responses）を先に、親（surveys）を後に DROP。culture_profiles は独立（companies 参照のみ）。
-- ============================================================================


-- ── §1. 実行前確認（DROP 前に必ず目視）────────────────────────────────────────
-- (1-a) 対象テーブルの存在確認
-- SELECT table_name FROM information_schema.tables
--  WHERE table_schema='public'
--    AND table_name IN ('culture_surveys','culture_survey_responses','culture_profiles')
--  ORDER BY table_name;
--
-- (1-b) 対象列の存在確認
-- SELECT table_name, column_name FROM information_schema.columns
--  WHERE table_schema='public'
--    AND (
--      (table_name='companies'         AND column_name='culture_analysis_enabled') OR
--      (table_name='interview_results' AND column_name IN ('culture_fit_score','culture_fit_detail','big_five_scores'))
--    )
--  ORDER BY table_name, column_name;
--
-- (1-c) 各テーブルの行数（バックアップ要否の判断材料）
-- SELECT 'culture_surveys' AS t, COUNT(*) FROM public.culture_surveys
-- UNION ALL SELECT 'culture_survey_responses', COUNT(*) FROM public.culture_survey_responses
-- UNION ALL SELECT 'culture_profiles', COUNT(*) FROM public.culture_profiles;
--
-- (1-d) コード参照ゼロの最終確認（リポジトリ側・別途）:
--   grep -rnE "culture_surveys|culture_survey_responses|culture_profiles|culture_analysis_enabled|culture_fit_score|culture_fit_detail|big_five_scores" app/ components/ lib/ supabase/
--   → ヒット 0 を確認してから実行する。
--
-- 【中止条件】上記でテーブル/列が想定と違う、行数が想定外に多い（実データの可能性）、
--   またはコード参照が残っている場合は実行を中止し再確認する。


-- ── §2. 実行前バックアップ（必須・DROP は不可逆）──────────────────────────────
-- (2-a) テーブル単位の論理バックアップ（psql / pg_dump。接続情報は環境のものを使用）:
--   pg_dump "$DATABASE_URL" \
--     --table=public.culture_surveys \
--     --table=public.culture_survey_responses \
--     --table=public.culture_profiles \
--     --data-only --column-inserts \
--     > backup_culture_tables_$(date +%Y%m%d).sql
--   （スキーマも残すなら --data-only を外す。構造は本ファイル §5 の rollback DDL でも復元可）
--
-- (2-b) DROP する列のデータ退避（CSV）:
--   \copy (SELECT id, culture_analysis_enabled FROM public.companies) TO 'backup_companies_culture_flag.csv' CSV HEADER
--   \copy (SELECT id, applicant_id, culture_fit_score, culture_fit_detail, big_five_scores FROM public.interview_results) TO 'backup_interview_results_culture_cols.csv' CSV HEADER
--
-- (2-c) Supabase の自動バックアップ/PITR があれば、その復元ポイントの存在も確認しておく。


-- ── §3. DROP 実行（バックアップ取得後・トランザクション）───────────────────────
BEGIN;

-- (3-1) テーブル: 子 → 親 → 独立 の順。RLS ポリシーはテーブル DROP で一緒に消える。
DROP TABLE IF EXISTS public.culture_survey_responses;
DROP TABLE IF EXISTS public.culture_surveys;
DROP TABLE IF EXISTS public.culture_profiles;

-- (3-2) 列: companies / interview_results の culture 関連列。
ALTER TABLE public.companies        DROP COLUMN IF EXISTS culture_analysis_enabled;
ALTER TABLE public.interview_results DROP COLUMN IF EXISTS culture_fit_score;
ALTER TABLE public.interview_results DROP COLUMN IF EXISTS culture_fit_detail;
ALTER TABLE public.interview_results DROP COLUMN IF EXISTS big_five_scores;

COMMIT;


-- ── §4. 実行後確認 ───────────────────────────────────────────────────────────
-- (4-a) テーブルが消えたこと（0行が返る）:
-- SELECT table_name FROM information_schema.tables
--  WHERE table_schema='public'
--    AND table_name IN ('culture_surveys','culture_survey_responses','culture_profiles');
--
-- (4-b) 列が消えたこと（0行が返る）:
-- SELECT table_name, column_name FROM information_schema.columns
--  WHERE table_schema='public'
--    AND ((table_name='companies' AND column_name='culture_analysis_enabled')
--      OR (table_name='interview_results' AND column_name IN ('culture_fit_score','culture_fit_detail','big_five_scores')));
--
-- (4-c) 残存ポリシー確認（culture_* のポリシーも消えていること）:
-- SELECT tablename, policyname FROM pg_policies
--  WHERE schemaname='public' AND tablename LIKE 'culture\_%';
--
-- 機能確認（壊れないこと）:
--   - 公開面接フロー（/interview/[slug]）・client/admin 応募者一覧/詳細・求人/質問編集が正常
--     （culture コードは撤去済みのため影響しない想定）。
--   - DROP 後、`supabase gen types` で types/database.ts を再生成しておく（生成型から culture_* を消す）。
--     ※ 現状 types/database.ts に culture_* 参照は無いため必須ではないが、整合のため推奨。


-- ── §5. rollback 方針（DROP は不可逆。元に戻す場合のみ）─────────────────────────
-- DROP は元に戻せないため、rollback = §2 バックアップからの復元。
-- (5-a) テーブル構造の復元 DDL（docs/MIGRATION_SQL.md §4 と同一。データは §2-a の dump を流す）:
--   -- companies へ列を戻す
--   ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS culture_analysis_enabled BOOLEAN DEFAULT false;
--   -- interview_results へ列を戻す（元の型に合わせること。例）
--   ALTER TABLE public.interview_results ADD COLUMN IF NOT EXISTS culture_fit_score   NUMERIC;
--   ALTER TABLE public.interview_results ADD COLUMN IF NOT EXISTS culture_fit_detail  JSONB;
--   ALTER TABLE public.interview_results ADD COLUMN IF NOT EXISTS big_five_scores     JSONB;
--   -- culture_* テーブルは docs/MIGRATION_SQL.md §4 の CREATE TABLE + インデックス + （必要なら）company スコープ RLS を再実行
--   -- その後 §2-a / §2-b のバックアップからデータを復元（pg_dump 出力 / CSV \copy）。
-- ※ interview_results の列の正確な型は実行前に information_schema.columns で控えておくこと（復元時に必要）。


-- ── §6. リスク整理 ───────────────────────────────────────────────────────────
-- * 破壊的・不可逆: テーブル/列ごと削除。誤実行に備え §2 バックアップ必須。
-- * 実データ混入リスク: culture_survey_responses 等にデモ以外の実回答が無いか §1-c の行数で確認。
-- * 依存: 実コード参照ゼロ・supabase/ 参照ゼロを確認済み（Phase C-1〜C-3）。FK は responses→surveys のみ
--   （DROP 順序で対応）。companies / interview_results 本体は列削除のみで他機能に影響しない想定。
-- * RLS: テーブル DROP でポリシーも消滅。companies / interview_results の既存ポリシーは列削除では不変。
-- * タイミング: 本番稼働中の DROP は短時間ロックを伴う。低負荷時に実行推奨。
