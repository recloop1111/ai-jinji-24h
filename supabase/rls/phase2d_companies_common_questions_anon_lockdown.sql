-- ============================================================================
-- phase2d_companies_common_questions_anon_lockdown.sql
--   RLSハードニング Phase 2-d（対象: companies / common_questions の anon SELECT 遮断）
--
-- 【重要】
--   * これは MIGRATION ではない。supabase/migrations には置かない（本番自動適用しない）。
--   * 手動実行専用（運用者が Supabase SQL Editor / psql で意図的に流す）。本ファイルは未実行。
--   * 対象は companies / common_questions のみ。
--     jobs / job_questions / interview_results / applicants / interviews は触らない
--     （jobs / job_questions の公開SELECTは別フェーズ。他は Phase 1 / 2-c で対応済）。
--   * service role は RLS を bypass するため、公開フローの service-role API
--     （特に GET /api/interview/[slug]/public-config）には影響しない。
--
-- 背景 / 前提（Phase 2-d-1 完了済み）:
--   - companies の「公開フロー browser 直読み」は public-config API（service-role）へ移行済み
--     （/interview/[slug] の page / verify / prepare / form は anon で companies を読まない）。
--   - companies の anon 全列 SELECT は CRITICAL な情報露出だった
--     （company_setting_password_hash / email / phone / contact_* / price_per_interview / plan /
--       monthly_interview_* / stripe_customer_id / stripe_subscription_id / auth_user_id 等が anon で読めていた）。
--   - common_questions は公開フロー非依存。読み書きは QuestionEditor（authenticated）のみで、anon 読み手は存在しない。
--
-- 影響分析（DROP しても壊れない根拠）:
--   * anon_select_companies / anon_select_common_questions はいずれも role = anon。
--     authenticated（ログイン済 client / admin）の SELECT には元々マッチしない。
--   * companies を読むコードの内訳:
--       - 公開フロー    → public-config API（service-role / RLS bypass）… anon 依存は解消済
--       - app/api/**     → service-role or server client（RLS bypass / authenticated）
--       - client 画面    → authenticated（company）: company_select_own / company_update_own
--       - admin 画面     → authenticated（admin/super_admin）: 下記 admin_select_companies で担保
--       - lib/.../applyNextMonthLimit → service-role（RLS bypass）
--   * common_questions を読むコード = QuestionEditor のみ（authenticated）: company_all_common_questions（FOR ALL）が担う。
--
-- 適用後の到達権限:
--   anon            = companies / common_questions に一切アクセス不可
--   client(auth)    = companies: 自社 SELECT/UPDATE（company_select_own / company_update_own）
--                     common_questions: 自社 CRUD（company_all_common_questions）
--   admin(auth, role admin/super_admin) = companies: 全社 SELECT（admin_select_companies 追加）
--                     common_questions: 既存 company_all_common_questions に依存（本ファイルでは追加しない／後述NOTE）
--   公開応募フロー  = public-config API（service-role）で従来どおり動作
-- ============================================================================


-- ── 実行前確認SELECT（適用前に現行ポリシーを目視）──────────────────────────────
-- SELECT tablename, policyname, roles, cmd, qual, with_check
--   FROM pg_policies
--  WHERE schemaname = 'public' AND tablename IN ('companies','common_questions')
--  ORDER BY tablename, cmd, policyname;
--
-- 期待（適用前・anon系が存在すること）:
--   companies:
--     anon_select_companies   (roles={anon},          cmd=SELECT, qual=true 相当)   ← DROP 対象
--     company_select_own      (roles={authenticated}, cmd=SELECT)                   ← 残す
--     company_update_own      (roles={authenticated}, cmd=UPDATE)                   ← 残す
--   common_questions:
--     anon_select_common_questions (roles={anon},          cmd=SELECT)              ← DROP 対象
--     company_all_common_questions (roles={authenticated}, cmd=ALL)                 ← 残す
--
-- 【中止条件 / 要再検討】
--   * anon_select_companies / anon_select_common_questions の roles が {anon} ではなく
--     {public} 等で authenticated にも適用されている場合、client/admin の SELECT が
--     これに依存している可能性がある。その場合は本ファイルを流さず再設計すること。
--   * company_select_own が client 自社 SELECT を、company_all_common_questions が
--     client 自社 CRUD（SELECT 含む）を実際に許可していることを qual で確認すること。


BEGIN;

-- ── companies ───────────────────────────────────────────────────────────────
-- anon の全列 SELECT を遮断（機微列の anon 露出を停止）。公開フローは public-config API（service-role）。
DROP POLICY IF EXISTS anon_select_companies ON companies;
-- 残す: company_select_own（client 自社 SELECT）／ company_update_own（client 自社 UPDATE）

-- admin / super_admin は全社の companies を SELECT（admin 画面の browser 直読み用:
--   /admin/security の LockedAccountsList、/admin/applicants/[id] の企業名表示、/admin/companies/[id] など）。
-- ※ 旧 anon_select_companies は role=anon のため、これは「DROP の代替」ではなく
--   authenticated admin の SELECT を実 role 束縛に依存せず担保する追加（phase2c の admin_select_* と同方針）。
CREATE POLICY admin_select_companies ON companies
  FOR SELECT TO authenticated
  USING (
    auth.uid() IN (
      SELECT profiles.id FROM profiles
       WHERE profiles.id = auth.uid()
         AND profiles.role IN ('admin', 'super_admin')
    )
  );

-- ── common_questions ─────────────────────────────────────────────────────────
-- anon SELECT を遮断（公開フロー非依存・anon 読み手なし）。authenticated は company_all_common_questions が担う。
DROP POLICY IF EXISTS anon_select_common_questions ON common_questions;
-- 残す: company_all_common_questions（authenticated の自社 CRUD）

-- NOTE: common_questions には admin_* ポリシーを追加しない。
--   理由 ① anon 読み手が存在せず、anon SELECT の DROP は authenticated に無影響。
--        ② admin の QuestionEditor は SELECT/INSERT/DELETE の CRUD を要し、SELECT-only 追加では不十分。
--        ③ admin の common_questions フルアクセスは既存 company_all_common_questions（FOR ALL）が担う想定。
--   もし admin が他社の common_questions を管理できない事象があれば、それは本フェーズと独立の既存課題として別途対応する。

COMMIT;


-- ── 実行後確認SELECT（適用後に検証）──────────────────────────────────────────
-- (a) ポリシー一覧: anon_* が消え、company_* が残り、companies に admin_select_companies が増えること。
-- SELECT tablename, policyname, roles, cmd FROM pg_policies
--  WHERE schemaname = 'public' AND tablename IN ('companies','common_questions')
--  ORDER BY tablename, cmd, policyname;
--   companies 期待:        company_select_own / company_update_own / admin_select_companies
--   common_questions 期待: company_all_common_questions
--
-- (b) anon 実アクセス確認（anon key で REST）:
--   GET /rest/v1/companies?select=id         → 0件 / 403相当（適用前は全列読めていた）
--   GET /rest/v1/common_questions?select=id  → 0件 / 403相当
--   service-role では従来どおり読める（RLS bypass）。
--
-- 機能確認（壊れないこと）:
--   - 公開応募フロー: /interview/[slug] の page / verify / prepare / form が public-config API（service-role）で
--     企業情報・求人を取得して動作（companies anon 遮断後も無影響）。
--   - client企業ログイン: dashboard / billing / settings / applicants[id] / culture-analysis の companies 読み、
--     questions（QuestionEditor）の common_questions 読み書きが authenticated で動作。
--   - admin: /admin/security のロック企業一覧、/admin/applicants/[id] の企業名、/admin/companies/[id] の
--     企業情報・質問編集（QuestionEditor）が動作（companies は admin_select_companies、
--     common_questions は company_all_common_questions に依存）。


-- ── rollback SQL（元の anon 構成へ戻す・必要時のみ手動実行）─────────────────
-- BEGIN;
-- DROP POLICY IF EXISTS admin_select_companies ON companies;
-- CREATE POLICY anon_select_companies        ON companies        FOR SELECT TO anon USING (true);
-- CREATE POLICY anon_select_common_questions ON common_questions FOR SELECT TO anon USING (true);
-- COMMIT;
