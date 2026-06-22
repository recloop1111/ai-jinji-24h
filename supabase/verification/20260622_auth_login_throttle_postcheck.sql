-- =============================================================================
-- §3 適用後確認（POST-APPLY CHECK / READ-ONLY）
-- 日付: 2026-06-22
--
-- 目的: migration（20260622_auth_login_throttle.sql）適用後に、期待どおりの
--   テーブル・列・制約(scope_key 64hex / FK)・index・RLS・table privilege・
--   function(4種)・function privilege・拡張・死蔵不在・DB内HMAC不在 を確認する。
--
-- 性質: SELECT/CTE のみ。BEGIN/DO/DDL/DML なし。行データ（PII実値）は返さない。
--   結果は section / object_type / object_name / details の4列に統合。
-- =============================================================================
with
-- 1) テーブル存在 / RLS
t_exist as (
  select 'table_existence'::text as section, 'table'::text as object_type,
         x.tname::text as object_name,
         case when c.oid is null then 'MISSING (要 migration 適用)'
              else 'EXISTS (relkind='||c.relkind::text||', rls_enabled='||c.relrowsecurity::text||')' end::text as details
  from (select unnest(array['auth_login_throttles','login_attempts','ip_blocks']) as tname) x
  left join pg_class c on c.relname = x.tname and c.relnamespace = 'public'::regnamespace
),

-- 2) auth_login_throttles 列
cols as (
  select 'columns'::text, 'column'::text,
         (table_name||'.'||column_name)::text,
         (data_type||' | nullable='||is_nullable||' | default='||coalesce(column_default,'-'))::text
  from information_schema.columns
  where table_schema = 'public' and table_name = 'auth_login_throttles'
),

-- 3) 制約（PK/UNIQUE/CHECK/FK）。scope_key 64hex CHECK と last_unlocked_by FK を確認
cons as (
  select 'constraints'::text, 'constraint'::text,
         (rel.relname||'.'||con.conname)::text,
         (case con.contype when 'p' then 'PRIMARY KEY' when 'u' then 'UNIQUE'
                           when 'c' then 'CHECK' when 'f' then 'FOREIGN KEY'
                           else con.contype::text end
          ||' :: '||pg_get_constraintdef(con.oid))::text
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  where rel.relnamespace = 'public'::regnamespace
    and rel.relname in ('auth_login_throttles','login_attempts')
),

-- 4) index（auth_login_throttles ＋ login_attempts 複合）
idx as (
  select 'indexes'::text, 'index'::text,
         (tablename||'.'||indexname)::text, indexdef::text
  from pg_indexes
  where schemaname = 'public'
    and tablename in ('auth_login_throttles','login_attempts')
),

-- 5) RLS policy（3テーブルとも 0件が期待＝definer/bypass のみ到達）
pol as (
  select 'policies'::text, 'policy'::text,
         (tablename||'.'||policyname)::text,
         ('cmd='||cmd||' | roles='||array_to_string(roles,','))::text
  from pg_policies
  where schemaname = 'public'
    and tablename in ('auth_login_throttles','login_attempts','ip_blocks')
),

-- 6) table privilege（anon/authenticated が現れない＝遮断成功。service_role の付与内容を確認）
priv as (
  select 'table_privileges'::text, 'grant'::text,
         (table_name||' -> '||grantee)::text,
         string_agg(privilege_type, ', ' order by privilege_type)::text
  from information_schema.role_table_grants
  where table_schema = 'public'
    and table_name in ('auth_login_throttles','login_attempts','ip_blocks')
    and grantee in ('anon','authenticated','PUBLIC','service_role')
  group by table_name, grantee
),

-- 7) function（4種の存在 + SECURITY DEFINER + search_path 固定）
fns as (
  select 'functions'::text, 'function'::text,
         (p.proname||'('||pg_get_function_identity_arguments(p.oid)||')')::text,
         ('returns '||pg_get_function_result(p.oid)
           ||' | security='||case when p.prosecdef then 'DEFINER' else 'INVOKER' end
           ||' | config='||coalesce(array_to_string(p.proconfig, ','), '-'))::text
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname like 'auth_throttle\_%'
),

-- 8) function privilege（service_role のみ EXECUTE。anon/authenticated/public が出ないこと）
fn_priv as (
  select 'function_privileges'::text, 'execute_grant'::text,
         (routine_name||' -> '||grantee)::text, privilege_type::text
  from information_schema.role_routine_grants
  where specific_schema = 'public'
    and routine_name like 'auth_throttle\_%'
    and grantee in ('anon','authenticated','PUBLIC','service_role')
),

-- 9) 拡張（pgcrypto は DB内HMAC廃止により本機能では不要。pg_cron は追加しない方針）
ext as (
  select 'extensions'::text, 'extension'::text, e.extname::text,
         ('INSTALLED version='||e.extversion::text||' schema='||n.nspname::text)::text
  from pg_extension e join pg_namespace n on n.oid = e.extnamespace
  where e.extname in ('pgcrypto','pg_cron')
),
ext_missing as (
  select 'extensions'::text, 'extension'::text, x.name::text,
         ('NOT INSTALLED (available='||
           case when exists(select 1 from pg_available_extensions a where a.name = x.name)
                then 'yes' else 'no' end||')')::text
  from (select unnest(array['pgcrypto','pg_cron']) as name) x
  where not exists (select 1 from pg_extension e where e.extname = x.name)
),

-- 10) DB内HMAC不在の確認（scope_key 生成 function を DB に作らない方針）
no_db_hmac as (
  select 'db_hmac_check'::text, 'absent_expected'::text, 'public.auth_throttle_scope_key'::text,
         case when exists (
                select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                where n.nspname='public' and p.proname='auth_throttle_scope_key'
              ) then 'PRESENT (想定外: DB内ハッシュは廃止のはず)'
              else 'ABSENT (想定どおり: scope_key はアプリ側生成)' end::text
),

-- 11) 死蔵不在（locked_accounts / companies ロック列）
dead as (
  select 'legacy_check'::text, 'absent_expected'::text, 'locked_accounts'::text,
         case when exists (select 1 from pg_class c where c.relname='locked_accounts' and c.relnamespace='public'::regnamespace)
              then 'STILL PRESENT (想定外)' else 'ABSENT (想定どおり)' end::text
  union all
  select 'legacy_check'::text, 'absent_expected'::text, 'companies.is_locked/locked_at/login_fail_count'::text,
         case when exists (
                select 1 from information_schema.columns
                where table_schema='public' and table_name='companies'
                  and column_name in ('is_locked','locked_at','login_fail_count')
              ) then 'SOME PRESENT (想定外)' else 'ABSENT (想定どおり)' end::text
)

select * from t_exist
union all select * from cols
union all select * from cons
union all select * from idx
union all select * from pol
union all select * from priv
union all select * from fns
union all select * from fn_priv
union all select * from ext
union all select * from ext_missing
union all select * from no_db_hmac
union all select * from dead
order by section, object_name;
