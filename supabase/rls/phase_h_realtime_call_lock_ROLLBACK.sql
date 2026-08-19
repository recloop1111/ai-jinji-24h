-- ============================================================================
-- phase_h_realtime_call_lock_ROLLBACK.sql
--   Phase H の巻き戻し。realtime_call_locked_until 列を削除する。
--   * 手動実行専用・未実行。適用（= 本番反映）は承認後。
--   * コード側は列が無くても fail-open（claim/解放の UPDATE エラーを無視して続行）なので、
--     この列を落としても面接フローは壊れない（多重防止だけが無効化される＝適用前の状態に戻る）。
--   * 列に紐づく制約/DEFAULT は付けていないため、単純 DROP で安全。任意の部分インデックスを
--     作成していた場合は DROP COLUMN が自動的に一緒に削除する（明示 DROP INDEX は不要）。
--   * DROP COLUMN も一時的に ACCESS EXCLUSIVE ロックを取るため、lock_timeout でガードする。
-- ============================================================================

SET lock_timeout = '3s';

ALTER TABLE public.interviews
  DROP COLUMN IF EXISTS realtime_call_locked_until;

RESET lock_timeout;

-- 確認（期待: 0行 = 列が消えている）。
SELECT column_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'interviews'
  AND column_name = 'realtime_call_locked_until';
