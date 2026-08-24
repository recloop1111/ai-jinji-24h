-- ============================================================================
-- _phaseA_bootstrap.sql  —  LOCAL ONLY / NOT A PRODUCTION MIGRATION / DO NOT APPLY TO REMOTE
--
-- P2-5 Phase A の実 PostgreSQL smoke のために、pr3a/pr19c/pr4e3 の草案が依存する
-- 「最小 synthetic base schema」だけを作る（本番 27 テーブルは複製しない）。全データ synthetic。
--
-- 依存グラフ（コード/SQL から抽出）:
--   pr3a: interview_transcripts.interview_id -> interviews(id) / RLS: interviews.applicant_id,
--         applicants.company_id, profiles.id(=auth.uid()), profiles.company_id, profiles.role
--   pr19c: interviews に next_transcript_seq 追加 + 採番 function
--   pr4e3: interviews に評価状態列を追加
-- ============================================================================

create extension if not exists pgcrypto;

create table if not exists public.companies (
  id   uuid primary key default gen_random_uuid(),
  name text
);

create table if not exists public.profiles (
  id         uuid primary key default gen_random_uuid(),  -- = auth.uid()
  company_id uuid references public.companies(id),
  role       text
);

create table if not exists public.applicants (
  id         uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id)
);

create table if not exists public.interviews (
  id           uuid primary key default gen_random_uuid(),
  applicant_id uuid references public.applicants(id) on delete cascade,
  status       text,
  started_at   timestamptz default now(),
  created_at   timestamptz default now()
);

-- Supabase の default privileges（anon/authenticated/service_role への SELECT 等）を再現。
-- 実 Supabase では新規 public テーブルへ自動付与される。local でも RLS smoke のため明示付与する。
grant usage on schema public to anon, authenticated, service_role;
grant select on public.companies, public.profiles, public.applicants, public.interviews to anon, authenticated;
grant all on public.companies, public.profiles, public.applicants, public.interviews to service_role;
