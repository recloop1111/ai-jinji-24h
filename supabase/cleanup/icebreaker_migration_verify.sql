-- ============================================================================
-- icebreaker_migration_verify.sql
--   20260621_job_questions_icebreaker_category.sql の 適用前確認 / 予行(ROLLBACK) / 適用後確認。
--   手動実行用。§1→§2 を実行して問題なければ本番 migration を適用し、§3 で検証する。
--   §2 予行は BEGIN..ROLLBACK で実DBに何も残さない（COMMIT を含めない）。
--   ※ §1 実DB調査で「既存 unique 制約/index は無い」ことを確認済みのため、動的 DROP 処理は行わない。
--      既存 PK(job_questions_pkey) / FK(job_questions_job_id_fkey, CASCADE) / idx_job_questions_job_pattern は維持する。
-- ============================================================================


-- ── §1. 適用前確認SQL（読み取り専用 / SELECT のみ）──────────────────────────────
-- (1-a) 列・型・NULL可否・default
SELECT column_name, data_type, is_nullable, column_default
  FROM information_schema.columns
 WHERE table_schema = 'public' AND table_name = 'job_questions'
 ORDER BY ordinal_position;

-- (1-b) 全 constraint（種別＋定義）
SELECT con.conname, con.contype, pg_get_constraintdef(con.oid) AS definition
  FROM pg_constraint con
  JOIN pg_class c ON c.oid = con.conrelid AND c.relname = 'job_questions' AND c.relnamespace = 'public'::regnamespace
 ORDER BY con.contype, con.conname;

-- (1-c) 全 index（pg_get_indexdef）
SELECT i.relname AS index_name, pg_get_indexdef(x.indexrelid) AS index_def, x.indisunique, x.indisprimary
  FROM pg_index x
  JOIN pg_class i ON i.oid = x.indexrelid
  JOIN pg_class t ON t.oid = x.indrelid AND t.relname = 'job_questions' AND t.relnamespace = 'public'::regnamespace
 ORDER BY i.relname;

-- (1-d) job_id FK の参照先と ON DELETE 動作
SELECT con.conname, tgt.relname AS referenced_table,
       CASE con.confdeltype WHEN 'a' THEN 'NO ACTION' WHEN 'r' THEN 'RESTRICT' WHEN 'c' THEN 'CASCADE'
                            WHEN 'n' THEN 'SET NULL' WHEN 'd' THEN 'SET DEFAULT' END AS on_delete
  FROM pg_constraint con
  JOIN pg_class src ON src.oid = con.conrelid AND src.relname = 'job_questions' AND src.relnamespace = 'public'::regnamespace
  JOIN pg_class tgt ON tgt.oid = con.confrelid
 WHERE con.contype = 'f';

-- (1-e) RLS 有効状態
SELECT c.relname, c.relrowsecurity AS rls_enabled, c.relforcerowsecurity AS rls_forced
  FROM pg_class c WHERE c.relname = 'job_questions' AND c.relnamespace = 'public'::regnamespace;

-- (1-f) RLS policy 一覧
SELECT policyname, roles, cmd FROM pg_policies
 WHERE schemaname = 'public' AND tablename = 'job_questions' ORDER BY policyname;

-- (1-g) 件数（pattern_key NULL=0 / (job,pattern,sort) 重複=0 / 総数=107 / 組数=13 / common categories / コピー予定=13）
SELECT
  (SELECT COUNT(*) FROM public.job_questions WHERE pattern_key IS NULL)                       AS pattern_key_null,           -- 期待: 0
  (SELECT COUNT(*) FROM (SELECT job_id,pattern_key,sort_order,COUNT(*) c FROM public.job_questions
                          GROUP BY 1,2,3 HAVING COUNT(*)>1) d)                                AS dup_job_pattern_sort,       -- 期待: 0
  (SELECT COUNT(*) FROM public.job_questions)                                                 AS job_questions_total,        -- 期待: 107
  (SELECT COUNT(*) FROM (SELECT DISTINCT job_id,pattern_key FROM public.job_questions) t)     AS distinct_job_pattern,       -- 期待: 13
  (SELECT COUNT(*) FROM public.common_questions WHERE category='icebreakers')                 AS common_icebreakers,         -- 期待: 1
  (SELECT COUNT(*) FROM public.common_questions WHERE category='closing')                     AS common_closing,             -- 期待: 1
  (SELECT COUNT(*) FROM (SELECT DISTINCT jq.job_id,jq.pattern_key,j.company_id
                           FROM public.job_questions jq JOIN public.jobs j ON j.id=jq.job_id) combos
     JOIN public.common_questions cq ON cq.company_id=combos.company_id AND cq.category='icebreakers') AS planned_copies;     -- 期待: 13


-- ── §2. 予行実行SQL（BEGIN..migration..assertion..ROLLBACK・実DBに残さない / COMMIT なし）──────
BEGIN;

-- migration 本体（本番ファイルと同一・動的DROPなし・既存制約/indexは維持）
ALTER TABLE public.job_questions ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'evaluation';
ALTER TABLE public.job_questions DROP CONSTRAINT IF EXISTS job_questions_category_check;
ALTER TABLE public.job_questions ADD CONSTRAINT job_questions_category_check CHECK (category IN ('evaluation','icebreaker'));
CREATE UNIQUE INDEX IF NOT EXISTS job_questions_job_pattern_category_sort_uidx
  ON public.job_questions (job_id, pattern_key, category, sort_order);

-- 冪等条件は新 unique キー (job_id, pattern_key, category, sort_order) と完全一致（question_text は含めない）。
INSERT INTO public.job_questions (job_id, pattern_key, category, question_text, sort_order)
SELECT combos.job_id, combos.pattern_key, 'icebreaker', cq.question_text, cq.sort_order
FROM (SELECT DISTINCT jq.job_id, jq.pattern_key, j.company_id
        FROM public.job_questions jq JOIN public.jobs j ON j.id=jq.job_id
       WHERE jq.category='evaluation') combos
JOIN public.common_questions cq ON cq.company_id=combos.company_id AND cq.category='icebreakers'
WHERE NOT EXISTS (
  SELECT 1 FROM public.job_questions x
   WHERE x.job_id=combos.job_id AND x.pattern_key=combos.pattern_key
     AND x.category='icebreaker' AND x.sort_order=cq.sort_order);

-- 参考表示（件数）
SELECT
  (SELECT COUNT(*) FROM public.job_questions WHERE category='evaluation')      AS evaluation_after,   -- 期待: 107
  (SELECT COUNT(*) FROM public.job_questions WHERE category='icebreaker')      AS icebreaker_after,   -- 期待: 13
  (SELECT COUNT(*) FROM public.job_questions)                                  AS total_after,        -- 期待: 120
  (SELECT COUNT(*) FROM public.common_questions WHERE category='icebreakers')  AS common_ice_after,   -- 期待: 1（元削除なし）
  (SELECT COUNT(*) FROM public.common_questions WHERE category='closing')      AS closing_after;      -- 期待: 1

-- assertion: 想定と一致しなければ RAISE EXCEPTION でトランザクション中断（→ ROLLBACK）。
-- 件数・重複・既存 FK/PK/idx/RLS・新 category 列/CHECK/unique index を検証。
DO $$
DECLARE
  v_eval int; v_ice int; v_total int; v_dup int; v_pknull int; v_common_ice int; v_closing int;
BEGIN
  SELECT COUNT(*) INTO v_eval        FROM public.job_questions WHERE category='evaluation';
  SELECT COUNT(*) INTO v_ice         FROM public.job_questions WHERE category='icebreaker';
  SELECT COUNT(*) INTO v_total       FROM public.job_questions;
  SELECT COUNT(*) INTO v_dup         FROM (SELECT job_id,pattern_key,category,sort_order,COUNT(*) c
                                             FROM public.job_questions GROUP BY 1,2,3,4 HAVING COUNT(*)>1) d;
  SELECT COUNT(*) INTO v_pknull      FROM public.job_questions WHERE pattern_key IS NULL;
  SELECT COUNT(*) INTO v_common_ice  FROM public.common_questions WHERE category='icebreakers';
  SELECT COUNT(*) INTO v_closing     FROM public.common_questions WHERE category='closing';

  IF v_eval       <> 107 THEN RAISE EXCEPTION 'ABORT: evaluation=% (expected 107)', v_eval; END IF;
  IF v_ice        <> 13  THEN RAISE EXCEPTION 'ABORT: icebreaker=% (expected 13)', v_ice; END IF;
  IF v_total      <> 120 THEN RAISE EXCEPTION 'ABORT: total=% (expected 120)', v_total; END IF;
  IF v_dup        <> 0   THEN RAISE EXCEPTION 'ABORT: dup (job,pattern,category,sort) groups=% (expected 0)', v_dup; END IF;
  IF v_pknull     <> 0   THEN RAISE EXCEPTION 'ABORT: pattern_key NULL=% (expected 0)', v_pknull; END IF;
  IF v_common_ice <> 1   THEN RAISE EXCEPTION 'ABORT: common icebreakers=% (expected 1, must NOT be deleted)', v_common_ice; END IF;
  IF v_closing    <> 1   THEN RAISE EXCEPTION 'ABORT: closing=% (expected 1)', v_closing; END IF;

  -- 新規追加物が存在すること（すべて public.job_questions に限定して誤検知を防ぐ）
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema='public' AND table_name='job_questions' AND column_name='category')
    THEN RAISE EXCEPTION 'ABORT: category column missing'; END IF;

  -- CHECK: public.job_questions 上に存在・check 種別・validated・許可値('evaluation','icebreaker')を含むこと
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname='job_questions_category_check'
       AND conrelid = 'public.job_questions'::regclass
       AND contype = 'c'
       AND convalidated = true
       AND pg_get_constraintdef(oid) ILIKE '%category%'
       AND pg_get_constraintdef(oid) ILIKE '%''evaluation''%'
       AND pg_get_constraintdef(oid) ILIKE '%''icebreaker''%'
  ) THEN RAISE EXCEPTION 'ABORT: job_questions_category_check missing / not-validated / wrong allowed values'; END IF;

  -- unique index: public.job_questions 上・UNIQUE・定義が (job_id, pattern_key, category, sort_order)
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
     WHERE schemaname='public' AND tablename='job_questions'
       AND indexname='job_questions_job_pattern_category_sort_uidx'
       AND indexdef ILIKE '%UNIQUE%'
       AND indexdef ILIKE '%(job_id, pattern_key, category, sort_order)%'
  ) THEN RAISE EXCEPTION 'ABORT: unique index missing or wrong definition (expected UNIQUE (job_id, pattern_key, category, sort_order))'; END IF;

  -- 既存 PK / FK(CASCADE) / idx / RLS が残ること（conrelid を public.job_questions に限定）
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname='job_questions_pkey' AND contype='p' AND conrelid='public.job_questions'::regclass)
    THEN RAISE EXCEPTION 'ABORT: PK job_questions_pkey missing'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname='job_questions_job_id_fkey' AND contype='f' AND confdeltype='c'
                    AND conrelid='public.job_questions'::regclass)
    THEN RAISE EXCEPTION 'ABORT: FK job_questions_job_id_fkey (ON DELETE CASCADE) missing/changed'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_indexes
                  WHERE schemaname='public' AND tablename='job_questions' AND indexname='idx_job_questions_job_pattern')
    THEN RAISE EXCEPTION 'ABORT: existing index idx_job_questions_job_pattern missing'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_class
                  WHERE relname='job_questions' AND relnamespace='public'::regnamespace AND relrowsecurity)
    THEN RAISE EXCEPTION 'ABORT: RLS disabled on job_questions'; END IF;

  RAISE NOTICE 'DRY-RUN OK: evaluation=%, icebreaker=%, total=%, dup=0, common_ice=%, closing=%', v_eval, v_ice, v_total, v_common_ice, v_closing;
END $$;

-- 必ず巻き戻す（実DBに何も残さない）
ROLLBACK;


-- ── §3. 本番適用後の確認SQL（migration を COMMIT した後に実行）──────────────────
-- (3-a) category 列・CHECK(public.job_questions・validated・許可値)・unique index(UNIQUE・正しい定義) が存在
SELECT
  EXISTS (SELECT 1 FROM information_schema.columns
           WHERE table_schema='public' AND table_name='job_questions' AND column_name='category') AS category_col,
  EXISTS (SELECT 1 FROM pg_constraint
           WHERE conname='job_questions_category_check' AND conrelid='public.job_questions'::regclass
             AND contype='c' AND convalidated=true
             AND pg_get_constraintdef(oid) ILIKE '%''evaluation''%'
             AND pg_get_constraintdef(oid) ILIKE '%''icebreaker''%') AS check_ok,
  EXISTS (SELECT 1 FROM pg_indexes
           WHERE schemaname='public' AND tablename='job_questions'
             AND indexname='job_questions_job_pattern_category_sort_uidx'
             AND indexdef ILIKE '%UNIQUE%'
             AND indexdef ILIKE '%(job_id, pattern_key, category, sort_order)%') AS uniq_idx_ok;

-- (3-b) 件数: evaluation 107 / icebreaker 13 / closing 1 / 重複 0
SELECT
  (SELECT COUNT(*) FROM public.job_questions WHERE category='evaluation')      AS evaluation_count,   -- 期待: 107
  (SELECT COUNT(*) FROM public.job_questions WHERE category='icebreaker')      AS icebreaker_count,   -- 期待: 13
  (SELECT COUNT(*) FROM public.common_questions WHERE category='closing')      AS closing_count,      -- 期待: 1
  (SELECT COUNT(*) FROM (SELECT job_id,pattern_key,category,sort_order,COUNT(*) c
                           FROM public.job_questions GROUP BY 1,2,3,4 HAVING COUNT(*)>1) d) AS dup_groups; -- 期待: 0

-- (3-c) 既存 FK/PK/idx/RLS が維持されていること（conrelid を public.job_questions に限定）
SELECT
  EXISTS (SELECT 1 FROM pg_constraint WHERE conname='job_questions_pkey' AND contype='p' AND conrelid='public.job_questions'::regclass) AS pk_ok,
  EXISTS (SELECT 1 FROM pg_constraint WHERE conname='job_questions_job_id_fkey' AND contype='f' AND confdeltype='c' AND conrelid='public.job_questions'::regclass) AS fk_cascade_ok,
  EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND tablename='job_questions' AND indexname='idx_job_questions_job_pattern') AS old_index_ok,
  EXISTS (SELECT 1 FROM pg_class WHERE relname='job_questions' AND relnamespace='public'::regnamespace AND relrowsecurity) AS rls_enabled;

-- (3-d) RLS policy が従来どおり
SELECT policyname, roles, cmd FROM pg_policies
 WHERE schemaname='public' AND tablename='job_questions' ORDER BY policyname;
