-- =============================================================================
-- §2 予行（DRY-RUN / リハーサル）: ログイン スロットル migration の動作確認
-- 日付: 2026-06-22
-- 本番 migration（20260622_auth_login_throttle.sql）の MIGRATION BODY を byte-identical で
-- 取り込み、BEGIN..ROLLBACK で本番に残さず検証する。末尾 ROLLBACK で何も永続化されない。
-- 一致確認: sed -n '/^-- >>> MIGRATION BODY START/,/^-- <<< MIGRATION BODY END/p' を両ファイルで diff。
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

do $$
declare
  v_allowed boolean;
  v_reason text;
  v_blk timestamptz;
  v_blk2 timestamptz;
  i integer;
  v_cnt integer;
  v_fc integer;
  v_win timestamptz;
  v_blkx timestamptz;
  v_admin uuid;
  v_admin2 uuid;
  v_company uuid;
  v_unlock_by uuid;
  v_ts1 timestamptz;
  v_uid_acc uuid;
  v_uid_ip uuid;
  v_ts_attempt timestamptz;
  v_bool boolean;
  v_ok boolean;
  v_unlocked boolean;
  n_la0 bigint;
  n_ib0 bigint;
  n_la1 bigint;
  n_ib1 bigint;
  kk integer;
  v_secdef boolean;
  v_has_sp boolean;
  v_idargs text;

  fn_names text[] := array[
    'auth_throttle_reserve_attempt',
    'auth_throttle_record_success',
    'auth_throttle_admin_unlock',
    'auth_throttle_list_blocked_accounts'
  ];

  fn_args text[] := array[
    'p_portal text, p_account_scope_key text, p_ip_scope_key text, p_auth_user_id uuid',
    'p_portal text, p_account_scope_key text',
    'p_portal text, p_account_scope_key text, p_admin_id uuid',
    'p_portal text'
  ];

  k_acc constant text :=
    md5('dryrun-acct-1') || md5('dryrun-acct-1');
  k_acc2 constant text :=
    md5('dryrun-acct-2') || md5('dryrun-acct-2');
  k_acc3 constant text :=
    md5('dryrun-acct-3') || md5('dryrun-acct-3');
  k_acc4 constant text :=
    md5('dryrun-acct-4') || md5('dryrun-acct-4');
  k_ip constant text :=
    md5('dryrun-ip-1') || md5('dryrun-ip-1');
  k_ip2 constant text :=
    md5('dryrun-ip-2') || md5('dryrun-ip-2');
  k_ip3 constant text :=
    md5('dryrun-ip-3') || md5('dryrun-ip-3');
  k_ip4 constant text :=
    md5('dryrun-ip-4') || md5('dryrun-ip-4');
  k_ipflood constant text :=
    md5('dryrun-ipflood') || md5('dryrun-ipflood');
  k_none constant text :=
    md5('dryrun-none') || md5('dryrun-none');
  k_xadm constant text :=
    md5('dryrun-xadm') || md5('dryrun-xadm');
  k_xip constant text :=
    md5('dryrun-xadm-ip') || md5('dryrun-xadm-ip');
  k_zadm constant text :=
    md5('dryrun-zadm') || md5('dryrun-zadm');
  k_zip constant text :=
    md5('dryrun-zadm-ip') || md5('dryrun-zadm-ip');
begin
  select count(*) into n_la0
  from public.login_attempts;

  select count(*) into n_ib0
  from public.ip_blocks;

  select id into v_admin
  from public.profiles
  where role in ('admin','super_admin')
  order by id
  limit 1;

  select id into v_admin2
  from public.profiles
  where role in ('admin','super_admin')
    and id <> v_admin
  order by id
  limit 1;

  select id into v_company
  from public.profiles
  where role = 'company'
    and company_id is not null
  limit 1;

  if v_admin is null then
    raise exception
      'PREREQ: admin/super_admin profile が必要';
  end if;

  if v_company is null then
    raise exception
      'PREREQ: client portal 検証用に company profile が必要';
  end if;

  begin
    insert into public.auth_login_throttles (
      portal_type,
      scope_type,
      scope_key
    )
    values (
      'client',
      'account',
      'NOT_A_VALID_HEX'
    );

    raise exception
      'FAIL(A): scope_key CHECK should reject non-64hex';
  exception
    when check_violation then
      raise notice
        'OK(A): scope_key 64hex CHECK enforced';
  end;

  for i in 1..10 loop
    select allowed
    into v_allowed
    from public.auth_throttle_reserve_attempt(
      'client',
      k_acc,
      k_ip
    );

    if not v_allowed then
      raise exception
        'FAIL(B): account attempt % must be allowed',
        i;
    end if;
  end loop;

  raise notice
    'OK(B): account attempts 1..10 allowed';

  select allowed, reason, blocked_until
  into v_allowed, v_reason, v_blk
  from public.auth_throttle_reserve_attempt(
    'client',
    k_acc,
    k_ip
  );

  if v_allowed or v_reason <> 'account_blocked' then
    raise exception
      'FAIL(C): 11th account attempt must be rejected (account_blocked)';
  end if;

  raise notice
    'OK(C): 11th account attempt rejected';

  select blocked_until
  into v_blk2
  from public.auth_throttle_reserve_attempt(
    'client',
    k_acc,
    k_ip
  );

  if v_blk2 is distinct from v_blk then
    raise exception
      'FAIL(D): blocked_until must not be extended on retry (was %, now %)',
      v_blk,
      v_blk2;
  end if;

  raise notice
    'OK(D): blocked_until not extended during block';

  for i in 1..10 loop
    perform public.auth_throttle_reserve_attempt(
      'client',
      k_acc2,
      k_ip2
    );
  end loop;

  perform public.auth_throttle_record_success(
    'client',
    k_acc2
  );

  select failure_count, window_started_at, blocked_until
  into v_fc, v_win, v_blkx
  from public.auth_login_throttles
  where portal_type = 'client'
    and scope_type = 'account'
    and scope_key = k_acc2;

  if v_fc <> 0
     or v_win is not null
     or v_blkx is not null then
    raise exception
      'FAIL(N): success-reset state incorrect (count=%, win=%, blocked=%)',
      v_fc,
      v_win,
      v_blkx;
  end if;

  select allowed
  into v_allowed
  from public.auth_throttle_reserve_attempt(
    'client',
    k_acc2,
    k_ip2
  );

  if not v_allowed then
    raise exception
      'FAIL(E): after success-reset, account must be allowed immediately';
  end if;

  raise notice
    'OK(E/N): success resets account state → immediate retry allowed';

  for i in 1..60 loop
    select allowed
    into v_allowed
    from public.auth_throttle_reserve_attempt(
      'admin',
      md5('flood-acct-' || i) ||
        md5('flood-acct-' || i),
      k_ipflood
    );

    if not v_allowed then
      raise exception
        'FAIL(F): ip attempt % must be allowed',
        i;
    end if;
  end loop;

  raise notice
    'OK(F): ip attempts 1..60 allowed';

  select allowed, reason
  into v_allowed, v_reason
  from public.auth_throttle_reserve_attempt(
    'admin',
    md5('flood-acct-61') ||
      md5('flood-acct-61'),
    k_ipflood
  );

  if v_allowed or v_reason <> 'ip_blocked' then
    raise exception
      'FAIL(G): 61st ip attempt must be rejected (ip_blocked)';
  end if;

  raise notice
    'OK(G): 61st ip attempt rejected';

  select allowed
  into v_allowed
  from public.auth_throttle_reserve_attempt(
    'client',
    md5('probe') || md5('probe'),
    k_ipflood
  );

  if not v_allowed then
    raise exception
      'FAIL(H): client portal must be independent from admin ip count';
  end if;

  raise notice
    'OK(H): admin/client portals are independent';

  for i in 1..10 loop
    perform public.auth_throttle_reserve_attempt(
      'client',
      k_acc,
      k_ip
    );
  end loop;

  select count(*) into n_la1
  from public.login_attempts;

  select public.auth_throttle_admin_unlock(
    'client',
    k_acc,
    v_admin
  )
  into v_unlocked;

  if not v_unlocked then
    raise exception
      'FAIL(I-0): unlock of blocked account must return true';
  end if;

  if (
    select count(*)
    from public.login_attempts
  ) <> n_la1 then
    raise exception
      'FAIL(I-1): admin unlock must NOT write login_attempts';
  end if;

  select allowed
  into v_allowed
  from public.auth_throttle_reserve_attempt(
    'client',
    k_acc,
    k_ip
  );

  if not v_allowed then
    raise exception
      'FAIL(I-2): after admin unlock, account must be allowed immediately';
  end if;

  select last_unlocked_at, last_unlocked_by
  into v_ts1, v_unlock_by
  from public.auth_login_throttles
  where portal_type = 'client'
    and scope_type = 'account'
    and scope_key = k_acc;

  if v_ts1 is null then
    raise exception
      'FAIL(I-3): last_unlocked_at must be recorded';
  end if;

  if v_unlock_by is distinct from v_admin then
    raise exception
      'FAIL(I-4): last_unlocked_by must match unlocker';
  end if;

  raise notice
    'OK(I): admin unlock → immediate allow, no login_attempts row, unlocker recorded';

  select count(*)
  into v_cnt
  from public.auth_login_throttles
  where portal_type = 'client'
    and scope_type = 'account'
    and scope_key = k_acc;

  if v_cnt <> 1 then
    raise exception
      'FAIL(J): duplicate rows: %',
      v_cnt;
  end if;

  raise notice
    'OK(J): no duplicate rows (unique enforced)';

  for kk in 1..array_length(fn_names, 1) loop
    select
      p.prosecdef,
      exists (
        select 1
        from unnest(
          coalesce(p.proconfig, array[]::text[])
        ) as opt
        where opt in (
          'search_path=',
          'search_path=""'
        )
      ),
      pg_get_function_identity_arguments(p.oid)
    into
      v_secdef,
      v_has_sp,
      v_idargs
    from pg_proc p
    join pg_namespace n
      on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = fn_names[kk];

    if not found then
      raise exception
        'FAIL(K): function % missing',
        fn_names[kk];
    end if;

    if not v_secdef then
      raise exception
        'FAIL(K): % must be SECURITY DEFINER',
        fn_names[kk];
    end if;

    if not v_has_sp then
      raise exception
        'FAIL(K): % must pin empty search_path (search_path="")',
        fn_names[kk];
    end if;

    if v_idargs <> fn_args[kk] then
      raise exception
        'FAIL(K): % signature mismatch (got %)',
        fn_names[kk],
        v_idargs;
    end if;

    perform 1
    from information_schema.role_routine_grants
    where specific_schema = 'public'
      and routine_name = fn_names[kk]
      and grantee in (
        'anon',
        'authenticated',
        'PUBLIC'
      );

    if found then
      raise exception
        'FAIL(K): % must not be executable by anon/authenticated/public',
        fn_names[kk];
    end if;

    perform 1
    from information_schema.role_routine_grants
    where specific_schema = 'public'
      and routine_name = fn_names[kk]
      and grantee = 'service_role'
      and privilege_type = 'EXECUTE';

    if not found then
      raise exception
        'FAIL(K): service_role must EXECUTE %',
        fn_names[kk];
    end if;
  end loop;

  raise notice
    'OK(K): all 4 functions are DEFINER / pinned search_path / correct args / service_role-only';

  perform public.auth_throttle_reserve_attempt(
    'client',
    k_acc3,
    k_ip3,
    v_company
  );

  select auth_user_id
  into v_uid_acc
  from public.auth_login_throttles
  where portal_type = 'client'
    and scope_type = 'account'
    and scope_key = k_acc3;

  if v_uid_acc is distinct from v_company then
    raise exception
      'FAIL(L-1): account auth_user_id must be saved (company)';
  end if;

  perform public.auth_throttle_reserve_attempt(
    'client',
    k_acc3,
    k_ip3,
    null
  );

  select auth_user_id
  into v_uid_acc
  from public.auth_login_throttles
  where portal_type = 'client'
    and scope_type = 'account'
    and scope_key = k_acc3;

  if v_uid_acc is distinct from v_company then
    raise exception
      'FAIL(L-2): null must not overwrite existing auth_user_id';
  end if;

  select auth_user_id
  into v_uid_ip
  from public.auth_login_throttles
  where portal_type = 'client'
    and scope_type = 'ip'
    and scope_key = k_ip3;

  if v_uid_ip is not null then
    raise exception
      'FAIL(L-3): ip auth_user_id must be null';
  end if;

  raise notice
    'OK(L): client+company auth_user_id saved, not overwritten by null, null on ip';

  select last_attempt_at
  into v_ts_attempt
  from public.auth_login_throttles
  where portal_type = 'client'
    and scope_type = 'account'
    and scope_key = k_acc3;

  if v_ts_attempt is null then
    raise exception
      'FAIL(M): last_attempt_at must be set on reserve';
  end if;

  raise notice
    'OK(M): last_attempt_at updated on reserve';

  if v_admin2 is not null then
    perform public.auth_throttle_reserve_attempt(
      'admin',
      k_xadm,
      k_xip,
      v_admin
    );

    select failure_count
    into v_fc
    from public.auth_login_throttles
    where portal_type = 'admin'
      and scope_type = 'account'
      and scope_key = k_xadm;

    v_ok := false;

    begin
      perform public.auth_throttle_reserve_attempt(
        'admin',
        k_xadm,
        k_xip,
        v_admin2
      );
    exception
      when others then
        v_ok := true;
    end;

    if not v_ok then
      raise exception
        'FAIL(X-1): different non-null auth_user_id must be rejected';
    end if;

    select failure_count
    into v_cnt
    from public.auth_login_throttles
    where portal_type = 'admin'
      and scope_type = 'account'
      and scope_key = k_xadm;

    if v_cnt <> v_fc then
      raise exception
        'FAIL(X-2): counts must be unchanged on mismatch (% -> %)',
        v_fc,
        v_cnt;
    end if;

    select auth_user_id
    into v_uid_acc
    from public.auth_login_throttles
    where portal_type = 'admin'
      and scope_type = 'account'
      and scope_key = k_xadm;

    if v_uid_acc is distinct from v_admin then
      raise exception
        'FAIL(X-3): existing auth_user_id must be preserved';
    end if;

    raise notice
      'OK(X): different auth_user_id overwrite rejected, counts/id unchanged';
  else
    raise notice
      'SKIP(X): need 2 admin profiles';
  end if;

  v_ok := false;

  begin
    perform public.auth_throttle_reserve_attempt(
      'client',
      md5('y1') || md5('y1'),
      md5('y1i') || md5('y1i'),
      v_admin
    );
  exception
    when others then
      v_ok := true;
  end;

  if not v_ok then
    raise exception
      'FAIL(Y-1): client portal with admin id must be rejected';
  end if;

  v_ok := false;

  begin
    perform public.auth_throttle_reserve_attempt(
      'admin',
      md5('y2') || md5('y2'),
      md5('y2i') || md5('y2i'),
      v_company
    );
  exception
    when others then
      v_ok := true;
  end;

  if not v_ok then
    raise exception
      'FAIL(Y-2): admin portal with company id must be rejected';
  end if;

  raise notice
    'OK(Y): portal/profile mismatch rejected';

  perform public.auth_throttle_reserve_attempt(
    'admin',
    k_zadm,
    k_zip,
    v_admin
  );

  select auth_user_id
  into v_uid_acc
  from public.auth_login_throttles
  where portal_type = 'admin'
    and scope_type = 'account'
    and scope_key = k_zadm;

  if v_uid_acc is distinct from v_admin then
    raise exception
      'FAIL(Z): admin+admin association must save auth_user_id';
  end if;

  raise notice
    'OK(Z): admin portal + admin profile normal';

  v_ok := false;

  begin
    perform public.auth_throttle_admin_unlock(
      'client',
      k_acc3,
      null
    );
  exception
    when others then
      v_ok := true;
  end;

  if not v_ok then
    raise exception
      'FAIL(O-1): null admin id must be rejected';
  end if;

  v_ok := false;

  begin
    perform public.auth_throttle_admin_unlock(
      'client',
      k_acc3,
      '11111111-1111-1111-1111-111111111111'
    );
  exception
    when others then
      v_ok := true;
  end;

  if not v_ok then
    raise exception
      'FAIL(O-2): non-existent admin id must be rejected';
  end if;

  raise notice
    'OK(O): invalid admin id (null / non-existent) rejected';

  v_ok := false;

  begin
    perform public.auth_throttle_admin_unlock(
      'client',
      k_acc3,
      v_company
    );
  exception
    when others then
      v_ok := true;
  end;

  if not v_ok then
    raise exception
      'FAIL(P): company-role user must not unlock';
  end if;

  raise notice
    'OK(P): company-role user rejected';

  v_ok := false;

  begin
    perform public.auth_throttle_admin_unlock(
      'client',
      k_none,
      v_admin
    );
  exception
    when others then
      v_ok := true;
  end;

  if not v_ok then
    raise exception
      'FAIL(UNLOCK-1): unlock of nonexistent scope must raise';
  end if;

  select count(*)
  into v_cnt
  from public.auth_login_throttles
  where portal_type = 'client'
    and scope_type = 'account'
    and scope_key = k_none;

  if v_cnt <> 0 then
    raise exception
      'FAIL(UNLOCK-1b): unlock must not create a row (got %)',
      v_cnt;
  end if;

  raise notice
    'OK(UNLOCK-1): nonexistent scope unlock raises and creates no row';

  for i in 1..10 loop
    perform public.auth_throttle_reserve_attempt(
      'client',
      k_acc4,
      k_ip4
    );
  end loop;

  select public.auth_throttle_admin_unlock(
    'client',
    k_acc4,
    v_admin
  )
  into v_unlocked;

  if not v_unlocked then
    raise exception
      'FAIL(UNLOCK-2a): first unlock must return true';
  end if;

  select last_unlocked_at, last_unlocked_by
  into v_ts1, v_unlock_by
  from public.auth_login_throttles
  where portal_type = 'client'
    and scope_type = 'account'
    and scope_key = k_acc4;

  if v_ts1 is null
     or v_unlock_by is distinct from v_admin then
    raise exception
      'FAIL(UNLOCK-2b): meta must be set on real unlock';
  end if;

  if v_admin2 is not null then
    select public.auth_throttle_admin_unlock(
      'client',
      k_acc4,
      v_admin2
    )
    into v_unlocked;

    if v_unlocked then
      raise exception
        'FAIL(UNLOCK-2c): no-op unlock (already reset) must return false';
    end if;

    select last_unlocked_by
    into v_unlock_by
    from public.auth_login_throttles
    where portal_type = 'client'
      and scope_type = 'account'
      and scope_key = k_acc4;

    if v_unlock_by is distinct from v_admin then
      raise exception
        'FAIL(UNLOCK-2d): no-op must not change last_unlocked_by';
    end if;

    raise notice
      'OK(UNLOCK-2): unlock meta updated only on real unlock';
  else
    raise notice
      'OK(UNLOCK-2): real unlock returns true (no-op distinction skipped: need 2 admins)';
  end if;

  select c.relrowsecurity
  into v_bool
  from pg_class c
  where c.relname = 'auth_login_throttles'
    and c.relnamespace = 'public'::regnamespace;

  if not coalesce(v_bool, false) then
    raise exception
      'FAIL(Q): RLS must be enabled on auth_login_throttles';
  end if;

  raise notice
    'OK(Q): RLS enabled on auth_login_throttles';

  perform 1
  from information_schema.role_table_grants
  where table_schema = 'public'
    and table_name in (
      'auth_login_throttles',
      'login_attempts'
    )
    and grantee in (
      'anon',
      'authenticated',
      'PUBLIC'
    );

  if found then
    raise exception
      'FAIL(R): anon/authenticated/public must have no privilege on throttles/login_attempts';
  end if;

  raise notice
    'OK(R): no anon/authenticated/public privilege on throttles/login_attempts';

  perform 1
  from information_schema.role_table_grants
  where table_schema = 'public'
    and table_name = 'auth_login_throttles'
    and grantee = 'service_role';

  if found then
    raise exception
      'FAIL(S-1): auth_login_throttles must have NO direct service_role table privilege';
  end if;

  if exists (
    select 1
    from information_schema.role_table_grants
    where table_schema = 'public'
      and table_name = 'login_attempts'
      and grantee = 'service_role'
      and privilege_type in (
        'UPDATE',
        'DELETE',
        'TRUNCATE',
        'REFERENCES',
        'TRIGGER'
      )
  ) then
    raise exception
      'FAIL(S-2): login_attempts service_role must NOT have UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER';
  end if;

  perform 1
  from information_schema.role_table_grants
  where table_schema = 'public'
    and table_name = 'login_attempts'
    and grantee = 'service_role'
    and privilege_type = 'SELECT';

  if not found then
    raise exception
      'FAIL(S-3): login_attempts service_role needs SELECT';
  end if;

  perform 1
  from information_schema.role_table_grants
  where table_schema = 'public'
    and table_name = 'login_attempts'
    and grantee = 'service_role'
    and privilege_type = 'INSERT';

  if not found then
    raise exception
      'FAIL(S-4): login_attempts service_role needs INSERT';
  end if;

  raise notice
    'OK(S): throttles=no direct table priv / login_attempts=service_role SELECT,INSERT only';

  if not exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and indexname = 'auth_login_throttles_uniq'
  ) then
    raise exception
      'FAIL(T-1): unique index missing';
  end if;

  if not exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and indexname = 'idx_auth_login_throttles_blocked'
  ) then
    raise exception
      'FAIL(T-2): blocked index missing';
  end if;

  if not exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and indexname =
        'idx_login_attempts_user_email_created'
  ) then
    raise exception
      'FAIL(T-3): login_attempts (user_type,email,created_at) index missing';
  end if;

  if not exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and indexname =
        'idx_login_attempts_user_ip_created'
  ) then
    raise exception
      'FAIL(T-4): login_attempts (user_type,ip_address,created_at) index missing';
  end if;

  raise notice
    'OK(T): required indexes present';

  select count(*) into n_la1
  from public.login_attempts;

  select count(*) into n_ib1
  from public.ip_blocks;

  if n_la1 <> n_la0 then
    raise exception
      'FAIL(U-1): login_attempts count changed (% -> %)',
      n_la0,
      n_la1;
  end if;

  if n_ib1 <> n_ib0 then
    raise exception
      'FAIL(U-2): ip_blocks count changed (% -> %)',
      n_ib0,
      n_ib1;
  end if;

  raise notice
    'OK(U): login_attempts / ip_blocks row counts unchanged';

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'auth_login_throttles'
      and column_name = 'auth_user_id'
  ) then
    raise exception
      'FAIL(V-1): auth_user_id column missing';
  end if;

  if not exists (
    select 1
    from pg_constraint con
    join pg_class rel
      on rel.oid = con.conrelid
    where rel.relname = 'auth_login_throttles'
      and rel.relnamespace = 'public'::regnamespace
      and con.contype = 'f'
      and pg_get_constraintdef(con.oid)
        ilike '%(auth_user_id)%references%profiles%'
  ) then
    raise exception
      'FAIL(V-2): auth_user_id FK to profiles missing';
  end if;

  raise notice
    'OK(V): auth_user_id column and FK present';

  if exists (
    select 1
    from pg_extension
    where extname = 'pg_cron'
  ) then
    raise exception
      'FAIL(W): pg_cron must not be installed (cron不要方針)';
  end if;

  raise notice
    'OK(W): pg_cron not installed';

  raise notice
    'ALL DRY-RUN ASSERTIONS PASSED — rolling back (nothing persisted)';
end
$$;

rollback;
