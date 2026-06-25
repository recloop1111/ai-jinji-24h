-- ============================================================================
-- phase2g_preflight_readonly.sql
--   phase2g（companies 機微列の authenticated 直接UPDATE 遮断）の適用前チェック。
--   READ-ONLY・SELECT のみ。状態を変えない。本番/Preview で安全に実行可。
--
-- 【重要】これは確認用。REVOKE/GRANT は含まない（適用は phase2g_…revoke.sql・承認後）。
-- ============================================================================

-- 1) 現在 authenticated が UPDATE 権限を持つ companies の列を一覧（適用前のスナップショット）
SELECT column_name
FROM information_schema.role_column_grants
WHERE table_schema = 'public'
  AND table_name   = 'companies'
  AND grantee      = 'authenticated'
  AND privilege_type = 'UPDATE'
ORDER BY column_name;

-- 2) テーブル全体 UPDATE（列指定なし）が authenticated に付与されているか
--    （列単体 REVOKE が効かない＝テーブル全体付与がある、を確認するため）
SELECT grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND table_name   = 'companies'
  AND grantee      = 'authenticated'
  AND privilege_type = 'UPDATE';

-- 3) 機微8列が現状 authenticated から UPDATE 可能になっていないか（=穴の確認）
--    期待: 適用前は「8列とも UPDATE 可（穴あり）」/ 適用後は「0 行（遮断済み）」
SELECT column_name
FROM information_schema.role_column_grants
WHERE table_schema = 'public'
  AND table_name   = 'companies'
  AND grantee      = 'authenticated'
  AND privilege_type = 'UPDATE'
  AND column_name IN (
    'price_per_interview', 'monthly_interview_limit', 'plan',
    'is_suspended', 'status', 'company_setting_password_hash',
    'next_month_interview_limit', 'next_month_limit_effective_month'
  )
ORDER BY column_name;

-- 判定:
--   * 手順1/2 の結果から、authenticated が現状「テーブル全体 UPDATE」を持つことを確認
--     （持っている前提で phase2g は REVOKE→列GRANT の2段構成にしている）。
--   * 手順3 が「機微8列を返す」＝穴あり（phase2g 適用が必要）。
--   * phase2g 適用後に手順3 を再実行し「0 行」になれば成功。
--   * 適用後の手順1 は許可6列
--     （name / contact_person / contact_email / phone / onboarding_completed / updated_at）のみになるはず。
--     ここに想定外の列があれば、その列を使う正規フローが壊れないか確認してから判断する。
-- ============================================================================
