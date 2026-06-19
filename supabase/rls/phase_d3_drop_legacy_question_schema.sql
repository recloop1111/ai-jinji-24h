-- ============================================================================
-- phase_d3_drop_legacy_question_schema.sql
--   Phase D-3: 旧質問スキーマ（question_banks / questions）の DB 撤去（テーブル DROP）
--
-- 【重要】
--   * これは MIGRATION ではない。supabase/migrations には置かない（本番自動適用しない）。
--   * 手動実行専用（運用者が Supabase SQL Editor / psql で意図的に流す）。本ファイルは未実行。
--   * **破壊的・不可逆**。実行前に必ずバックアップを取得すること（§2）。
--   * 前提: 質問機能は新スキーマ（job_questions / common_questions）に統一済み。
--     旧 question_banks / questions のコード参照は Phase D-1/D-2 で全撤去（実コード `.from()` ゼロ確認済）。
--     types/database.ts にも旧スキーマ型なし。よってこれらは死蔵。
--
-- 撤去対象:
--   テーブル: questions / question_banks
--
-- FK 関係（DROP 順序の根拠・実行前に §1-d で必ず確認）:
--   旧コードの Supabase ネスト select（question_banks → questions ( id )）および
--   `questions.in('question_bank_id', …)` から、`questions.question_bank_id → question_banks(id)` の
--   親子関係が推定される。→ 子（questions）を先、親（question_banks）を後に DROP。
--   ※ questions / question_banks を参照する**他の依存テーブル（question_options 等）が存在し得る**ため、
--     §1-d の依存FK確認を必ず実施し、想定外の依存があれば中止して個別対応する。
-- ============================================================================


-- ── §1. 実行前確認（DROP 前に必ず目視）────────────────────────────────────────
-- (1-a) 対象テーブルの存在確認
-- SELECT table_name FROM information_schema.tables
--  WHERE table_schema='public' AND table_name IN ('question_banks','questions')
--  ORDER BY table_name;
--
-- (1-b) 各テーブルの行数（実データ混入の有無を判断）
-- SELECT 'question_banks' AS t, COUNT(*) FROM public.question_banks
-- UNION ALL SELECT 'questions', COUNT(*) FROM public.questions;
--
-- (1-c) コード参照ゼロの最終確認（リポジトリ側・別途）:
--   grep -rnE "question_banks|from\('questions'\)" app/ components/ lib/
--   → ヒット 0 を確認してから実行する（Phase D-1/D-2 で撤去済み）。
--
-- (1-d) 依存FK（questions / question_banks を参照する外部キー）の確認 ── 重要:
-- SELECT
--   tc.table_name      AS referencing_table,
--   kcu.column_name    AS referencing_column,
--   ccu.table_name     AS referenced_table
-- FROM information_schema.table_constraints tc
-- JOIN information_schema.key_column_usage kcu
--   ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
-- JOIN information_schema.constraint_column_usage ccu
--   ON tc.constraint_name = ccu.constraint_name AND tc.table_schema = ccu.table_schema
-- WHERE tc.constraint_type = 'FOREIGN KEY'
--   AND tc.table_schema = 'public'
--   AND ccu.table_name IN ('question_banks','questions')
-- ORDER BY referenced_table, referencing_table;
--   期待: questions → question_banks（子→親）のみ。
--   それ以外（例: question_options → questions 等）が出た場合は、
--   その依存テーブルの扱いを先に決めてから（DROP or 移行）本ファイルを流すこと。中止条件。
--
-- 【中止条件】テーブル/行数が想定外、行数が多く実データの可能性、コード参照が残っている、
--   または §1-d で想定外の依存FKがある場合は実行を中止し再確認する。


-- ── §2. 実行前バックアップ（必須・DROP は不可逆）──────────────────────────────
-- (2-a) テーブル単位の論理バックアップ（pg_dump。接続情報は環境のもの）:
--   pg_dump "$DATABASE_URL" \
--     --table=public.question_banks \
--     --table=public.questions \
--     > backup_legacy_questions_$(date +%Y%m%d).sql
--   （--data-only を付けず構造＋データを残す。後で完全復元できるようにする）
-- (2-b) Supabase の自動バックアップ/PITR があれば、復元ポイントの存在も確認しておく。


-- ── §3. DROP 実行（バックアップ取得後・トランザクション）───────────────────────
BEGIN;

-- 子（questions: question_bank_id → question_banks）を先に DROP。RLS ポリシーも一緒に消える。
DROP TABLE IF EXISTS public.questions;

-- 親（question_banks）を後に DROP。
DROP TABLE IF EXISTS public.question_banks;

-- ※ §1-d で questions/question_banks を参照する想定外の依存FKが見つかった場合は、
--   ここで CASCADE を安易に使わず、依存先の扱いを別途決めてから再実行すること。

COMMIT;


-- ── §4. 実行後確認 ───────────────────────────────────────────────────────────
-- (4-a) テーブルが消えたこと（0行が返る）:
-- SELECT table_name FROM information_schema.tables
--  WHERE table_schema='public' AND table_name IN ('question_banks','questions');
--
-- (4-b) 残存ポリシー確認（旧スキーマのポリシーも消えていること）:
-- SELECT tablename, policyname FROM pg_policies
--  WHERE schemaname='public' AND tablename IN ('question_banks','questions');
--
-- 機能確認（壊れないこと）:
--   - 質問編集（admin /admin/companies/[id]・client /client/questions の QuestionEditor）が
--     新スキーマ（common_questions / job_questions）で正常動作。
--   - 公開面接フロー: POST /api/interview/[slug]/questions（job_questions）が正常。
--   - admin 企業詳細 API（GET /api/admin/companies/[id]）が正常（question_banks 依存は D-2 で除去済み）。
--   ※ 旧スキーマはコード参照ゼロのため、DROP しても上記に影響しない想定。


-- ── §5. rollback 方針（DROP は不可逆。元に戻す場合のみ）─────────────────────────
-- DROP は元に戻せないため、rollback = §2 バックアップからの復元。
--   psql "$DATABASE_URL" < backup_legacy_questions_YYYYMMDD.sql
-- ※ 旧スキーマの CREATE TABLE DDL は docs/MIGRATION_SQL.md に記載が無い（初期スキーマ由来）。
--   そのため §2-a の pg_dump（構造＋データ）が唯一の確実な復元手段。実行前バックアップを必ず取得する。
-- ※ 復元時は FK 順（question_banks を先に作成 → questions を後に作成）に注意。


-- ── §6. リスク整理 ───────────────────────────────────────────────────────────
-- * 破壊的・不可逆: テーブルごと削除。誤実行に備え §2 バックアップ必須。
-- * 実データ混入リスク: §1-b の行数で確認（旧スキーマに実データが残っていないか）。
-- * 依存: 実コード参照ゼロ（Phase D-1/D-2 で撤去・確認済）。DB側の依存FKは §1-d で確認必須
--   （questions → question_banks 以外の依存が無いこと）。
-- * RLS: テーブル DROP でポリシーも消滅。他テーブルへの影響なし。
-- * タイミング: 本番稼働中の DROP は短時間ロックを伴う。低負荷時に実行推奨。
-- * 関連: culture_* の DROP は phase_c4_drop_culture_feature.sql（別ファイル・同様に未実行）。
