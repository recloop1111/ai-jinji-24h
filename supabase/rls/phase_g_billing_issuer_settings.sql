-- ============================================================================
-- phase_g_billing_issuer_settings.sql
--   Phase G: 請求書の「発行者情報・振込先情報」を運営(admin)が登録/編集できるよう
--   DB化する（現状 lib/config/billing.ts に固定の BILLING_ISSUER / BILLING_BANK /
--   BILLING_TERMS.paymentNote をDBへ移す）。シングルトン設定（id='default' の1行）。
--
-- 【重要】
--   * これは MIGRATION ではない。supabase/migrations には置かない（本番自動適用しない）。
--   * 手動実行専用（運用者が Supabase SQL Editor / psql で意図的に流す）。本ファイルは未実行。
--   * 本番=Preview 同一プロジェクトのため、適用＝本番反映。適用は承認後に行う。
--
-- 目的 / 設計:
--   - 運営(admin/super_admin)のみ、請求書の発行者/振込先/支払案内文を編集できる。
--   - client企業側には一切表示しない（テーブルに anon/authenticated grant・policy を付与しない）。
--   - 解決優先順位（発行者/振込先/payment_note）: DB(billing_issuer_settings) → 未設定なら
--     lib/config/billing.ts(BILLING_ISSUER/BILLING_BANK/BILLING_TERMS.paymentNote) を fallback。
--   - taxRate / numberPrefix / issuableStatuses は config のまま（DB化しない・ロジック定数）。
--   - 将来 monthly-billing writer が確定時に billing_records.invoice_snapshot へ
--     { bill_to, issuer, bank, snapshot_at } を凍結（issuer/bank は本テーブルの値）。
--
-- アクセス方針（確定・admin_security_settings と同型）:
--   * RLS 有効・ポリシー無し ＝ anon/authenticated（client含む）からは到達不可。
--     └ policy を作らない理由: client企業側から発行者情報/口座情報を「絶対に」読ませないため。
--       policy を1つでも付けると authenticated 経由でブラウザ直読みの口が開くため、意図的に0件にする。
--   * 読み書きは service_role 経由の admin API（getAdminUser でゲート）のみ。
--     └ admin もブラウザからの直アクセス（anon/authenticated クライアント）では扱わない。
--       admin UI は必ず service-role API（getAdminUser で認可）を経由する。
--   * PDF生成（client/admin の invoice route）・将来 writer も service_role で本テーブルを読む。
--   * 保存/更新（API側）は「運営管理設定変更用パスワード」
--     （admin_security_settings.setting_password_hash）必須にする予定（口座情報＝機微）。
--   * シングルトン: id text PK DEFAULT 'default' ＋ CHECK(id='default') で1行に固定。
--   * 初期行は seed しない（行が無い間は config fallback で動く）。API の upsert で id='default' を作成。
--     └ 初期行を作らない理由: 行が無い間は lib/config/billing.ts へ fallback して後方互換を保つため
--       （DB化前と同じPDF出力を維持し、admin が実値を保存した時点で DB 優先へ切り替わる）。
--
-- DB列 → config(fallback) 対応（API側でマッピング。PDFが使う項目のみ列を持つ）:
--   issuer_name        → BILLING_ISSUER.companyName
--   postal_code        → BILLING_ISSUER.postalCode
--   address            → BILLING_ISSUER.address
--   building           → BILLING_ISSUER.building
--   tel                → BILLING_ISSUER.tel
--   registration_number→ BILLING_ISSUER.registrationNumber（空OK・空ならPDFで登録番号行を出さない）
--   bank_name          → BILLING_BANK.bankName
--   branch_name        → BILLING_BANK.branchName
--   account_type       → BILLING_BANK.accountType
--   account_number     → BILLING_BANK.accountNumber
--   account_holder     → BILLING_BANK.accountHolder
--   payment_note       → BILLING_TERMS.paymentNote
--   ※ config の email / representative はPDF未使用のため列を持たない（要件項目にも無い）。
-- ============================================================================


-- ----------------------------------------------------------------------------
-- ⓪ 適用前チェック（READ-ONLY・状態を変えない）
-- ----------------------------------------------------------------------------
-- (1) 既に存在しないか（再適用事故防止）。NULL = 未作成で正常。
--   SELECT to_regclass('public.billing_issuer_settings') AS table_exists;
--
-- (2) 依存テーブルの存在（FK先 profiles / 設定PW参照先 admin_security_settings）
--   SELECT to_regclass('public.profiles')                AS profiles,
--          to_regclass('public.admin_security_settings') AS admin_security_settings;
--
-- (3) 命名衝突がないか（同名 policy 等の事故防止・通常0件）
--   SELECT policyname FROM pg_policies
--   WHERE schemaname='public' AND tablename='billing_issuer_settings';
--
-- 判定: (1) が NULL（未作成）・(2) が両方 非NULL であること。


BEGIN;

-- =========================================================
-- A) billing_issuer_settings（発行者/振込先/支払案内文・運営の単一設定）
-- =========================================================
CREATE TABLE IF NOT EXISTS public.billing_issuer_settings (
  id                  text PRIMARY KEY DEFAULT 'default' CHECK (id = 'default'), -- シングルトン
  -- 発行者
  issuer_name         text,   -- 発行者名
  postal_code         text,   -- 郵便番号
  address             text,   -- 住所
  building            text,   -- 建物名（任意）
  tel                 text,   -- 電話番号
  registration_number text,   -- 登録番号（T+13桁。空OK＝空ならPDFに登録番号行を出さない）
  -- 振込先
  bank_name           text,   -- 銀行名
  branch_name         text,   -- 支店名
  account_type        text,   -- 口座種別（普通/当座 等）
  account_number      text,   -- 口座番号
  account_holder      text,   -- 口座名義
  -- 文言
  payment_note        text,   -- 支払案内文/備考
  -- 監査
  updated_by          uuid REFERENCES public.profiles(id) ON DELETE SET NULL, -- 最終更新した運営
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.billing_issuer_settings IS
  '請求書の発行者/振込先/支払案内文（運営の単一設定・id=default）。未設定時は lib/config/billing.ts を fallback。';

-- =========================================================
-- B) RLS（admin_security_settings と同型: 有効化のみ・ポリシー無し）
--    ＝ anon/authenticated（client含む）からは到達不可。service_role のみ。
-- =========================================================
ALTER TABLE public.billing_issuer_settings ENABLE ROW LEVEL SECURITY;
-- ※ ポリシーは意図的に作成しない（運営API は service_role 経由・getAdminUser でゲート）。

-- =========================================================
-- C) grant/revoke（anon/authenticated 完全遮断・service_role のみ CRUD）
-- =========================================================
REVOKE ALL ON public.billing_issuer_settings FROM anon;
REVOKE ALL ON public.billing_issuer_settings FROM authenticated; -- client/企業ユーザーも遮断
GRANT  SELECT, INSERT, UPDATE, DELETE ON public.billing_issuer_settings TO service_role;
-- ※ service_role の DELETE はロールバック/運用保守用。通常UI（admin 請求書設定画面）からは
--    削除導線を作らない（編集=upsert のみ）。行削除＝ config fallback へ戻る挙動になる。

COMMIT;


-- ----------------------------------------------------------------------------
-- ② 適用後の検証（READ-ONLY）
-- ----------------------------------------------------------------------------
-- (A) テーブル・列ができたか
--   SELECT to_regclass('public.billing_issuer_settings') AS table_ok;
--   SELECT column_name, data_type, is_nullable FROM information_schema.columns
--   WHERE table_schema='public' AND table_name='billing_issuer_settings' ORDER BY ordinal_position;
--
-- (B) シングルトン制約（CHECK id='default'）が付いているか
--   SELECT con.conname, pg_get_constraintdef(con.oid) AS def
--   FROM pg_constraint con
--   WHERE con.conrelid = 'public.billing_issuer_settings'::regclass AND con.contype = 'c';
--
-- (C) RLS 有効 ＆ ポリシー0件（＝service_role 以外到達不可）
--   SELECT relrowsecurity FROM pg_class WHERE oid='public.billing_issuer_settings'::regclass; -- t
--   SELECT count(*) AS policy_count FROM pg_policies
--   WHERE schemaname='public' AND tablename='billing_issuer_settings';                        -- 0
--
-- (D) grant（anon=0 / authenticated=0 / service_role=SELECT,INSERT,UPDATE,DELETE）
--   SELECT grantee, privilege_type FROM information_schema.role_table_grants
--   WHERE table_schema='public' AND table_name='billing_issuer_settings'
--     AND grantee IN ('anon','authenticated','service_role')
--   ORDER BY grantee, privilege_type;
--   -- 期待: anon 0行 / authenticated 0行 / service_role = SELECT,INSERT,UPDATE,DELETE
--
-- (E) シングルトン動作の確認（任意・行はまだ無い想定。0件で正常）
--   SELECT id FROM public.billing_issuer_settings;   -- 0件（seed しないため）


-- ============================================================================
-- ③ ROLLBACK（適用取り消し・承認後）
--   ⚠️ 登録済みの発行者/振込先設定（行データ）も削除される点に注意。
--   ※ billing_records.invoice_snapshot は本フェーズで触らない（Phase F で追加済み・別管理）。
-- ============================================================================
-- BEGIN;
--   DROP TABLE IF EXISTS public.billing_issuer_settings;  -- 行データも消える
-- COMMIT;
-- ============================================================================
