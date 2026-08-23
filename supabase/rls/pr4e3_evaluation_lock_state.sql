-- ============================================================================
-- pr4e3_evaluation_lock_state.sql  （草案 / 未適用）
--   PR-4E-3: AI評価（EBCA writer）の「並行実行ロック」と「評価状態」を interviews に追加する。
--   既存 realtime_call_locked_until と同思想の短TTLロック列 + （任意の）状態列。
--
-- 【重要 / 未適用】
--   * これは MIGRATION ではない。supabase/migrations には置かない（本番自動適用しない）。
--   * 手動実行専用（運用者が Supabase SQL Editor / psql で意図的に流す）。本ファイルは未実行。
--   * 本番=Preview 同一プロジェクトのため、適用＝本番反映。適用は承認後に行う。
--   * additive のみ（NULL 許容・DEFAULT なし/安全 DEFAULT）。既存行・既存挙動に非影響。可逆（ROLLBACK で DROP COLUMN）。
--   * RPC / SECURITY DEFINER function は作らない。ロックは app（service-role）の「条件付き UPDATE」で原子的に取得する
--     （UPDATE ... WHERE id=? AND (evaluation_locked_until IS NULL OR evaluation_locked_until < now()) RETURNING id）。
--     → SECURITY DEFINER / public execute 等の権限リスクは無い。
--   * RLS 変更なし。これらの列は service-role（RLS bypass）からのみ書かれる。anon/authenticated に grant/policy を足さない。
--
-- 追加列（interviews）:
--   1) evaluation_locked_until timestamptz  … 並行 Provider 呼び出し（=二重課金）を防ぐ短TTLロック。
--        app が Provider 呼び出し前に条件付き UPDATE でクレーム。成功後 release（NULL）。crash 時は TTL(≈5分)で自然回復。
--   2) evaluation_status text                … （任意）UI 状態復元用: not_started / evaluating / completed / failed。
--        ※ interview_results は「成功結果のみ」を持つ設計のため、進行中/失敗の状態は interviews 側に持つのが自然。
--   3) evaluation_error_code text            … （任意）失敗理由の「code のみ」（RATE_LIMIT 等）。PII/prompt/transcript/raw は保存しない。
--   4) evaluation_retry_after timestamptz    … （PR-19I cooldown）temporary provider 失敗後の「再試行抑制」期限。
--        並行ロック(1)とは別概念（release されない・TTL≈60秒で自然失効）。active 中は Provider を呼ばない。
--   5) evaluation_cooldown_hash text         … （PR-19I cooldown）cooldown が適用される transcript_hash（非可逆・非 PII）。
--        scope = interviewId + hash。別 transcript(別 hash)の評価を古い失敗で止めないために保持。
--
-- 適用前後の確認 / 巻き戻し（別ファイル・いずれも未実行）:
--   precheck : supabase/rls/pr4e3_evaluation_lock_state_precheck.sql
--   postcheck: supabase/rls/pr4e3_evaluation_lock_state_postcheck.sql
--   rollback : supabase/rls/pr4e3_evaluation_lock_state_ROLLBACK.sql
--
-- 適用時の安全性:
--   * NULL 許容・DEFAULT 無しの列追加は PostgreSQL 11+ ではメタデータのみ（rewrite しない・大テーブルでも一瞬）。
--   * ADD COLUMN は一時的に ACCESS EXCLUSIVE を取るため lock_timeout でガード（取得できなければ即失敗＝安全側）。
-- ============================================================================

SET lock_timeout = '3s';

BEGIN;

ALTER TABLE public.interviews
  ADD COLUMN IF NOT EXISTS evaluation_locked_until  timestamptz,
  ADD COLUMN IF NOT EXISTS evaluation_status        text,
  ADD COLUMN IF NOT EXISTS evaluation_error_code    text,
  ADD COLUMN IF NOT EXISTS evaluation_retry_after   timestamptz,  -- PR-19I cooldown 期限
  ADD COLUMN IF NOT EXISTS evaluation_cooldown_hash text;         -- PR-19I cooldown 対象 transcript_hash

-- evaluation_status の値集合（NULL = 未評価扱い）。
ALTER TABLE public.interviews
  ADD CONSTRAINT interviews_evaluation_status_chk
  CHECK (evaluation_status IS NULL OR evaluation_status IN ('not_started', 'evaluating', 'completed', 'failed'));

COMMIT;

RESET lock_timeout;

-- 参考（app 側の原子的クレーム。ここでは実行しない・アプリが service-role で発行する）:
--   UPDATE public.interviews
--      SET evaluation_locked_until = now() + interval '5 minutes'
--    WHERE id = :interview_id
--      AND (evaluation_locked_until IS NULL OR evaluation_locked_until < now())
--   RETURNING id;   -- 1行=取得 / 0行=競合(409) 。解放は SET evaluation_locked_until = NULL。
