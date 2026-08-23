-- ============================================================================
-- pr19b_interviews_transcript_seq.sql  （草案 / 未適用）
--   PR-19B: transcript の server-authoritative 採番用に interviews へ counter 列を1本追加する。
--   単一文の atomic UPDATE で採番を Postgres の row-level serialization に委ねる（アプリで race させない）。
--
-- 【重要 / 未適用】
--   * これは MIGRATION ではない。supabase/migrations には置かない（本番自動適用しない）。
--   * 手動実行専用（運用者が Supabase SQL Editor / psql で意図的に流す）。本ファイルは未実行。
--   * 本番=Preview 同一プロジェクトのため、適用＝本番反映。適用は承認後に行う。
--   * additive のみ（列1本追加）。既存行・既存挙動に非影響。可逆（ROLLBACK で DROP COLUMN）。
--   * RLS 変更なし。SECURITY DEFINER / public RPC は作らない。採番は app（service-role）の
--     「単一文 UPDATE ... SET next_transcript_seq = next_transcript_seq + 1 ... RETURNING」で原子的に行う。
--   * UNIQUE(interview_id, seq) は追加しない（PR-3A の判断を維持。seq は gap を許容し一意性を強制しない）。
--   * index は追加しない（採番は主キー id 1 行の UPDATE。追加索引は不要）。
--
-- 追加列（interviews）:
--   next_transcript_seq integer NOT NULL DEFAULT 0
--     … 「これまでに採番した transcript seq の数（= 直近に採番した seq）」を保持する counter。
--       採番は post-increment: SET = +1 → RETURNING 更新後値。DEFAULT 0 なので「最初の採番 = 1」。
--       DEFAULT 0 は volatile でない定数のため、PostgreSQL 11+ では既存行の rewrite を伴わない
--       （メタデータのみ・大テーブルでも一瞬）。既存行は読むと 0（未採番）に見える＝安全。
--
-- 適用前後の確認 / 巻き戻し（別ファイル・いずれも未実行）:
--   precheck : supabase/rls/pr19b_interviews_transcript_seq_precheck.sql
--   postcheck: supabase/rls/pr19b_interviews_transcript_seq_postcheck.sql
--   rollback : supabase/rls/pr19b_interviews_transcript_seq_ROLLBACK.sql
--
-- 適用時の安全性:
--   * NOT NULL DEFAULT <定数> の列追加は PostgreSQL 11+ ではメタデータのみ（rewrite 無し）。
--   * ADD COLUMN は一時的に ACCESS EXCLUSIVE を取るため lock_timeout でガード（取れなければ即失敗＝安全側）。
-- ============================================================================

SET lock_timeout = '3s';

BEGIN;

ALTER TABLE public.interviews
  ADD COLUMN IF NOT EXISTS next_transcript_seq integer NOT NULL DEFAULT 0;

COMMIT;

RESET lock_timeout;

-- 参考（app 側の原子的採番。ここでは実行しない・アプリが service-role で単一文発行する）:
--   UPDATE public.interviews
--      SET next_transcript_seq = next_transcript_seq + 1
--    WHERE id = :interview_id
--   RETURNING next_transcript_seq;   -- 更新後値を返す。DEFAULT 0 → 最初の採番 = 1。0行 = 対象 interview 不在。
-- SELECT→UPDATE の 2段や MAX(seq)+1 は使わない（race するため）。
