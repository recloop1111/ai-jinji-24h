-- ============================================================================
-- phase2f_dead_tables_anon_lockdown.sql
--   RLSハードニング Phase 2-f（対象: 死蔵5テーブルの anon/public SELECT/INSERT 遮断）
--
-- 【重要】
--   * これは MIGRATION ではない。supabase/migrations には置かない（本番自動適用しない）。
--   * 手動実行専用（運用者が Supabase SQL Editor / psql で意図的に流す）。本ファイルは未実行。
--   * 対象は下記5テーブルのみ:
--       applicant_feedback / cooldown_locks / interview_re_exam_records / otp_locks / satisfaction_ratings
--   * テーブル自体は DROP しない。データ削除もしない。policy だけ閉じる。
--   * service role は RLS を bypass するため、将来これらを使う処理は service-role API で実装すればよい。
--
-- 背景（全テーブルが死蔵＝コード参照ゼロ）:
--   - 5テーブルとも app/ components/ lib/ からの read/write が一切無い（リポジトリ全文検索で確認）。
--       applicant_feedback        : 応募者フィードバック一時保存（設計のみ・未実装）
--       cooldown_locks            : 受験クールダウンロック（未実装）
--       interview_re_exam_records : 再受験履歴（未実装）
--       otp_locks                 : OTPロック（実SMS/Twilio 未導入・現状「1234」モック）
--       satisfaction_ratings      : 旧設計の死蔵テーブル。満足度の実保存先は applicants.satisfaction_rating
--                                   （POST /api/interview/[slug]/satisfaction が service-role で書き込み済み）
--   - 現状ポリシーは public(=anon含む) の true 全開放:
--       applicant_feedback        : anon_insert_applicant_feedback (INSERT, with_check=true)
--                                   anon_select_applicant_feedback (SELECT, qual=true)
--       cooldown_locks            : anon_select_cooldown_locks (SELECT, qual=true)
--       interview_re_exam_records : anon_select_interview_re_exam_records (SELECT, qual=true)
--       otp_locks                 : anon_select_otp_locks (SELECT, qual=true)
--       satisfaction_ratings      : anon_insert_satisfaction_ratings (INSERT, with_check=true)
--   - 危険性: anon INSERT 開放（applicant_feedback / satisfaction_ratings）は今すぐ任意のゴミ/スパム行を
--     注入可能。SELECT true（otp_locks / cooldown_locks / interview_re_exam_records）は将来データが入ると漏洩。
--
-- 影響分析（DROP しても壊れない根拠）:
--   * 5テーブルとも公開フロー / client / admin / API / lib のいずれからも使われていない（死蔵）。
--   * よって anon/public policy を閉じても、壊れる画面・API・バッチは存在しない。
--
-- 適用後の到達権限:
--   anon / authenticated = 5テーブルに一切アクセス不可（RLS有効・policy 0件＝service-role のみ到達）
--   service role         = 従来どおり全アクセス（RLS bypass）。将来機能実装はここから。
-- ============================================================================


-- ── 実行前確認SELECT（適用前に現行ポリシーを目視）──────────────────────────────
-- SELECT tablename, policyname, roles, cmd, qual, with_check
--   FROM pg_policies
--  WHERE schemaname = 'public'
--    AND tablename IN ('applicant_feedback','cooldown_locks','interview_re_exam_records','otp_locks','satisfaction_ratings')
--  ORDER BY tablename, cmd, policyname;
--
-- 期待（適用前・以下の public true 系が存在すること。policyname は環境で実名確認）:
--   applicant_feedback        : anon_insert_applicant_feedback (roles={public}, INSERT, with_check=true)
--                               anon_select_applicant_feedback (roles={public}, SELECT, qual=true)
--   cooldown_locks            : anon_select_cooldown_locks (roles={public}, SELECT, qual=true)
--   interview_re_exam_records : anon_select_interview_re_exam_records (roles={public}, SELECT, qual=true)
--   otp_locks                 : anon_select_otp_locks (roles={public}, SELECT, qual=true)
--   satisfaction_ratings      : anon_insert_satisfaction_ratings (roles={public}, INSERT, with_check=true)
--
-- 【中止条件 / 要再検討】
--   * 上記以外に、これら5テーブルへ authenticated/company系 等の「使われている」ポリシーが存在する場合は、
--     本当に死蔵かを再確認してから進める（本フェーズは「死蔵＝コード参照ゼロ」が前提）。
--   * policyname が上記と異なる場合は、実行前SELECTの実名に読み替えて DROP すること
--     （DROP POLICY IF EXISTS は存在しない名前には無害だが、閉じ漏れを防ぐため実名で確認）。
--   * これら5テーブルに対し、想定外に他テーブルが外部キー/トリガ経由で書き込んでいないかも一応確認。


BEGIN;

-- ── applicant_feedback（anon の INSERT/SELECT 全開放を遮断）──────────────────────
DROP POLICY IF EXISTS anon_insert_applicant_feedback ON applicant_feedback;
DROP POLICY IF EXISTS anon_select_applicant_feedback ON applicant_feedback;

-- ── cooldown_locks（anon SELECT 全開放を遮断）──────────────────────────────────
DROP POLICY IF EXISTS anon_select_cooldown_locks ON cooldown_locks;

-- ── interview_re_exam_records（anon SELECT 全開放を遮断）────────────────────────
DROP POLICY IF EXISTS anon_select_interview_re_exam_records ON interview_re_exam_records;

-- ── otp_locks（anon SELECT 全開放を遮断）───────────────────────────────────────
DROP POLICY IF EXISTS anon_select_otp_locks ON otp_locks;

-- ── satisfaction_ratings（anon INSERT 全開放を遮断・死蔵。実保存先は applicants.satisfaction_rating）──
DROP POLICY IF EXISTS anon_insert_satisfaction_ratings ON satisfaction_ratings;

-- 追加ポリシーは作らない（死蔵テーブルのため authenticated/admin 等の到達は不要）。
-- 将来これらの機能を実装する際に、その時点で service-role API または authenticated 限定 policy を設計する。

COMMIT;


-- ── 実行後確認SELECT（適用後に検証）──────────────────────────────────────────
-- (a) ポリシー一覧: 上記 anon_* が消えること（5テーブルとも public true 系が無くなる）。
-- SELECT tablename, policyname, roles, cmd FROM pg_policies
--  WHERE schemaname = 'public'
--    AND tablename IN ('applicant_feedback','cooldown_locks','interview_re_exam_records','otp_locks','satisfaction_ratings')
--  ORDER BY tablename, cmd, policyname;
--   期待: 上記5テーブルに anon/public の SELECT/INSERT policy が残っていないこと
--         （RLS は有効のまま・policy 0件＝service-role のみ到達）。
--
-- (b) RLS 有効の再確認（policy 0件でも RLS 無効だと開いてしまうため）:
-- SELECT c.relname, c.relrowsecurity FROM pg_class c
--   JOIN pg_namespace n ON n.oid = c.relnamespace
--  WHERE n.nspname='public'
--    AND c.relname IN ('applicant_feedback','cooldown_locks','interview_re_exam_records','otp_locks','satisfaction_ratings');
--   期待: relrowsecurity = true（全て）。false があれば別途 ENABLE ROW LEVEL SECURITY が必要。
--
-- (c) anon 実アクセス確認（anon key で REST）:
--   GET  /rest/v1/applicant_feedback?select=id           → 0件 / 403相当
--   GET  /rest/v1/cooldown_locks?select=id               → 0件 / 403相当
--   GET  /rest/v1/interview_re_exam_records?select=id     → 0件 / 403相当
--   GET  /rest/v1/otp_locks?select=id                    → 0件 / 403相当
--   POST /rest/v1/applicant_feedback                      → 401/403（anon INSERT 不可）
--   POST /rest/v1/satisfaction_ratings                    → 401/403（anon INSERT 不可）
--   service-role では従来どおりアクセス可（RLS bypass）。
--
-- 機能確認（壊れないこと）:
--   - 5テーブルはコード未使用のため、公開フロー / client / admin / API に影響が出ないこと
--     （満足度は applicants.satisfaction_rating ＝ POST /api/interview/[slug]/satisfaction で従来どおり保存・
--       GET /api/admin/satisfaction で集計表示。satisfaction_ratings には依存しない）。


-- ── rollback SQL（元の public true 構成へ戻す・必要時のみ手動実行）─────────────
-- BEGIN;
-- CREATE POLICY anon_insert_applicant_feedback            ON applicant_feedback        FOR INSERT TO public WITH CHECK (true);
-- CREATE POLICY anon_select_applicant_feedback            ON applicant_feedback        FOR SELECT TO public USING (true);
-- CREATE POLICY anon_select_cooldown_locks                ON cooldown_locks            FOR SELECT TO public USING (true);
-- CREATE POLICY anon_select_interview_re_exam_records     ON interview_re_exam_records FOR SELECT TO public USING (true);
-- CREATE POLICY anon_select_otp_locks                     ON otp_locks                 FOR SELECT TO public USING (true);
-- CREATE POLICY anon_insert_satisfaction_ratings          ON satisfaction_ratings      FOR INSERT TO public WITH CHECK (true);
-- COMMIT;
