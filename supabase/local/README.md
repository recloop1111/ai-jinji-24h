# supabase/local — LOCAL ONLY (P2-5 Phase A)

**DO NOT APPLY TO REMOTE / PRODUCTION.** These files exist solely to stand up an
isolated `ai-jinji-24h-local` Supabase for verifying the manual `supabase/rls/`
drafts (pr3a / pr19c / pr4e3) on real PostgreSQL.

- `_phaseA_bootstrap.sql` — minimal **synthetic** base schema (interviews / applicants /
  profiles / companies) that the pr3a/pr19c/pr4e3 drafts depend on. All data is synthetic.
  This is **not** the production schema and is **not** a migration.
- Never placed in `supabase/migrations/` (no auto-apply). Never run against a linked/remote project.
