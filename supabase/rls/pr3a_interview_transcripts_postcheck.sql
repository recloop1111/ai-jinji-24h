-- ============================================================================
-- pr3a_interview_transcripts_postcheck.sql
--   PR-3A 適用「後」の検証（読み取りのみ・変更なし）。
--   pr3a_interview_transcripts.sql 適用直後に実行し、テーブル/列/制約/索引/RLS が期待どおりで、
--   既存テーブルに副作用が無いことを確認する。SELECT のみ。
-- ============================================================================

-- 1) テーブルが作成されたか（期待: public.interview_transcripts が非 NULL）。
SELECT to_regclass('public.interview_transcripts') AS interview_transcripts_table;

-- 2) 列 / 型 / nullability / default（期待: 下記の11列）。
SELECT ordinal_position, column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'interview_transcripts'
ORDER BY ordinal_position;
-- 期待:
--   id uuid NOT NULL default gen_random_uuid()
--   interview_id uuid NOT NULL
--   speaker text NOT NULL
--   text text NOT NULL
--   seq integer NOT NULL
--   final boolean NOT NULL default true
--   source text NOT NULL
--   dedup_key text NULL
--   language text NULL
--   metadata jsonb NOT NULL default '{}'::jsonb
--   created_at timestamptz NOT NULL default now()

-- 3) 制約（PK / FK(ON DELETE CASCADE) / CHECK speaker / CHECK source / CHECK seq / CHECK text_len）。
SELECT conname, contype, pg_get_constraintdef(oid) AS def
FROM pg_constraint
WHERE conrelid = 'public.interview_transcripts'::regclass
ORDER BY contype, conname;
-- 期待:
--   PRIMARY KEY (id)
--   FOREIGN KEY (interview_id) REFERENCES interviews(id) ON DELETE CASCADE
--   CHECK speaker IN ('applicant','interviewer')
--   CHECK source IN ('realtime','server','mock','synthetic')
--   CHECK (seq >= 1)
--   CHECK (char_length(text) <= 20000)

-- 4) 索引（順序索引 + 部分ユニーク索引）。UNIQUE(interview_id, seq) が「無い」ことも確認。
SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public' AND tablename = 'interview_transcripts'
ORDER BY indexname;
-- 期待:
--   PK 索引（interview_transcripts_pkey）
--   idx_interview_transcripts_interview_seq (interview_id, seq)  ← 非ユニーク
--   uq_interview_transcripts_interview_dedup (interview_id, dedup_key) WHERE dedup_key IS NOT NULL  ← 部分ユニーク
--   ※ (interview_id, seq) のユニーク索引は存在しないこと。

-- 5) RLS が有効で、policy が SELECT の company / admin の2本だけ（INSERT/UPDATE/DELETE policy 無し）。
SELECT relrowsecurity AS rls_enabled, relforcerowsecurity AS rls_forced
FROM pg_class WHERE oid = 'public.interview_transcripts'::regclass;
-- 期待: rls_enabled = true。

SELECT policyname, roles, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'interview_transcripts'
ORDER BY cmd, policyname;
-- 期待: company_select_interview_transcripts(authenticated, SELECT) /
--       admin_select_interview_transcripts(authenticated, SELECT) の2本のみ。
--       INSERT/UPDATE/DELETE の policy は無い（＝anon/authenticated 書込不可・書込は service-role のみ）。

-- 6) 空テーブルであること（適用直後）。
SELECT count(*) AS interview_transcripts_row_count FROM public.interview_transcripts;
-- 期待: 0。

-- 7) 既存テーブルへの副作用が無いこと（interviews / interview_logs の列・行数が不変）。
SELECT count(*) AS interviews_row_count   FROM public.interviews;
SELECT count(*) AS interview_logs_row_count FROM public.interview_logs;  -- 期待: precheck と同値（触れていない）
SELECT count(*) AS interviews_column_count
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'interviews';
-- 期待: interviews の列数が適用前と同じ（本 PR は interviews を変更しない）。

-- 8) FK が参照先を正しく指しているか（孤児防止 / CASCADE 確認）。
SELECT conname, confrelid::regclass AS references_table, confdeltype AS on_delete
FROM pg_constraint
WHERE conrelid = 'public.interview_transcripts'::regclass AND contype = 'f';
-- 期待: references_table = interviews、on_delete = 'c'（CASCADE）。

-- 9) 明示 table privilege（ambient に依存しない）。実効権限を has_table_privilege で確認。
SELECT
  has_table_privilege('authenticated', 'public.interview_transcripts', 'SELECT') AS authenticated_select, -- 期待 true
  has_table_privilege('authenticated', 'public.interview_transcripts', 'INSERT') AS authenticated_insert, -- 期待 false
  has_table_privilege('authenticated', 'public.interview_transcripts', 'UPDATE') AS authenticated_update, -- 期待 false
  has_table_privilege('authenticated', 'public.interview_transcripts', 'DELETE') AS authenticated_delete, -- 期待 false
  has_table_privilege('anon',          'public.interview_transcripts', 'SELECT') AS anon_select,          -- 期待 false
  has_table_privilege('anon',          'public.interview_transcripts', 'INSERT') AS anon_insert,          -- 期待 false
  has_table_privilege('service_role',  'public.interview_transcripts', 'SELECT') AS service_select,       -- 期待 true
  has_table_privilege('service_role',  'public.interview_transcripts', 'INSERT') AS service_insert,       -- 期待 true
  has_table_privilege('service_role',  'public.interview_transcripts', 'UPDATE') AS service_update;       -- 期待 true

-- 10) 明示 GRANT の一覧（PUBLIC/anon に SELECT/DML が残っていないこと）。
SELECT grantee, string_agg(privilege_type, ',' ORDER BY privilege_type) AS privs
FROM information_schema.role_table_grants
WHERE table_schema = 'public' AND table_name = 'interview_transcripts'
  AND grantee IN ('anon', 'authenticated', 'service_role', 'PUBLIC')
GROUP BY grantee ORDER BY grantee;
-- 期待: authenticated=SELECT / service_role=DELETE,INSERT,SELECT,UPDATE / anon・PUBLIC は SELECT/DML を含まない。
