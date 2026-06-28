-- =============================================================================
-- Migration: ログイン多層防御（アカウント/IP スロットル）
-- 日付: 2026-06-22
--
-- 設計（確定）:
--   * scope_key は アプリサーバー側 で env AUTH_LOGIN_THROTTLE_SECRET を用いた HMAC-SHA256(64hex)。
--     DB は生成済み scope_key だけ受け取る（DB内に秘密鍵/ハッシュ関数を持たない）。生PIIは保存しない。
--   * 本人特定は account 行の auth_user_id（profiles FK）から権限付きサーバーで解決。IP scope は NULL。
--     別の非NULL ID 上書きは不可。portal と profile 種別を検証。
--   * 事前判定＋試行予約を単一原子的 function に統合（fail closed）。account 30分/10回・ip 10分/60回。
--     10/60回目自体は許可、超過の次回から拒否。blocked 中の再試行で期限を延長しない。cron 不要。
--   * last_attempt_at は試行時刻（成否ではない）。成否は login_attempts のみ。admin/client は portal で分離。
--   * 手動解除は account 既存行のみ UPDATE（新規行を作らない）。解除者を検証。
--   * 権限: auth_login_throttles は直接 table 権限を誰にも付与しない（function 経由のみ）。
--     login_attempts は service_role に SELECT/INSERT のみ。ip_blocks は本 migration で変更しない。
--
-- トランザクション: BEGIN;..COMMIT;（途中失敗時は全変更を確定しない）。
--   MIGRATION BODY 部分は §2 予行（dryrun.sql）と byte-identical（begin/commit は body 外）。
-- =============================================================================

begin;

-- >>> MIGRATION BODY START (auth_login_throttle) -- KEEP BYTE-IDENTICAL WITH DRY-RUN §2

create table if not exists public.auth_login_throttles (
  id uuid primary key default gen_random_uuid(),
  portal_type text not null,
  scope_type text not null,
  scope_key text not null,
  auth_user_id uuid references public.profiles(id) on delete set null,
  failure_count integer not null default 0,
  window_started_at timestamptz,
  last_attempt_at timestamptz,
  blocked_until timestamptz,
  last_unlocked_at timestamptz,
  last_unlocked_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint auth_login_throttles_portal_chk
    check (portal_type in ('admin','client')),
  constraint auth_login_throttles_scope_chk
    check (scope_type in ('account','ip')),
  constraint auth_login_throttles_count_chk
    check (failure_count >= 0),
  constraint auth_login_throttles_scope_key_chk
    check (scope_key ~ '^[0-9a-f]{64}$'),
  constraint auth_login_throttles_authuser_chk
    check (scope_type = 'account' or auth_user_id is null),
  constraint auth_login_throttles_uniq
    unique (portal_type, scope_type, scope_key)
);

comment on table public.auth_login_throttles is
  'ログイン スロットル状態（account/ip × portal）。更新は原子的 function 経由のみ。scope_key はアプリ側HMAC-SHA256(64hex)。auth_user_id は account のみ・本人特定用。生PII・秘密鍵は保存しない。last_attempt_at は試行時刻で成否ではない（成否は login_attempts）。';

create index if not exists idx_auth_login_throttles_blocked
  on public.auth_login_throttles
    (portal_type, scope_type, blocked_until);

create index if not exists idx_auth_login_throttles_last_attempt
  on public.auth_login_throttles (last_attempt_at);

create or replace function public.auth_throttle_reserve_attempt(
  p_portal text,
  p_account_scope_key text,
  p_ip_scope_key text,
  p_auth_user_id uuid default null
)
returns table (
  allowed boolean,
  reason text,
  blocked_until timestamptz,
  account_failure_count integer,
  ip_failure_count integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  c_acc_threshold constant integer := 10;
  c_acc_window constant interval := interval '30 minutes';
  c_acc_block constant interval := interval '30 minutes';
  c_ip_threshold constant integer := 60;
  c_ip_window constant interval := interval '10 minutes';
  c_ip_block constant interval := interval '30 minutes';
  v_now timestamptz := now();
  v_acc_count integer;
  v_acc_win timestamptz;
  v_acc_block timestamptz;
  v_acc_newblock timestamptz;
  v_acc_uid uuid;
  v_ip_count integer;
  v_ip_win timestamptz;
  v_ip_block timestamptz;
  v_ip_newblock timestamptz;
begin
  if p_auth_user_id is not null then
    if p_portal = 'admin' then
      if not exists (
        select 1
        from public.profiles
        where id = p_auth_user_id
          and role in ('admin','super_admin')
      ) then
        raise exception
          'reserve: auth_user_id % is not an admin/super_admin profile (admin portal)',
          p_auth_user_id;
      end if;
    elsif p_portal = 'client' then
      if not exists (
        select 1
        from public.profiles
        where id = p_auth_user_id
          and company_id is not null
      ) then
        raise exception
          'reserve: auth_user_id % is not a company profile (client portal)',
          p_auth_user_id;
      end if;
    end if;
  end if;

  insert into public.auth_login_throttles (
    portal_type,
    scope_type,
    scope_key,
    auth_user_id,
    failure_count,
    created_at,
    updated_at
  )
  values (
    p_portal,
    'account',
    p_account_scope_key,
    p_auth_user_id,
    0,
    v_now,
    v_now
  )
  on conflict (portal_type, scope_type, scope_key) do nothing;

  insert into public.auth_login_throttles (
    portal_type,
    scope_type,
    scope_key,
    auth_user_id,
    failure_count,
    created_at,
    updated_at
  )
  values (
    p_portal,
    'ip',
    p_ip_scope_key,
    null,
    0,
    v_now,
    v_now
  )
  on conflict (portal_type, scope_type, scope_key) do nothing;

  select
    t.failure_count,
    t.window_started_at,
    t.blocked_until,
    t.auth_user_id
  into
    v_acc_count,
    v_acc_win,
    v_acc_block,
    v_acc_uid
  from public.auth_login_throttles t
  where t.portal_type = p_portal
    and t.scope_type = 'account'
    and t.scope_key = p_account_scope_key
  for update;

  select
    t.failure_count,
    t.window_started_at,
    t.blocked_until
  into
    v_ip_count,
    v_ip_win,
    v_ip_block
  from public.auth_login_throttles t
  where t.portal_type = p_portal
    and t.scope_type = 'ip'
    and t.scope_key = p_ip_scope_key
  for update;

  if p_auth_user_id is not null
     and v_acc_uid is not null
     and v_acc_uid <> p_auth_user_id then
    raise exception
      'reserve: auth_user_id mismatch for account scope (existing=%, given=%)',
      v_acc_uid,
      p_auth_user_id;
  end if;

  if v_acc_block is not null and v_acc_block > v_now then
    return query
    select false, 'account_blocked', v_acc_block,
           v_acc_count, v_ip_count;
    return;
  end if;

  if v_ip_block is not null and v_ip_block > v_now then
    return query
    select false, 'ip_blocked', v_ip_block,
           v_acc_count, v_ip_count;
    return;
  end if;

  if v_acc_win is null
     or (v_now - v_acc_win) > c_acc_window
     or (v_acc_block is not null and v_acc_block <= v_now) then
    v_acc_count := 1;
    v_acc_win := v_now;
  else
    v_acc_count := v_acc_count + 1;
  end if;

  v_acc_newblock :=
    case
      when v_acc_count >= c_acc_threshold
      then v_now + c_acc_block
      else null
    end;

  update public.auth_login_throttles
  set failure_count = v_acc_count,
      window_started_at = v_acc_win,
      last_attempt_at = v_now,
      blocked_until = v_acc_newblock,
      auth_user_id = coalesce(v_acc_uid, p_auth_user_id),
      updated_at = v_now
  where portal_type = p_portal
    and scope_type = 'account'
    and scope_key = p_account_scope_key;

  if v_ip_win is null
     or (v_now - v_ip_win) > c_ip_window
     or (v_ip_block is not null and v_ip_block <= v_now) then
    v_ip_count := 1;
    v_ip_win := v_now;
  else
    v_ip_count := v_ip_count + 1;
  end if;

  v_ip_newblock :=
    case
      when v_ip_count >= c_ip_threshold
      then v_now + c_ip_block
      else null
    end;

  update public.auth_login_throttles
  set failure_count = v_ip_count,
      window_started_at = v_ip_win,
      last_attempt_at = v_now,
      blocked_until = v_ip_newblock,
      updated_at = v_now
  where portal_type = p_portal
    and scope_type = 'ip'
    and scope_key = p_ip_scope_key;

  return query
  select true, 'allowed', null::timestamptz,
         v_acc_count, v_ip_count;
end;
$$;

create or replace function public.auth_throttle_record_success(
  p_portal text,
  p_account_scope_key text
)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.auth_login_throttles
  set failure_count = 0,
      window_started_at = null,
      blocked_until = null,
      updated_at = now()
  where portal_type = p_portal
    and scope_type = 'account'
    and scope_key = p_account_scope_key;
$$;

create or replace function public.auth_throttle_admin_unlock(
  p_portal text,
  p_account_scope_key text,
  p_admin_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := now();
  v_fc integer;
  v_blocked timestamptz;
begin
  if p_admin_id is null then
    raise exception
      'admin unlock requires a non-null admin id';
  end if;

  if not exists (
    select 1
    from public.profiles
    where id = p_admin_id
      and role in ('admin','super_admin')
  ) then
    raise exception
      'admin unlock denied: % is not an admin/super_admin profile',
      p_admin_id;
  end if;

  select failure_count, blocked_until
  into v_fc, v_blocked
  from public.auth_login_throttles
  where portal_type = p_portal
    and scope_type = 'account'
    and scope_key = p_account_scope_key
  for update;

  if not found then
    raise exception
      'admin unlock: no account throttle row for the given scope_key';
  end if;

  if (v_blocked is not null and v_blocked > v_now)
     or v_fc > 0 then
    update public.auth_login_throttles
    set failure_count = 0,
        window_started_at = null,
        blocked_until = null,
        last_unlocked_at = v_now,
        last_unlocked_by = p_admin_id,
        updated_at = v_now
    where portal_type = p_portal
      and scope_type = 'account'
      and scope_key = p_account_scope_key;

    return true;
  end if;

  return false;
end;
$$;

create or replace function public.auth_throttle_list_blocked_accounts(
  p_portal text default null
)
returns table (
  portal_type text,
  scope_key text,
  auth_user_id uuid,
  failure_count integer,
  blocked_until timestamptz,
  last_attempt_at timestamptz,
  last_unlocked_at timestamptz,
  last_unlocked_by uuid
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    t.portal_type,
    t.scope_key,
    t.auth_user_id,
    t.failure_count,
    t.blocked_until,
    t.last_attempt_at,
    t.last_unlocked_at,
    t.last_unlocked_by
  from public.auth_login_throttles t
  where t.scope_type = 'account'
    and t.blocked_until is not null
    and t.blocked_until > now()
    and (p_portal is null or t.portal_type = p_portal)
  order by t.blocked_until desc;
$$;

alter table public.auth_login_throttles enable row level security;

revoke all on public.auth_login_throttles
  from public, anon, authenticated, service_role;

comment on table public.login_attempts is
  '実ログイン試行の監査ログ。success / auth_failed / role_mismatch / rate_limited を区別。'
  '予約処理自体は記録しない。パスワード・Turnstile token・HMAC秘密鍵は保存しない。'
  'PII(email/ip_address)保持は90日方針（自動削除は今回未実装・pg_cron不使用＝運用 or 後続タスク）。';

comment on column public.login_attempts.failure_reason is
  'success時 null。失敗時 auth_failed | role_mismatch | rate_limited。';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'login_attempts_reason_chk'
      and conrelid = 'public.login_attempts'::regclass
  ) then
    alter table public.login_attempts
      add constraint login_attempts_reason_chk
      check (
        (success = true and failure_reason is null)
        or (
          success = false
          and failure_reason in (
            'auth_failed',
            'role_mismatch',
            'rate_limited'
          )
        )
      );
  end if;
end
$$;

create index if not exists idx_login_attempts_user_email_created
  on public.login_attempts
    (user_type, email, created_at desc);

create index if not exists idx_login_attempts_user_ip_created
  on public.login_attempts
    (user_type, ip_address, created_at desc);

alter table public.login_attempts enable row level security;

revoke all on public.login_attempts
  from public, anon, authenticated, service_role;

grant select, insert on public.login_attempts
  to service_role;

revoke all on function
  public.auth_throttle_reserve_attempt(text, text, text, uuid)
  from public, anon, authenticated;

revoke all on function
  public.auth_throttle_record_success(text, text)
  from public, anon, authenticated;

revoke all on function
  public.auth_throttle_admin_unlock(text, text, uuid)
  from public, anon, authenticated;

revoke all on function
  public.auth_throttle_list_blocked_accounts(text)
  from public, anon, authenticated;

grant execute on function
  public.auth_throttle_reserve_attempt(text, text, text, uuid)
  to service_role;

grant execute on function
  public.auth_throttle_record_success(text, text)
  to service_role;

grant execute on function
  public.auth_throttle_admin_unlock(text, text, uuid)
  to service_role;

grant execute on function
  public.auth_throttle_list_blocked_accounts(text)
  to service_role;

-- <<< MIGRATION BODY END (auth_login_throttle)

commit;

-- =============================================================================
-- 補足（アプリ側・このファイルには秘密鍵を含めない）:
--   scope_key 生成（サーバのみ）:
--     account: hex( hmac_sha256( AUTH_LOGIN_THROTTLE_SECRET, 'account:'||portal||':'||normalized_email ) )
--     ip     : hex( hmac_sha256( AUTH_LOGIN_THROTTLE_SECRET, 'ip:'||portal||':'||client_ip ) )
--   p_auth_user_id: 実在ユーザーを特定できた場合のみ profiles.id を渡す（無効メールは NULL）。
--   AUTH_LOGIN_THROTTLE_SECRET 未設定時はサーバが fail closed（ログイン不可）。
--
-- 適用前の阻害事項（別タスク）: ip_blocks を hardening する前に ip-block 系 API
--   （ip-blocks, ip-block, ip-block/[id], locked-accounts, unlock/[id]）を
--   createAdminServerClient（authenticated）から createServiceRoleClient へ移すこと。
-- =============================================================================
