-- ============================================================================
-- phase_h_realtime_call_lock_postcheck.sql
--   Phase H 適用「後」の検証（読み取りのみ・変更なし）。
--   phase_h_realtime_call_lock.sql 適用直後に実行し、列が正しい定義で追加され、
--   既存行に副作用が無いことを確認する。SELECT のみ。
-- ============================================================================

-- 1) 列が期待どおりに存在するか（型 timestamptz / NULL 許容 / DEFAULT 無し）。
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'interviews'
  AND column_name = 'realtime_call_locked_until';
-- 期待: 1行。data_type='timestamp with time zone', is_nullable='YES', column_default IS NULL。

-- 2) 既存行に副作用が無いこと（適用直後は全行 NULL のはず）。
SELECT count(*)                                                   AS total_rows,
       count(realtime_call_locked_until)                          AS non_null_lock_rows
FROM public.interviews;
-- 期待: non_null_lock_rows = 0（適用直後）。以後、realtime-call 使用時のみ一時的に値が入る。

-- 3) 想定外の DEFAULT / 制約 / インデックスが付いていないこと（列に紐づくもの）。
SELECT conname, contype, pg_get_constraintdef(oid) AS def
FROM pg_constraint
WHERE conrelid = 'public.interviews'::regclass
  AND pg_get_constraintdef(oid) ILIKE '%realtime_call_locked_until%';
-- 期待: 0行（この列に対する制約は付けていない）。

SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public' AND tablename = 'interviews'
  AND indexdef ILIKE '%realtime_call_locked_until%';
-- 期待: 0行（任意の部分インデックスは今回は付けない方針）。

-- 4) 動作スモーク（任意・非破壊）: conditional-claim 述語が構文的に妥当か、read-only の疑似評価で確認。
--    実データを書き換えないよう UPDATE はせず、WHERE 述語の該当行数だけを数える。
SELECT count(*) AS claimable_in_progress_rows
FROM public.interviews
WHERE status = 'in_progress'
  AND (realtime_call_locked_until IS NULL OR realtime_call_locked_until < now());
-- 期待: 述語がエラーなく評価できる（値は環境依存・0以上）。
