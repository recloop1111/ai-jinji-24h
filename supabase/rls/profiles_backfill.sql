-- ============================================================================
-- profiles_backfill.sql
--   旧 company_users / admin_users のマッピングを profiles.company_id / profiles.role へ backfill する案。
--
-- 【重要】
--   * MIGRATION ではない。手動実行専用。本ファイルは未実行・**承認待ち**。
--   * 実行前に必ず profiles_backfill_precheck_readonly.sql を流し、
--     (a) backfill が必要か (b) company_users/admin_users の実在と列名 を確認すること。
--   * 旧テーブルが既に廃棄されている場合、本ファイルは実行不要（その場合は手動で profiles を補完）。
--   * 列名（user_id / company_id / role）は環境依存。precheck 手順0 の結果に合わせて必ず調整すること。
--   * 破壊的更新を避けるため、既存の非NULL値は上書きしない（COALESCE / WHERE で保護）。
-- ============================================================================

BEGIN;

-- 1) company ユーザーの backfill（company_users → profiles.company_id）
--    profiles 行が無ければ作成、あれば company_id が未設定のときだけ補完（既存値は壊さない）。
INSERT INTO public.profiles (id, company_id)
SELECT cu.user_id, cu.company_id
FROM public.company_users cu
WHERE cu.user_id IS NOT NULL AND cu.company_id IS NOT NULL
ON CONFLICT (id) DO UPDATE
  SET company_id = COALESCE(public.profiles.company_id, EXCLUDED.company_id);

-- 2) admin ユーザーの backfill（admin_users → profiles.role）
--    profiles 行が無ければ作成、あれば role が未設定のときだけ補完。
INSERT INTO public.profiles (id, role)
SELECT au.user_id, au.role
FROM public.admin_users au
WHERE au.user_id IS NOT NULL AND au.role IS NOT NULL
ON CONFLICT (id) DO UPDATE
  SET role = COALESCE(public.profiles.role, EXCLUDED.role);

-- 反映行数を目視確認してから COMMIT すること（問題あれば ROLLBACK）。
COMMIT;

-- ============================================================================
-- 適用後の検証（READ-ONLY）:
--   SELECT count(*) FILTER (WHERE p.id IS NULL) AS still_missing,
--          count(*) FILTER (WHERE p.id IS NOT NULL AND p.company_id IS NULL AND p.role IS NULL) AS still_unmapped
--   FROM auth.users u LEFT JOIN public.profiles p ON p.id = u.id;
--   -- 期待: still_missing = 0 / still_unmapped = 0
-- ============================================================================

-- ----------------------------------------------------------------------------
-- ROLLBACK 案（backfill で「新規作成 or 補完」した分のみ戻す。手動実行・承認待ち）
--   ※ 完全な逆操作は履歴が無いと特定困難なため、安全策として
--     「precheck で事前に対象 user_id 一覧を控える」→「その一覧だけ NULL 化/削除」する運用を推奨。
--   例（company_id を backfill した分だけ戻す。事前に控えた user_id 一覧 :ids を使用）:
--     UPDATE public.profiles SET company_id = NULL WHERE id = ANY(:ids) AND company_id = :backfilled_company_id;
--   例（backfill で新規作成した profiles 行を削除する場合・他属性が無い行に限る）:
--     DELETE FROM public.profiles WHERE id = ANY(:ids) AND company_id IS NULL AND role IS NULL;
-- ----------------------------------------------------------------------------
