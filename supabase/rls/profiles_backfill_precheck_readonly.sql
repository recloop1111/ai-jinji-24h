-- ============================================================================
-- profiles_backfill_precheck_readonly.sql
--   profiles backfill の事前診断（READ-ONLY・SELECT のみ）。
--
-- 【重要】
--   * これは MIGRATION ではない。手動実行専用。読み取り専用（INSERT/UPDATE/DELETE 無し）。
--   * 本番DB / Preview DB で安全に実行してよい（状態を変えない）。
--   * 目的: 認証は profiles.company_id / profiles.role を参照する（lib/api/auth.ts）。
--     既存の company / admin アカウントが profiles に未登録（または company_id/role が NULL）だと
--     ログイン後 403 になる。backfill が必要かを実行前に判定する。
--
-- 背景:
--   - getClientUser → profiles.company_id、getAdminUser → profiles.role を service-role で参照。
--   - 旧 company_users / admin_users はコード参照ゼロ（profiles へ完全移行済み）。
--   - repo の supabase/migrations には profiles の作成/backfill が無く、population はDB状態依存。
-- ============================================================================

-- 0) 旧テーブルの実在と列名を確認（backfill SQL を書く前に必須。スキーマが repo に無いため）
SELECT table_name, column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('profiles', 'company_users', 'admin_users')
ORDER BY table_name, ordinal_position;

-- 1) サマリ: 403 リスクのある auth ユーザー件数
--    （profiles 行が無い／company_id も role も NULL）
SELECT
  count(*)                                                                          AS total_auth_users,
  count(*) FILTER (WHERE p.id IS NULL)                                              AS missing_profile_row,
  count(*) FILTER (WHERE p.id IS NOT NULL AND p.company_id IS NULL AND p.role IS NULL) AS profile_without_mapping
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id;

-- 2) 明細: 403 になる具体的アカウント（メール・作成日）
SELECT u.id, u.email, u.created_at, p.company_id, p.role
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
WHERE p.id IS NULL
   OR (p.company_id IS NULL AND p.role IS NULL)
ORDER BY u.created_at;

-- 3) 旧 company_users にマッピングがあるのに profiles に未反映なユーザー（company 系の取りこぼし）
--    ※ company_users の列名が (user_id, company_id) である前提。手順0の結果で列名を確認して調整すること。
SELECT cu.user_id, cu.company_id, p.company_id AS profile_company_id
FROM public.company_users cu
LEFT JOIN public.profiles p ON p.id = cu.user_id
WHERE p.id IS NULL OR p.company_id IS DISTINCT FROM cu.company_id;

-- 4) 旧 admin_users にマッピングがあるのに profiles.role に未反映なユーザー（admin 系の取りこぼし）
--    ※ admin_users の列名が (user_id, role) である前提。手順0の結果で列名を確認して調整すること。
SELECT au.user_id, au.role, p.role AS profile_role
FROM public.admin_users au
LEFT JOIN public.profiles p ON p.id = au.user_id
WHERE p.id IS NULL OR p.role IS DISTINCT FROM au.role;

-- 判定:
--   手順1 の missing_profile_row / profile_without_mapping が 0 かつ手順3/4 が 0 行 → backfill 不要。
--   いずれかが残る → profiles_backfill.sql（要・承認）で backfill が必要。
--   ※ 手順3/4 で「company_users / admin_users が存在しない」エラーになる場合は、
--     既に旧テーブルが廃棄済み＝profiles のみが真実なので、手順1/2 の結果だけで判定する。
