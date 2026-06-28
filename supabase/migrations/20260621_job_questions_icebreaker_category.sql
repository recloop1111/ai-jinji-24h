-- ============================================================================
-- 20260621_job_questions_icebreaker_category.sql
--   アイスブレイク質問を「求人 × pattern_key」単位へ分離するための本番適用マイグレーション。
--
-- 方針:
--   - job_questions に category 列を追加（'evaluation' = 既存の評価質問 / 'icebreaker' = 求人×pattern別アイスブレイク）。
--   - クロージングは common_questions（企業共通・category='closing'）のまま維持（本migrationでは触らない）。
--   - 既存 common_questions.category='icebreakers'（企業共通）は **削除せず**、各企業の既存 (job_id, pattern_key) へコピー。
--
-- 実DB調査（§1 適用前確認）結果に基づく前提:
--   - 既存 unique 制約 / unique index は **無い**（DROP は不要・行わない）。
--   - 既存 PK = job_questions_pkey / FK = job_questions_job_id_fkey（jobs(id) ON DELETE CASCADE） / 通常index = idx_job_questions_job_pattern。
--   - これら既存 constraint / index は **一切 DROP / 変更しない**（維持）。
--
-- 【重要・手動適用】
--   * 本ファイルは自動適用しない。Supabase SQL Editor で内容を確認のうえ手動実行する。
--   * 適用前に supabase/cleanup/icebreaker_migration_verify.sql の §1 確認・§2 予行(ROLLBACK) を実行して検証すること。
--   * 全体を 1 トランザクション（BEGIN..COMMIT）で実行し、失敗時は全体ロールバックされる。
--   * 冪等性: 列追加/制約/index は IF NOT EXISTS（CHECK は DROP IF EXISTS→ADD）、コピーは NOT EXISTS で重複挿入しない（再実行安全）。
--   * 既存 FK（job_id → jobs ON DELETE CASCADE）・PK・idx_job_questions_job_pattern・RLS は変更しない（新category行にも同一テーブルのRLSが適用される）。
--
-- 影響（要対応・別途）:
--   * supabase/cleanup/cleanup_test_applicants.sql の job_questions=107 アサーション(4-c/6-c)と post-check は、
--     本migration適用後はテスト会社で 120 件（107 + コピー13）になる。完了済みSQLは独断変更しないため、
--     次回 cleanup 実行時に 107→120 へ更新が必要（本migrationでは変更しない）。
-- ============================================================================

BEGIN;

-- 1) category 列を追加（既存107件はすべて default 'evaluation' になる）
ALTER TABLE public.job_questions
  ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'evaluation';

-- 2) 許可値を限定する CHECK 制約（再実行のため一旦 DROP→ADD）
ALTER TABLE public.job_questions DROP CONSTRAINT IF EXISTS job_questions_category_check;
ALTER TABLE public.job_questions
  ADD CONSTRAINT job_questions_category_check CHECK (category IN ('evaluation', 'icebreaker'));

-- 3) category を含む unique index（(job_id, pattern_key, category, sort_order)・冪等）
--    icebreaker と evaluation が同一 (job_id, pattern_key, sort_order) で衝突しないことを保証する。
--    この unique index は (job_id, pattern_key, category) の検索にも左前方一致で使えるため、
--    追加の通常 index は作らない（冗長排除）。既存 idx_job_questions_job_pattern / PK / FK は維持。
CREATE UNIQUE INDEX IF NOT EXISTS job_questions_job_pattern_category_sort_uidx
  ON public.job_questions (job_id, pattern_key, category, sort_order);

-- 4) 既存 common_questions.icebreakers を各企業の既存 (job_id, pattern_key) へコピー（冪等・元は削除しない）。
--    対象の (job_id, pattern_key) は「実データに存在する評価質問の組み合わせ」のみ（存在しない pattern は作らない）。
--    質問文・並び順(sort_order)を保持。
--    冪等条件は新 unique キー (job_id, pattern_key, category, sort_order) と完全一致させる
--    （question_text は含めない）。これにより再実行時に「同 sort_order・別質問文」で unique 違反になるのを防ぐ。
--    既にコピー済みの (job,pattern,'icebreaker',sort_order) があれば挿入しない（既存行は上書きしない）。
INSERT INTO public.job_questions (job_id, pattern_key, category, question_text, sort_order)
SELECT combos.job_id, combos.pattern_key, 'icebreaker', cq.question_text, cq.sort_order
FROM (
  SELECT DISTINCT jq.job_id, jq.pattern_key, j.company_id
    FROM public.job_questions jq
    JOIN public.jobs j ON j.id = jq.job_id
   WHERE jq.category = 'evaluation'
) AS combos
JOIN public.common_questions cq
  ON cq.company_id = combos.company_id
 AND cq.category = 'icebreakers'
WHERE NOT EXISTS (
  SELECT 1 FROM public.job_questions x
   WHERE x.job_id = combos.job_id
     AND x.pattern_key = combos.pattern_key
     AND x.category = 'icebreaker'
     AND x.sort_order = cq.sort_order
);

COMMIT;
