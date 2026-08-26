-- ============================================================================
-- p5_evaluation_lock_state.sql
--   Phase P5: 評価（EBCA writer）の「同時実行防止ロック」「進行状態」「cooldown」を interviews に持たせる（additive）。
--   本ファイルは P5 コードが依存する interviews 拡張列の唯一の権威（single source of truth）。
--     ── lock / state（lib/evaluation/lock.ts, cost guard）
--     evaluation_locked_until timestamptz … 短TTLロック（既存 realtime_call_locked_until と同思想）
--     evaluation_status       text        … not_started / evaluating / completed / failed
--     evaluation_error_code   text        … 直近失敗の非PII code（PII/本文は入れない）
--     ── cooldown（lib/evaluation/cooldown.ts。lock とは別概念・別列で表現）
--     evaluation_retry_after  timestamptz … temporary 失敗後の再試行抑制の期限（TTLで自然失効・release されない）
--     evaluation_cooldown_hash text       … その cooldown が対象とする transcript_hash（別 transcript は抑制しない）
--   評価「結果」は interview_results（evaluation_axes/total_score/detail_json）に upsert（別テーブル・既存）。
--   ※ 現 main から再構成（旧 pr4e3 を直接 merge せず統合）。手動SQL・Production 未適用（別承認）。additive・可逆。
--
-- security / 運用:
--   * 列追加のみ＝既存挙動非変更。writer は service-role（RLS bypass）でのみ書く（browser 直書き不可）。
--   * lock は「条件付き UPDATE（locked_until IS NULL or < now）… RETURNING」で原子的 claim（行ロックで直列化）。
--     TTL 失効で stale 回復。正常完了/失敗で解放。crash でも TTL で自然回復（永久ロックしない）。
--   * cooldown は lock と責務が異なる（release されない・TTL失効のみ）。同じ列で兼ねると lock release が
--     cooldown を消す事故になるため必ず別列。cooldown_hash は本文由来だが hash（非可逆・非PII）。
-- ============================================================================
SET lock_timeout = '3s';

BEGIN;

ALTER TABLE public.interviews
  ADD COLUMN IF NOT EXISTS evaluation_locked_until  timestamptz,
  ADD COLUMN IF NOT EXISTS evaluation_status        text,
  ADD COLUMN IF NOT EXISTS evaluation_error_code    text,
  ADD COLUMN IF NOT EXISTS evaluation_retry_after   timestamptz,
  ADD COLUMN IF NOT EXISTS evaluation_cooldown_hash text;

DO $$ BEGIN
  ALTER TABLE public.interviews
    ADD CONSTRAINT interviews_evaluation_status_chk
    CHECK (evaluation_status IS NULL OR evaluation_status IN ('not_started', 'evaluating', 'completed', 'failed'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMIT;

RESET lock_timeout;
