-- ============================================================================
-- cleanup_test_applicants.sql
--   質問配線テストで量産された検証用応募者（SNAP / CQ / PK / テスト太郎）の削除草案
--   対象会社: テスト株式会社（interview_slug = 'test' / id = 7a58cc1b-9f81-4da5-ae2c-fd3abea05c33）
--
-- 【最重要・必読】
--   * 本ファイルは DELETE 未実行の「草案」。コミット時点で DB は一切変更していない。
--   * MIGRATION ではない。supabase/migrations には置かない（本番自動適用しない）。
--   * 手動実行専用（運用者が Supabase SQL Editor で意図的に流す）。
--   * 本番では使わない（開発環境のテストデータ整理用）。
--   * 実行前に必ず §2〜§4 の SELECT を流し、対象が想定（応募者24件 / interviews36件 /
--     interview_results1件 / interview_logs0件 / satisfaction_ratings0件 / is_billable=true 0件）
--     と一致することを目視確認する。
--   * §5 の DELETE は BEGIN ... （件数確認）... COMMIT/ROLLBACK で実行する。
--     ROLLBACK は同一トランザクション内でのみ有効（COMMIT 後は戻せない）。
--   * cascade を前提にしない。子→親の順に明示 DELETE する（§4 で FK の実態を確認）。
--
-- 判定基準（name ではなく email 基準。田中太郎(@example.com)とテスト太郎(@test.com)の誤爆防止）:
--   company_id = テスト会社 AND ( email = 'debug@test.com' OR email ILIKE '%@test.local' )
--
-- 残すデータ（削除しない）:
--   @example.com のデモ応募者（tanaka@example.com / 田中太郎 等のシード・デモ表示用）。
-- ============================================================================


-- ── §1. 対象会社の確認 ──────────────────────────────────────────────────────
-- 期待: 1行・name='テスト株式会社'・interview_slug='test'
SELECT id, name, interview_slug
  FROM public.companies
 WHERE interview_slug = 'test';


-- ── §2. 削除対象 applicant の確認 ───────────────────────────────────────────
-- (2-a) 削除対象の一覧（email 基準）
SELECT a.id, a.last_name, a.first_name, a.email, a.created_at
  FROM public.applicants a
  JOIN public.companies c ON c.id = a.company_id
 WHERE c.interview_slug = 'test'
   AND ( a.email = 'debug@test.com' OR a.email ILIKE '%@test.local' )
 ORDER BY a.created_at DESC;
-- 期待: 24件（snap@ / snap2@ / cq@ / pk@ / debug@test.com のみ）

-- (2-b) 削除対象件数（email 基準）— 24 を期待
SELECT COUNT(*) AS delete_target_count
  FROM public.applicants a
  JOIN public.companies c ON c.id = a.company_id
 WHERE c.interview_slug = 'test'
   AND ( a.email = 'debug@test.com' OR a.email ILIKE '%@test.local' );

-- (2-c) 残す @example.com デモ応募者の件数（消さないことの確認用）— 削除対象には含まれない
SELECT COUNT(*) AS keep_example_count
  FROM public.applicants a
  JOIN public.companies c ON c.id = a.company_id
 WHERE c.interview_slug = 'test'
   AND a.email ILIKE '%@example.com';
-- 期待: 10件（鈴木/渡辺/田中太郎/高橋/佐藤/伊藤/中村/山本/じじじじ×2）。これらは削除しない。

-- (2-d) 削除対象に @example.com が混ざっていないこと（0 を期待＝誤爆ガード）
SELECT COUNT(*) AS leaked_example_in_target
  FROM public.applicants a
  JOIN public.companies c ON c.id = a.company_id
 WHERE c.interview_slug = 'test'
   AND ( a.email = 'debug@test.com' OR a.email ILIKE '%@test.local' )
   AND a.email ILIKE '%@example.com';
-- 期待: 0


-- ── §3. 関連データの確認 ────────────────────────────────────────────────────
-- 対象 applicant に紐づく子データの件数を事前に把握する。
WITH targets AS (
  SELECT a.id
    FROM public.applicants a
    JOIN public.companies c ON c.id = a.company_id
   WHERE c.interview_slug = 'test'
     AND ( a.email = 'debug@test.com' OR a.email ILIKE '%@test.local' )
)
SELECT
  (SELECT COUNT(*) FROM public.interviews        WHERE applicant_id IN (SELECT id FROM targets)) AS interviews_count,         -- 期待: 36
  (SELECT COUNT(*) FROM public.interview_results WHERE applicant_id IN (SELECT id FROM targets)) AS interview_results_count,  -- 期待: 1
  (SELECT COUNT(*) FROM public.satisfaction_ratings) AS satisfaction_ratings_total;                                          -- 期待: 0（死蔵・全体0件）

-- interview_logs は interview 経由で紐づく（applicant_id 列が無い場合に備え interview_id で集計）
WITH targets AS (
  SELECT a.id
    FROM public.applicants a
    JOIN public.companies c ON c.id = a.company_id
   WHERE c.interview_slug = 'test'
     AND ( a.email = 'debug@test.com' OR a.email ILIKE '%@test.local' )
),
target_interviews AS (
  SELECT id FROM public.interviews WHERE applicant_id IN (SELECT id FROM targets)
)
SELECT COUNT(*) AS interview_logs_count
  FROM public.interview_logs
 WHERE interview_id IN (SELECT id FROM target_interviews);
-- 期待: 0（interview_logs は全体0件）

-- is_billable=true が 0 件であること（課金影響なしの確認）
WITH targets AS (
  SELECT a.id
    FROM public.applicants a
    JOIN public.companies c ON c.id = a.company_id
   WHERE c.interview_slug = 'test'
     AND ( a.email = 'debug@test.com' OR a.email ILIKE '%@test.local' )
)
SELECT COUNT(*) AS billable_interviews
  FROM public.interviews
 WHERE applicant_id IN (SELECT id FROM targets)
   AND is_billable = true;
-- 期待: 0（課金対象なし。billing 集計に影響しない）


-- ── §4. FK / ON DELETE の確認（cascade を前提にしないための実態把握）────────────
-- applicants / interviews / interview_results / interview_logs を参照する外部キーと
-- その削除規則（CASCADE / RESTRICT / NO ACTION / SET NULL）を一覧する。
--   confdeltype: a=NO ACTION, r=RESTRICT, c=CASCADE, n=SET NULL, d=SET DEFAULT
SELECT
  con.conname                         AS constraint_name,
  src.relname                         AS child_table,      -- FK を持つ（参照する）側
  tgt.relname                         AS parent_table,     -- 参照される側
  CASE con.confdeltype
    WHEN 'a' THEN 'NO ACTION'
    WHEN 'r' THEN 'RESTRICT'
    WHEN 'c' THEN 'CASCADE'
    WHEN 'n' THEN 'SET NULL'
    WHEN 'd' THEN 'SET DEFAULT'
  END                                 AS on_delete,
  pg_get_constraintdef(con.oid)       AS definition
FROM pg_constraint con
JOIN pg_class src ON src.oid = con.conrelid
JOIN pg_class tgt ON tgt.oid = con.confrelid
WHERE con.contype = 'f'
  AND (
        tgt.relname IN ('applicants', 'interviews', 'interview_results', 'interview_logs')
     OR src.relname IN ('applicants', 'interviews', 'interview_results', 'interview_logs')
      )
ORDER BY parent_table, child_table, constraint_name;
-- 【注意】上記の on_delete に CASCADE があっても、本草案は cascade に頼らず
--   §5 で子→親の順に明示 DELETE する。RESTRICT/NO ACTION の場合は子を先に消さないと
--   親（applicants/interviews）の DELETE が FK 違反で失敗するため、いずれにせよ子→親が安全。


-- ── §5. 削除（手動実行・トランザクション）──────────────────────────────────────
-- 実行手順:
--   1) 下記 BEGIN から「削除後 件数確認」までを実行する。
--   2) 件数確認で applicants=0 / interviews=0 / interview_results=0 になり、
--      @example.com の残数が想定どおりなら COMMIT を実行する。
--   3) 想定外（@example.com が減った等）なら ROLLBACK を実行する（同一トランザクション内でのみ有効）。
BEGIN;

-- 対象 applicant_id を固定（このトランザクション内で同じ条件を毎回評価。email 基準・テスト会社限定）
-- ※ CTE は文ごとに評価されるため、各 DELETE で同一の WHERE 条件を明示して厳密に絞る。

-- (5-1) interview_results（子）: applicant_id 経由で紐づく分を削除
DELETE FROM public.interview_results ir
 USING public.applicants a
 JOIN public.companies c ON c.id = a.company_id
 WHERE ir.applicant_id = a.id
   AND c.interview_slug = 'test'
   AND ( a.email = 'debug@test.com' OR a.email ILIKE '%@test.local' );

-- (5-2) interview_logs（子）: 対象 applicant の interviews に紐づく分を削除
DELETE FROM public.interview_logs il
 USING public.interviews iv
 JOIN public.applicants a ON a.id = iv.applicant_id
 JOIN public.companies c ON c.id = a.company_id
 WHERE il.interview_id = iv.id
   AND c.interview_slug = 'test'
   AND ( a.email = 'debug@test.com' OR a.email ILIKE '%@test.local' );

-- (5-3) interviews（子）: 対象 applicant に紐づく面接を削除
DELETE FROM public.interviews iv
 USING public.applicants a
 JOIN public.companies c ON c.id = a.company_id
 WHERE iv.applicant_id = a.id
   AND c.interview_slug = 'test'
   AND ( a.email = 'debug@test.com' OR a.email ILIKE '%@test.local' );

-- (5-4) applicants（親）: テスト応募者本体を削除
DELETE FROM public.applicants a
 USING public.companies c
 WHERE c.id = a.company_id
   AND c.interview_slug = 'test'
   AND ( a.email = 'debug@test.com' OR a.email ILIKE '%@test.local' );

-- ── 削除後 件数確認（COMMIT 判断用・このトランザクション内で実行）──────────────
-- 期待: 下記すべて 0
SELECT
  (SELECT COUNT(*) FROM public.applicants a
     JOIN public.companies c ON c.id = a.company_id
    WHERE c.interview_slug = 'test'
      AND ( a.email = 'debug@test.com' OR a.email ILIKE '%@test.local' )) AS remaining_target_applicants,
  (SELECT COUNT(*) FROM public.interviews iv
     JOIN public.applicants a ON a.id = iv.applicant_id
     JOIN public.companies c ON c.id = a.company_id
    WHERE c.interview_slug = 'test'
      AND ( a.email = 'debug@test.com' OR a.email ILIKE '%@test.local' )) AS remaining_target_interviews,
  (SELECT COUNT(*) FROM public.interview_results ir
     JOIN public.applicants a ON a.id = ir.applicant_id
     JOIN public.companies c ON c.id = a.company_id
    WHERE c.interview_slug = 'test'
      AND ( a.email = 'debug@test.com' OR a.email ILIKE '%@test.local' )) AS remaining_target_results;

-- 残す @example.com デモ応募者が無傷であること（期待: 10）
SELECT COUNT(*) AS remaining_example_applicants
  FROM public.applicants a
  JOIN public.companies c ON c.id = a.company_id
 WHERE c.interview_slug = 'test'
   AND a.email ILIKE '%@example.com';

-- 問題なければ:
--   COMMIT;
-- 想定外なら:
--   ROLLBACK;
-- ↑ どちらか一方を手動で実行してトランザクションを閉じること（開いたまま放置しない）。


-- ── §6. ROLLBACK についての注意 ────────────────────────────────────────────
-- * ROLLBACK は §5 の BEGIN で開始した同一トランザクション内でのみ有効。
-- * COMMIT 実行後は ROLLBACK では戻せない（復旧はバックアップからのリストアが必要）。
-- * したがって §5 は「BEGIN → DELETE×4 → 削除後件数確認」までを一気に実行し、
--   件数を目視で確認してから COMMIT か ROLLBACK を選ぶこと。


-- ── §7. 実行後（COMMIT 後）の最終確認 ───────────────────────────────────────
-- (7-a) 対象テスト応募者・面接・結果が 0 件（期待: すべて 0）
SELECT
  (SELECT COUNT(*) FROM public.applicants a
     JOIN public.companies c ON c.id = a.company_id
    WHERE c.interview_slug = 'test'
      AND ( a.email = 'debug@test.com' OR a.email ILIKE '%@test.local' )) AS target_applicants,
  (SELECT COUNT(*) FROM public.interviews iv
     JOIN public.applicants a ON a.id = iv.applicant_id
     JOIN public.companies c ON c.id = a.company_id
    WHERE c.interview_slug = 'test'
      AND ( a.email = 'debug@test.com' OR a.email ILIKE '%@test.local' )) AS target_interviews,
  (SELECT COUNT(*) FROM public.interview_results ir
     JOIN public.applicants a ON a.id = ir.applicant_id
     JOIN public.companies c ON c.id = a.company_id
    WHERE c.interview_slug = 'test'
      AND ( a.email = 'debug@test.com' OR a.email ILIKE '%@test.local' )) AS target_results;

-- (7-b) @example.com デモ応募者が残っていること（期待: 10）
SELECT COUNT(*) AS example_applicants
  FROM public.applicants a
  JOIN public.companies c ON c.id = a.company_id
 WHERE c.interview_slug = 'test'
   AND a.email ILIKE '%@example.com';

-- (7-c) テスト会社本体・求人・質問設定が消えていないこと（DELETE は applicants 系のみのはず）
SELECT
  (SELECT COUNT(*) FROM public.companies        WHERE interview_slug = 'test')                                              AS company_rows,        -- 期待: 1
  (SELECT COUNT(*) FROM public.jobs             WHERE company_id = (SELECT id FROM public.companies WHERE interview_slug='test')) AS jobs_rows,        -- 期待: 変化なし（例: 5）
  (SELECT COUNT(*) FROM public.common_questions WHERE company_id = (SELECT id FROM public.companies WHERE interview_slug='test')) AS common_q_rows,    -- 期待: 変化なし
  (SELECT COUNT(*) FROM public.job_questions jq
     JOIN public.jobs j ON j.id = jq.job_id
    WHERE j.company_id = (SELECT id FROM public.companies WHERE interview_slug='test'))                                     AS job_q_rows;           -- 期待: 変化なし
