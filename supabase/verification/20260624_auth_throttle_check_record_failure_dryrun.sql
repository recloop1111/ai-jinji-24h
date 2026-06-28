-- =============================================================================
-- §2 予行（DRY-RUN）: 20260624_auth_throttle_check_record_failure の動作確認
-- 日付: 2026-06-24
-- 本番 migration の MIGRATION BODY を byte-identical で取り込み、BEGIN..ROLLBACK で本番に残さず検証。
-- 既存テーブル auth_login_throttles と既存関数（record_success 等）は適用済み前提。
-- 一致確認: sed -n '/^-- >>> MIGRATION BODY START/,/^-- <<< MIGRATION BODY END/p' を両ファイルで diff（空）。
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

-- ---- 振る舞いアサーション（失敗時 EXCEPTION → ROLLBACK） ----------------------
do $$
declare
  v_acc boolean; v_ip boolean; v_blk timestamptz;
  i integer; v_fc integer; v_fc2 integer; v_uid uuid; v_ip_uid uuid;
  n_la0 bigint; n_la1 bigint;
  kk integer; v_secdef boolean; v_has_sp boolean; v_idargs text;
  v_admin uuid;
  fn_names text[] := array['auth_throttle_check', 'auth_throttle_record_failure'];
  fn_args  text[] := array[
    'p_portal text, p_account_scope_key text, p_ip_scope_key text',
    'p_portal text, p_account_scope_key text, p_ip_scope_key text, p_auth_user_id uuid'];
  k_acc     constant text := md5('dr-chk-acct-1') || md5('dr-chk-acct-1');
  k_acc2    constant text := md5('dr-chk-acct-2') || md5('dr-chk-acct-2');
  k_ip      constant text := md5('dr-chk-ip-1')   || md5('dr-chk-ip-1');
  k_ip2     constant text := md5('dr-chk-ip-2')   || md5('dr-chk-ip-2');
  k_ipflood constant text := md5('dr-chk-ipflood')|| md5('dr-chk-ipflood');
begin
  select count(*) into n_la0 from public.login_attempts;
  select id into v_admin from public.profiles where role in ('admin','super_admin') order by id limit 1;
  if v_admin is null then raise exception 'PREREQ: admin/super_admin profile が必要'; end if;

  -- (A) check は副作用なし（行が無ければ未ブロック・行を作らない）
  select account_blocked, ip_blocked into v_acc, v_ip from public.auth_throttle_check('client', k_acc, k_ip);
  if v_acc or v_ip then raise exception 'FAIL(A): fresh keys must be unblocked'; end if;
  if exists (select 1 from public.auth_login_throttles where portal_type='client' and scope_key=k_acc) then
    raise exception 'FAIL(A): check must not create rows';
  end if;
  raise notice 'OK(A): check has no side effects';

  -- (B) record_failure を 9回 → 未ブロック / 10回目で account ブロック
  for i in 1..9 loop perform public.auth_throttle_record_failure('client', k_acc, k_ip, v_admin); end loop;
  select account_blocked into v_acc from public.auth_throttle_check('client', k_acc, k_ip);
  if v_acc then raise exception 'FAIL(B): account must NOT be blocked at 9'; end if;
  perform public.auth_throttle_record_failure('client', k_acc, k_ip, v_admin);
  select account_blocked, blocked_until into v_acc, v_blk from public.auth_throttle_check('client', k_acc, k_ip);
  if not v_acc then raise exception 'FAIL(B): account must be blocked at 10'; end if;
  raise notice 'OK(B): account blocked at 10';

  -- (C) blocked 中の record_failure で blocked_until が延長されない & count据え置き
  select failure_count into v_fc from public.auth_login_throttles where portal_type='client' and scope_type='account' and scope_key=k_acc;
  perform public.auth_throttle_record_failure('client', k_acc, k_ip, v_admin);
  select failure_count, blocked_until into v_fc2, v_blk from public.auth_login_throttles where portal_type='client' and scope_type='account' and scope_key=k_acc;
  if v_fc2 <> v_fc then raise exception 'FAIL(C): failure_count must not change while blocked (% -> %)', v_fc, v_fc2; end if;
  raise notice 'OK(C): no increment/extension while blocked';

  -- (D) record_failure は login_attempts を書かない（監査は別経路）
  select count(*) into n_la1 from public.login_attempts;
  if n_la1 <> n_la0 then raise exception 'FAIL(D): record_failure must not write login_attempts'; end if;
  raise notice 'OK(D): record_failure does not touch login_attempts';

  -- (E) auth_user_id は account に保存 / ip は NULL
  select auth_user_id into v_uid from public.auth_login_throttles where portal_type='client' and scope_type='account' and scope_key=k_acc;
  if v_uid is distinct from v_admin then raise exception 'FAIL(E): account auth_user_id must be saved'; end if;
  select auth_user_id into v_ip_uid from public.auth_login_throttles where portal_type='client' and scope_type='ip' and scope_key=k_ip;
  if v_ip_uid is not null then raise exception 'FAIL(E): ip auth_user_id must be null'; end if;
  raise notice 'OK(E): auth_user_id on account, null on ip';

  -- (F) IP 60回で ip ブロック（各回 別 account・auth_user_id null）
  for i in 1..60 loop
    perform public.auth_throttle_record_failure('admin', md5('chk-flood-'||i)||md5('chk-flood-'||i), k_ipflood, null);
  end loop;
  select ip_blocked into v_ip from public.auth_throttle_check('admin', md5('chk-probe')||md5('chk-probe'), k_ipflood);
  if not v_ip then raise exception 'FAIL(F): ip must be blocked at 60'; end if;
  raise notice 'OK(F): ip blocked at 60 within window';

  -- (G) admin/client 分離（同一 ip scope_key でも client は未ブロック）
  select ip_blocked into v_ip from public.auth_throttle_check('client', md5('chk-probe2')||md5('chk-probe2'), k_ipflood);
  if v_ip then raise exception 'FAIL(G): client portal must be independent from admin ip'; end if;
  raise notice 'OK(G): admin/client independent';

  -- (H) 2新関数: 存在 / SECURITY DEFINER / search_path 固定 / 正確な引数 / service_role のみ EXECUTE
  for kk in 1..array_length(fn_names,1) loop
    select p.prosecdef,
           exists (select 1 from unnest(coalesce(p.proconfig, array[]::text[])) as opt where opt in ('search_path=','search_path=""')),
           pg_get_function_identity_arguments(p.oid)
      into v_secdef, v_has_sp, v_idargs
      from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.proname=fn_names[kk];
    if not found then raise exception 'FAIL(H): function % missing', fn_names[kk]; end if;
    if not v_secdef then raise exception 'FAIL(H): % must be SECURITY DEFINER', fn_names[kk]; end if;
    if not v_has_sp then raise exception 'FAIL(H): % must pin empty search_path', fn_names[kk]; end if;
    if v_idargs <> fn_args[kk] then raise exception 'FAIL(H): % signature mismatch (got %)', fn_names[kk], v_idargs; end if;
    perform 1 from information_schema.role_routine_grants
      where specific_schema='public' and routine_name=fn_names[kk] and grantee in ('anon','authenticated','PUBLIC');
    if found then raise exception 'FAIL(H): % must not be executable by anon/authenticated/public', fn_names[kk]; end if;
    perform 1 from information_schema.role_routine_grants
      where specific_schema='public' and routine_name=fn_names[kk] and grantee='service_role' and privilege_type='EXECUTE';
    if not found then raise exception 'FAIL(H): service_role must EXECUTE %', fn_names[kk]; end if;
  end loop;
  raise notice 'OK(H): new functions DEFINER / pinned search_path / correct args / service_role-only';

  -- (I) 互換: 旧 auth_throttle_reserve_attempt は削除されず存在（新フローからは呼ばない）
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='auth_throttle_reserve_attempt') then
    raise exception 'FAIL(I): auth_throttle_reserve_attempt must still exist (compat)';
  end if;
  raise notice 'OK(I): reserve_attempt retained for compatibility';

  raise notice 'ALL DRY-RUN ASSERTIONS PASSED — rolling back (nothing persisted)';
end $$;

rollback;
