-- =============================================================================
-- Migration（準備のみ・まだ適用しない）: ip_blocks の table 権限 hardening
-- 日付: 2026-06-23
--
-- 背景:
--   ip-block 系 API（/api/admin/security/ip-blocks, ip-block, ip-block/[id]）は
--   従来 authenticated（管理者 cookie）サーバークライアント依存だったため、
--   ログインスロットル migration（20260622）では ip_blocks の権限変更を見送った。
--   本コミットで上記 API を service_role 境界（createServiceRoleClient）へ移行済みのため、
--   anon/authenticated/public の table 権限を剥奪しても管理機能は壊れない。
--
-- 適用条件（このファイルを実行する前に必ず確認）:
--   1. ip-block 系 API が service_role 経由で動作することを本番デプロイで確認済みであること。
--   2. ip_blocks をブラウザ（anon/authenticated）から直接読む箇所が無いこと（現状なし）。
--   → 確認後に Supabase SQL Editor で本ブロックを実行する。
--
-- 注意: 既存データは変更しない。RLS は既に有効。SELECT/INSERT/UPDATE/DELETE は service_role のみ。
-- =============================================================================

begin;

alter table public.ip_blocks enable row level security;

revoke all on public.ip_blocks from public, anon, authenticated, service_role;

grant select, insert, update, delete on public.ip_blocks to service_role;

commit;

-- 適用後確認（READ-ONLY）:
--   select grantee, string_agg(privilege_type, ', ' order by privilege_type)
--   from information_schema.role_table_grants
--   where table_schema='public' and table_name='ip_blocks'
--     and grantee in ('anon','authenticated','PUBLIC','service_role')
--   group by grantee;
--   → anon/authenticated/PUBLIC は 0 行、service_role に DELETE,INSERT,SELECT,UPDATE のみ。
