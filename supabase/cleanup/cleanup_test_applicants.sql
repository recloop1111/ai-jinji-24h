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
-- 期待: 8件（鈴木/渡辺/田中太郎/高橋/佐藤/伊藤/中村/山本）。これらは削除しない。
-- 参考: 非テスト応募者は合計10件（@example.com 8件 ＋ じじじじ2件＝jui@ki.com / loo@m.com）。
--   じじじじ2件は @example.com ではないため本 SELECT には出ないが、email 条件にも一致せず削除対象外。

-- (2-d) 削除対象に @example.com が混ざっていないこと（0 を期待＝誤爆ガード）
SELECT COUNT(*) AS leaked_example_in_target
  FROM public.applicants a
  JOIN public.companies c ON c.id = a.company_id
 WHERE c.interview_slug = 'test'
   AND ( a.email = 'debug@test.com' OR a.email ILIKE '%@test.local' )
   AND a.email ILIKE '%@example.com';
-- 期待: 0


-- ── §3. 関連データの確認 ────────────────────────────────────────────────────
-- 対象 applicant / 対象 interview に紐づく子データの件数を事前に把握する。
-- §4 で判明した FK の削除規則（重要）:
--   [NO ACTION：親より先に明示 DELETE 必須]
--     interview_results.applicant_id    → applicants.id   : NO ACTION
--     interview_results.interview_id    → interviews.id   : NO ACTION
--     interview_re_exam_records.interview_id → interviews.id : NO ACTION
--   [CASCADE：親 DELETE で自動削除されるが、件数は事前/事後に確認できるようにする]
--     interview_logs.interview_id       → interviews.id   : CASCADE
--     applicant_feedback.interview_id   → interviews.id   : CASCADE
--     reports.interview_id              → interviews.id   : CASCADE
--     satisfaction_ratings.interview_id → interviews.id   : CASCADE
--     internal_memos.applicant_id       → applicants.id   : CASCADE
--     selection_status_histories.applicant_id → applicants.id : CASCADE
--     sent_emails.applicant_id          → applicants.id   : CASCADE

-- (3-a) interview 経由で紐づく子データ件数（→interviews の FK 群）
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
SELECT
  (SELECT COUNT(*) FROM target_interviews)                                                                       AS interviews_count,                  -- 期待: 36
  (SELECT COUNT(*) FROM public.interview_re_exam_records WHERE interview_id IN (SELECT id FROM target_interviews)) AS reexam_records_count,             -- NO ACTION（明示削除）
  (SELECT COUNT(*) FROM public.interview_logs           WHERE interview_id IN (SELECT id FROM target_interviews)) AS interview_logs_count,             -- 期待: 0（CASCADE）
  (SELECT COUNT(*) FROM public.applicant_feedback       WHERE interview_id IN (SELECT id FROM target_interviews)) AS applicant_feedback_count,         -- CASCADE
  (SELECT COUNT(*) FROM public.reports                  WHERE interview_id IN (SELECT id FROM target_interviews)) AS reports_count,                    -- CASCADE
  (SELECT COUNT(*) FROM public.satisfaction_ratings     WHERE interview_id IN (SELECT id FROM target_interviews)) AS satisfaction_ratings_count;       -- 期待: 0（CASCADE）

-- (3-b) applicant 経由 ＋ interview_results（applicant_id / interview_id 両系統）の件数
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
SELECT
  (SELECT COUNT(*) FROM public.interview_results
     WHERE applicant_id IN (SELECT id FROM targets)
        OR interview_id IN (SELECT id FROM target_interviews))                                            AS interview_results_count,           -- 期待: 1（NO ACTION・OR 両系統）
  (SELECT COUNT(*) FROM public.internal_memos             WHERE applicant_id IN (SELECT id FROM targets))  AS internal_memos_count,              -- CASCADE
  (SELECT COUNT(*) FROM public.selection_status_histories WHERE applicant_id IN (SELECT id FROM targets))  AS selection_status_histories_count,  -- CASCADE
  (SELECT COUNT(*) FROM public.sent_emails                WHERE applicant_id IN (SELECT id FROM targets))  AS sent_emails_count;                 -- CASCADE

-- (3-c) is_billable=true が 0 件であること（課金影響なしの確認）
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
-- 方式（temp table 退避版・厳密確認）:
--   削除前に対象 applicant_id / interview_id を一時テーブルへ固定し、DELETE も削除後確認も
--   その固定 ID を参照する。これにより「親を消した後でも、同じ ID 集合で子の残存(=0)を厳密に検証」できる。
--   一時テーブル（ON COMMIT DROP・セッションローカル）:
--     cleanup_target_applicants  … 削除対象 applicant の id（テスト会社＋email 条件で確定）
--     cleanup_target_interviews  … 上記 applicant に紐づく interview の id
--   ※ 一時テーブルは ON COMMIT DROP のため COMMIT/ROLLBACK 時に自動消滅。
--     したがって「固定 ID による厳密な削除後確認」は §5 の同一トランザクション内（COMMIT 前）で行う。
--     §7（COMMIT 後）は temp table 消滅後のため、slug＋email 再導出による事後サニティチェックとする。
--
-- 削除順（§4 の FK 規則に準拠・すべて固定 ID を参照）:
--   1) interview_re_exam_records   … NO ACTION（→interviews）。親 interviews より先に明示削除。
--   2) interview_results           … NO ACTION（→interviews ＆ →applicants）。OR 両系統で明示削除。
--   3) interview_logs              … CASCADE（→interviews）だが件数可視化のため明示削除（無害）。
--   4) interviews                  … 削除すると CASCADE で applicant_feedback / reports /
--                                     satisfaction_ratings が自動削除される。
--   5) applicants                  … 削除すると CASCADE で internal_memos /
--                                     selection_status_histories / sent_emails が自動削除される。
--   ※ applicant_feedback / reports / satisfaction_ratings / internal_memos /
--     selection_status_histories / sent_emails は CASCADE のため明示 DELETE しない
--     （事前=§3、事後=下記の固定 ID 確認で 0 を検証する）。
--
-- 実行手順（重要）:
--   * BEGIN から「削除後 件数確認」までを Supabase SQL Editor で **同一セッション・同一トランザクション**
--     としてまとめて実行する（CREATE TEMP TABLE と DELETE と確認を分割実行しない）。
--   * 確認で全関連テーブル 0 ＆ @example.com=8 ＆ jobs/job_questions/common_questions 不変なら COMMIT。
--   * 想定外なら ROLLBACK（同一トランザクション内でのみ有効）。
BEGIN;

-- ── 対象 ID を一時テーブルへ固定（テスト会社 ＋ email 条件。誤爆ガード）──────────
CREATE TEMP TABLE cleanup_target_applicants ON COMMIT DROP AS
  SELECT a.id
    FROM public.applicants a
    JOIN public.companies c ON c.id = a.company_id
   WHERE c.interview_slug = 'test'
     AND ( a.email = 'debug@test.com' OR a.email ILIKE '%@test.local' );

CREATE TEMP TABLE cleanup_target_interviews ON COMMIT DROP AS
  SELECT iv.id
    FROM public.interviews iv
   WHERE iv.applicant_id IN (SELECT id FROM cleanup_target_applicants);

-- ── 削除前の固定件数確認（ここで想定と一致しなければ ROLLBACK）──────────────────
-- 期待: target_applicants = 24 / target_interviews = 36
SELECT
  (SELECT COUNT(*) FROM cleanup_target_applicants) AS target_applicants,   -- 期待: 24
  (SELECT COUNT(*) FROM cleanup_target_interviews) AS target_interviews;   -- 期待: 36

-- (5-1) interview_re_exam_records（NO ACTION・子）: 固定 interview_id 分を削除
DELETE FROM public.interview_re_exam_records
 WHERE interview_id IN (SELECT id FROM cleanup_target_interviews);

-- (5-2) interview_results（NO ACTION・子）: applicant_id 経由 OR interview_id 経由の両方を固定 ID で削除
DELETE FROM public.interview_results
 WHERE applicant_id IN (SELECT id FROM cleanup_target_applicants)
    OR interview_id  IN (SELECT id FROM cleanup_target_interviews);

-- (5-3) interview_logs（CASCADE・子）: 件数可視化のため固定 interview_id 分を明示削除（無害）
DELETE FROM public.interview_logs
 WHERE interview_id IN (SELECT id FROM cleanup_target_interviews);

-- (5-4) interviews（親）: 固定 interview_id を削除
--   → CASCADE で applicant_feedback / reports / satisfaction_ratings が自動削除される
DELETE FROM public.interviews
 WHERE id IN (SELECT id FROM cleanup_target_interviews);

-- (5-5) applicants（親）: 固定 applicant_id を削除
--   → CASCADE で internal_memos / selection_status_histories / sent_emails が自動削除される
DELETE FROM public.applicants
 WHERE id IN (SELECT id FROM cleanup_target_applicants);

-- ── 削除後 件数確認（固定 ID 参照・COMMIT 判断用・このトランザクション内で実行）────
-- 期待: 下記すべて 0（固定 ID 集合に対し残存が無いことを厳密に確認）
SELECT
  (SELECT COUNT(*) FROM public.interview_re_exam_records  WHERE interview_id IN (SELECT id FROM cleanup_target_interviews)) AS reexam_records,        -- 期待: 0
  (SELECT COUNT(*) FROM public.interview_results          WHERE applicant_id IN (SELECT id FROM cleanup_target_applicants)
                                                             OR interview_id IN (SELECT id FROM cleanup_target_interviews)) AS interview_results,     -- 期待: 0
  (SELECT COUNT(*) FROM public.interview_logs             WHERE interview_id IN (SELECT id FROM cleanup_target_interviews)) AS interview_logs,        -- 期待: 0
  (SELECT COUNT(*) FROM public.applicant_feedback         WHERE interview_id IN (SELECT id FROM cleanup_target_interviews)) AS applicant_feedback,    -- 期待: 0
  (SELECT COUNT(*) FROM public.reports                    WHERE interview_id IN (SELECT id FROM cleanup_target_interviews)) AS reports,               -- 期待: 0
  (SELECT COUNT(*) FROM public.satisfaction_ratings       WHERE interview_id IN (SELECT id FROM cleanup_target_interviews)) AS satisfaction_ratings,  -- 期待: 0
  (SELECT COUNT(*) FROM public.internal_memos             WHERE applicant_id IN (SELECT id FROM cleanup_target_applicants)) AS internal_memos,        -- 期待: 0
  (SELECT COUNT(*) FROM public.selection_status_histories WHERE applicant_id IN (SELECT id FROM cleanup_target_applicants)) AS selection_histories,   -- 期待: 0
  (SELECT COUNT(*) FROM public.sent_emails                WHERE applicant_id IN (SELECT id FROM cleanup_target_applicants)) AS sent_emails,           -- 期待: 0
  (SELECT COUNT(*) FROM public.interviews                 WHERE id IN (SELECT id FROM cleanup_target_interviews))           AS interviews,            -- 期待: 0
  (SELECT COUNT(*) FROM public.applicants                 WHERE id IN (SELECT id FROM cleanup_target_applicants))           AS applicants;            -- 期待: 0

-- 残す @example.com デモ応募者が無傷であること（期待: 8）
SELECT COUNT(*) AS remaining_example_applicants
  FROM public.applicants a
  JOIN public.companies c ON c.id = a.company_id
 WHERE c.interview_slug = 'test'
   AND a.email ILIKE '%@example.com';

-- jobs / job_questions / common_questions が元の件数を維持していること（削除対象外）
SELECT
  (SELECT COUNT(*) FROM public.jobs             WHERE company_id = (SELECT id FROM public.companies WHERE interview_slug='test')) AS jobs_rows,        -- 期待: 5
  (SELECT COUNT(*) FROM public.common_questions WHERE company_id = (SELECT id FROM public.companies WHERE interview_slug='test')) AS common_q_rows,    -- 期待: 3
  (SELECT COUNT(*) FROM public.job_questions jq
     JOIN public.jobs j ON j.id = jq.job_id
    WHERE j.company_id = (SELECT id FROM public.companies WHERE interview_slug='test'))                                          AS job_q_rows;        -- 期待: 107

-- 問題なければ:
--   COMMIT;
-- 想定外なら:
--   ROLLBACK;
-- ↑ どちらか一方を手動で実行してトランザクションを閉じること（開いたまま放置しない）。
--   COMMIT/ROLLBACK のいずれでも一時テーブル（ON COMMIT DROP）は自動消滅する。


-- ── §6. ROLLBACK についての注意 ────────────────────────────────────────────
-- * ROLLBACK は §5 の BEGIN で開始した同一トランザクション内でのみ有効。
-- * COMMIT 実行後は ROLLBACK では戻せない（復旧はバックアップからのリストアが必要）。
-- * したがって §5 は「BEGIN → CREATE TEMP TABLE×2 → 削除前件数確認 → DELETE×5 → 削除後件数確認」
--   までを同一トランザクションで一気に実行し、件数を目視で確認してから COMMIT か ROLLBACK を選ぶこと。
-- * 一時テーブルは ON COMMIT DROP のため、固定 ID を使う厳密確認は §5 内（COMMIT 前）でのみ可能。
--   §7 は COMMIT 後（temp 消滅後）の slug＋email 再導出による事後サニティチェック。


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

-- (7-a2) COMMIT 後のサニティチェック（temp table は ON COMMIT DROP で消滅済みのため slug＋email 再導出）
--   ※ 厳密な固定 ID 確認は §5 内（COMMIT 前）で実施済み。ここは「テスト会社＋email 条件で
--     applicants/interviews を再導出しても 0 件＝対象が完全に消えている」ことの事後確認。
--     親が消えていれば子フィルタも空集合となり 0 になる（孤児が無いことの追認）。
WITH targets AS (
  SELECT a.id FROM public.applicants a
    JOIN public.companies c ON c.id = a.company_id
   WHERE c.interview_slug = 'test'
     AND ( a.email = 'debug@test.com' OR a.email ILIKE '%@test.local' )
),
target_interviews AS (
  SELECT id FROM public.interviews WHERE applicant_id IN (SELECT id FROM targets)
)
SELECT
  (SELECT COUNT(*) FROM targets)                                                                                   AS target_applicants,       -- 期待: 0
  (SELECT COUNT(*) FROM target_interviews)                                                                         AS target_interviews,       -- 期待: 0
  (SELECT COUNT(*) FROM public.interview_re_exam_records  WHERE interview_id IN (SELECT id FROM target_interviews)) AS reexam_records,         -- 期待: 0
  (SELECT COUNT(*) FROM public.interview_logs            WHERE interview_id IN (SELECT id FROM target_interviews)) AS interview_logs,         -- 期待: 0
  (SELECT COUNT(*) FROM public.applicant_feedback        WHERE interview_id IN (SELECT id FROM target_interviews)) AS applicant_feedback,     -- 期待: 0
  (SELECT COUNT(*) FROM public.reports                   WHERE interview_id IN (SELECT id FROM target_interviews)) AS reports,                -- 期待: 0
  (SELECT COUNT(*) FROM public.satisfaction_ratings      WHERE interview_id IN (SELECT id FROM target_interviews)) AS satisfaction_ratings,   -- 期待: 0
  (SELECT COUNT(*) FROM public.internal_memos            WHERE applicant_id IN (SELECT id FROM targets))            AS internal_memos,          -- 期待: 0
  (SELECT COUNT(*) FROM public.selection_status_histories WHERE applicant_id IN (SELECT id FROM targets))           AS selection_histories,     -- 期待: 0
  (SELECT COUNT(*) FROM public.sent_emails               WHERE applicant_id IN (SELECT id FROM targets))            AS sent_emails;             -- 期待: 0

-- (7-b) @example.com デモ応募者が残っていること（期待: 8）
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
