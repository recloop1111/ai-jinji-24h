-- =============================================================================
-- Migration: ログイン スロットルを「CAPTCHA後の失敗記録」方式へ切替（関数追加）
-- 日付: 2026-06-24
--
-- 背景: 旧 auth_throttle_reserve_attempt は CAPTCHA 検証前に失敗回数を加算するため、
--   Supabase ネイティブ CAPTCHA 方式（captchaToken を signInWithPassword に渡す）では使わない。
--   新フローは「事前 check（副作用なし）→ 認証 → 認証失敗/role mismatch 時のみ record_failure」。
--
-- 本 migration で追加:
--   A. auth_throttle_check          … 副作用なしのブロック判定（failure_count を変更しない）
--   B. auth_throttle_record_failure … CAPTCHA成功後の失敗時に account/IP を原子的に加算
-- 既存維持（再作成しない）: auth_throttle_record_success / admin_unlock / list_blocked_accounts。
-- 互換のため auth_throttle_reserve_attempt は削除しない（新フローからは呼ばない）。
--
-- 閾値（既存と同一）: account=30分窓で10回 / IP=10分窓で60回 → 30分ブロック。
-- 生email/IP は保存せず scope_key(HMAC) のみ。SECURITY DEFINER / search_path='' / service_role のみ EXECUTE。
-- トランザクション: BEGIN;..COMMIT;。MIGRATION BODY は dry-run と byte-identical（begin/commit は body 外）。
-- =============================================================================

begin;

-- >>> MIGRATION BODY START (auth_throttle_check_record_failure) -- KEEP BYTE-IDENTICAL WITH DRY-RUN
-- -----------------------------------------------------------------------------
-- A) auth_throttle_check: 副作用なしのブロック判定（account → ip の順で評価）。
-- -----------------------------------------------------------------------------
create or replace function public.auth_throttle_check(
  p_portal text,
  p_account_scope_key text,
  p_ip_scope_key text
)
returns table (
  account_blocked boolean,
  ip_blocked boolean,
  blocked_until timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  with a as (
    select t.blocked_until
    from public.auth_login_throttles t
    where t.portal_type = p_portal
      and t.scope_type = 'account'
      and t.scope_key = p_account_scope_key
  ),
  i as (
    select t.blocked_until
    from public.auth_login_throttles t
    where t.portal_type = p_portal
      and t.scope_type = 'ip'
      and t.scope_key = p_ip_scope_key
  )
  select
    coalesce((select blocked_until from a) > now(), false) as account_blocked,
    coalesce((select blocked_until from i) > now(), false) as ip_blocked,
    greatest((select blocked_until from a), (select blocked_until from i)) as blocked_until;
$$;

-- -----------------------------------------------------------------------------
-- B) auth_throttle_record_failure: account/IP を原子的に加算。固定順 account → ip でロック。
--    blocked 中は increment も延長もしない（auth_user_id の補完のみ）。閾値到達で +30分。
-- -----------------------------------------------------------------------------
create or replace function public.auth_throttle_record_failure(
  p_portal text,
  p_account_scope_key text,
  p_ip_scope_key text,
  p_auth_user_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  c_acc_threshold constant integer  := 10;
  c_acc_window    constant interval := interval '30 minutes';
  c_acc_block     constant interval := interval '30 minutes';
  c_ip_threshold  constant integer  := 60;
  c_ip_window     constant interval := interval '10 minutes';
  c_ip_block      constant interval := interval '30 minutes';
  v_now timestamptz := now();
  v_count integer; v_win timestamptz; v_block timestamptz; v_uid uuid;
begin
  -- ===== account =====
  insert into public.auth_login_throttles (portal_type, scope_type, scope_key, auth_user_id, failure_count, created_at, updated_at)
    values (p_portal, 'account', p_account_scope_key, p_auth_user_id, 0, v_now, v_now)
    on conflict (portal_type, scope_type, scope_key) do nothing;

  select t.failure_count, t.window_started_at, t.blocked_until, t.auth_user_id
    into v_count, v_win, v_block, v_uid
  from public.auth_login_throttles t
  where t.portal_type = p_portal and t.scope_type = 'account' and t.scope_key = p_account_scope_key
  for update;

  if v_block is not null and v_block > v_now then
    -- ブロック中: 期限延長しない・カウント据え置き（auth_user_id のみ補完）
    update public.auth_login_throttles
      set auth_user_id = coalesce(v_uid, p_auth_user_id), updated_at = v_now
    where portal_type = p_portal and scope_type = 'account' and scope_key = p_account_scope_key;
  else
    if v_win is null or (v_now - v_win) > c_acc_window or (v_block is not null and v_block <= v_now) then
      v_count := 1; v_win := v_now;
    else
      v_count := v_count + 1;
    end if;
    update public.auth_login_throttles
      set failure_count = v_count,
          window_started_at = v_win,
          last_attempt_at = v_now,
          blocked_until = case when v_count >= c_acc_threshold then v_now + c_acc_block else null end,
          auth_user_id = coalesce(v_uid, p_auth_user_id),
          updated_at = v_now
    where portal_type = p_portal and scope_type = 'account' and scope_key = p_account_scope_key;
  end if;

  -- ===== ip =====
  insert into public.auth_login_throttles (portal_type, scope_type, scope_key, auth_user_id, failure_count, created_at, updated_at)
    values (p_portal, 'ip', p_ip_scope_key, null, 0, v_now, v_now)
    on conflict (portal_type, scope_type, scope_key) do nothing;

  select t.failure_count, t.window_started_at, t.blocked_until
    into v_count, v_win, v_block
  from public.auth_login_throttles t
  where t.portal_type = p_portal and t.scope_type = 'ip' and t.scope_key = p_ip_scope_key
  for update;

  if v_block is not null and v_block > v_now then
    -- ブロック中: 期限延長しない・カウント据え置き
    update public.auth_login_throttles
      set updated_at = v_now
    where portal_type = p_portal and scope_type = 'ip' and scope_key = p_ip_scope_key;
  else
    if v_win is null or (v_now - v_win) > c_ip_window or (v_block is not null and v_block <= v_now) then
      v_count := 1; v_win := v_now;
    else
      v_count := v_count + 1;
    end if;
    update public.auth_login_throttles
      set failure_count = v_count,
          window_started_at = v_win,
          last_attempt_at = v_now,
          blocked_until = case when v_count >= c_ip_threshold then v_now + c_ip_block else null end,
          updated_at = v_now
    where portal_type = p_portal and scope_type = 'ip' and scope_key = p_ip_scope_key;
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- function privilege（anon/authenticated/public は EXECUTE 不可、service_role のみ）
-- -----------------------------------------------------------------------------
revoke all on function public.auth_throttle_check(text, text, text)                       from public, anon, authenticated;
revoke all on function public.auth_throttle_record_failure(text, text, text, uuid)         from public, anon, authenticated;

grant execute on function public.auth_throttle_check(text, text, text)                     to service_role;
grant execute on function public.auth_throttle_record_failure(text, text, text, uuid)      to service_role;
-- <<< MIGRATION BODY END (auth_throttle_check_record_failure)

commit;

-- =============================================================================
-- 補足:
--   - 新ログイン処理（lib/auth/login-handler.ts）は throttleCheck → signInWithPassword({captchaToken})
--     → 失敗時のみ recordFailure を呼ぶ。reserve_attempt は呼ばない。
--   - account 成功時リセットは既存 auth_throttle_record_success を使用（IP は維持）。
-- =============================================================================
