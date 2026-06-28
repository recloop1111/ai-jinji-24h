-- =============================================================================
-- §3 適用後確認（POST-APPLY CHECK / READ-ONLY）: 20260624_auth_throttle_check_record_failure
-- 日付: 2026-06-24
-- SELECT/CTE のみ。BEGIN/DO/DDL/DML なし。行データ（PII実値）は返さない。
-- 結果は section / object_type / object_name / details の4列。
-- =============================================================================
with
-- 1) 新関数2種の存在 + SECURITY DEFINER + search_path 固定 + シグネチャ
fns as (
  select 'functions'::text as section, 'function'::text as object_type,
         (p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')')::text as object_name,
         ('returns ' || pg_get_function_result(p.oid)
           || ' | security=' || case when p.prosecdef then 'DEFINER' else 'INVOKER' end
           || ' | config=' || coalesce(array_to_string(p.proconfig, ','), '-'))::text as details
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in ('auth_throttle_check', 'auth_throttle_record_failure')
),

-- 2) 新関数の EXECUTE 権限（service_role のみ。anon/authenticated/public が出ないこと）
fn_priv as (
  select 'function_privileges'::text, 'execute_grant'::text,
         (routine_name || ' -> ' || grantee)::text,
         privilege_type::text
  from information_schema.role_routine_grants
  where specific_schema = 'public'
    and routine_name in ('auth_throttle_check', 'auth_throttle_record_failure')
    and grantee in ('anon', 'authenticated', 'PUBLIC', 'service_role')
),

-- 3) 既存維持の確認（record_success / admin_unlock / list_blocked_accounts / reserve_attempt は残存）
existing as (
  select 'existing_functions'::text, 'present_expected'::text, x.fname::text,
         case when exists (
                select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                where n.nspname = 'public' and p.proname = x.fname
              ) then 'PRESENT (想定どおり)' else 'MISSING (想定外)' end::text
  from (select unnest(array[
    'auth_throttle_record_success',
    'auth_throttle_admin_unlock',
    'auth_throttle_list_blocked_accounts',
    'auth_throttle_reserve_attempt'
  ]) as fname) x
),

-- 4) login_attempts CHECK（failure_reason 値域）が維持されていること
reason_chk as (
  select 'constraints'::text, 'check'::text, ('login_attempts.' || con.conname)::text,
         pg_get_constraintdef(con.oid)::text
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  where rel.relnamespace = 'public'::regnamespace
    and rel.relname = 'login_attempts'
    and con.conname = 'login_attempts_reason_chk'
)

select * from fns
union all select * from fn_priv
union all select * from existing
union all select * from reason_chk
order by section, object_name;
