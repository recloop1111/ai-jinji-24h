-- =====================================================================
-- AI人事24h v5: 料金(price_per_interview) / 翌月上限予約 / 企業設定変更用パスワード
-- =====================================================================
-- 適用前提:
--   - 本ファイルは「作成のみ」。Supabase本番/リモートDBへは未適用。
--   - 適用は運営が手動で行う（SQLエディタ or supabase db push 等）。
--   - 旧プラン(ライト/スタンダード/プロ/月額固定/31件目以降3,500円/自動繰上げ)は使用しない。
-- ---------------------------------------------------------------------

-- 1) 1面接あたりの単価（会社ごと）
--    通常企業=4000 / 特別契約(custom)=運営が3000等に変更。画面・APIは 4000 直書きせず本カラムを使う。
ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS price_per_interview integer NOT NULL DEFAULT 4000;

-- 2) 翌月の月間上限予約（企業側は翌月分のみ変更可。即時反映しない）
--    null = 予約なし。
ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS next_month_interview_limit integer;

-- 3) 翌月上限の適用開始月（その月の1日。例 2026-07-01）。
--    アクセス時に「today >= effective_month」なら monthly_interview_limit へ昇格してクリアする。
ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS next_month_limit_effective_month date;

-- 4) 企業設定変更用パスワード（ログインPWとは別）。SHA/scrypt等の hash を保存（平文禁止）。
--    ※ 初期設定フロー（誰がいつ設定するか）は別途UI/方針の決定が必要。未設定(null)の間は
--      翌月上限予約の確定をどう扱うか（不可 or ログインPWで暫定 等）を要決定。
ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS company_setting_password_hash text;

-- ---------------------------------------------------------------------
-- 5) 運営管理設定変更用パスワード（ログインPWとは別）の保存先（単一行運用）
--    重要設定（料金/上限/契約種別/ステータス等）の変更時に検証する。hash のみ保存（平文禁止）。
CREATE TABLE IF NOT EXISTS admin_security_settings (
  id text PRIMARY KEY DEFAULT 'default',
  setting_password_hash text,                       -- "<saltHex>:<hashHex>"（scrypt）。null=未設定
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- RLS を有効化し、ポリシーは付与しない（= anon/authenticated からは不可、service role のみアクセス可）。
-- 運営API は service role 経由で読み書きする。
ALTER TABLE admin_security_settings ENABLE ROW LEVEL SECURITY;
-- ---------------------------------------------------------------------
