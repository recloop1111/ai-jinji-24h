-- ============================================================================
-- pr19c_allocate_transcript_seq_fn.sql  （草案 / 未適用）
--   PR-19C: transcript の server-authoritative 採番を「単一文 atomic UPDATE」を包む
--   PostgreSQL function public.allocate_transcript_seq(uuid) として提供する。
--   アプリは service-role の supabase.rpc('allocate_transcript_seq', { p_interview_id }) で呼ぶ。
--
-- 【重要 / 未適用】
--   * これは MIGRATION ではない。supabase/migrations には置かない（本番自動適用しない）。
--   * 手動実行専用（運用者が Supabase SQL Editor / psql で意図的に流す）。本ファイルは未実行。
--   * 本番=Preview 同一プロジェクトのため、適用＝本番反映。適用は承認後に行う。
--   * PR-19B の列 next_transcript_seq を IF NOT EXISTS で冪等に確認しつつ、採番 function を追加する
--     （PR-19B の草案は #40 のまま変更しない。本ファイルは 19C 固有の追加）。additive のみ・可逆。
--
-- なぜ RPC か:
--   PostgREST の .update({col: value}) は「リテラル代入」しか表現できず col = col + 1 を表現できない。
--   よって atomic increment を単一文 SQL として function に閉じ込め、service-role の rpc で呼ぶ
--   （既存 auth_throttle_* と同じ「原子的 function 経由」パターン）。SELECT→UPDATE 2段 / MAX(seq)+1 は使わない。
--
-- security 方針（least privilege）:
--   * SECURITY INVOKER（default）。service_role は public.interviews に UPDATE 権限を持つため権限昇格は不要。
--     → SECURITY DEFINER を「安易に使わない」。万一この環境で service_role が直接 UPDATE できない場合は
--       勝手に DEFINER へ切り替えず、理由と安全設計（owner 権限・厳格 grant）を報告すること。
--   * set search_path = ''（schema 注入対策）。本体は public.interviews を完全修飾で参照。
--   * EXECUTE は service_role のみ。public / anon / authenticated からは REVOKE（ブラウザから直接呼べない）。
--   * 引数は p_interview_id uuid のみ（transcript text / PII を引数に取らない）。dynamic SQL 不使用＝SQLi 余地なし。
--   * 単一 UPDATE ... RETURNING（対象行に row lock → 同 interview の並行採番を直列化）。first seq = 1（列 DEFAULT 0）。
--
-- 適用前後の確認 / 巻き戻し（別ファイル・いずれも未実行）:
--   precheck : supabase/rls/pr19c_allocate_transcript_seq_fn_precheck.sql
--   postcheck: supabase/rls/pr19c_allocate_transcript_seq_fn_postcheck.sql
--   rollback : supabase/rls/pr19c_allocate_transcript_seq_fn_ROLLBACK.sql
--
-- 適用時の安全性:
--   * 列追加（IF NOT EXISTS・NOT NULL DEFAULT 定数）は PostgreSQL 11+ でメタデータのみ（rewrite 無し）。
--   * CREATE OR REPLACE FUNCTION はテーブル rewrite を伴わない。ADD COLUMN の一瞬の ACCESS EXCLUSIVE を lock_timeout でガード。
-- ============================================================================

SET lock_timeout = '3s';

BEGIN;

-- 1) 採番 counter 列（PR-19B と同一・冪等）。DEFAULT 0 → post-increment で first = 1。
ALTER TABLE public.interviews
  ADD COLUMN IF NOT EXISTS next_transcript_seq integer NOT NULL DEFAULT 0;

-- 2) 採番 function（単一文 atomic UPDATE を包む）。
CREATE OR REPLACE FUNCTION public.allocate_transcript_seq(p_interview_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_seq integer;
BEGIN
  UPDATE public.interviews
     SET next_transcript_seq = next_transcript_seq + 1
   WHERE id = p_interview_id
  RETURNING next_transcript_seq INTO v_seq;
  -- 対象 interview 不在 → v_seq は NULL（呼び出し側が missing 判定）。gap は許容（採番し直さない）。
  RETURN v_seq;
END;
$$;

-- 3) 権限（least privilege）: public/anon/authenticated から EXECUTE を剥奪し、service_role のみ許可。
REVOKE ALL ON FUNCTION public.allocate_transcript_seq(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.allocate_transcript_seq(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.allocate_transcript_seq(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.allocate_transcript_seq(uuid) TO service_role;

COMMIT;

RESET lock_timeout;

-- 参考（アプリ側・service-role のみ）:
--   const { data } = await service.rpc('allocate_transcript_seq', { p_interview_id })
--   data = 新しい seq（>=1） / data = null は対象 interview 不在。
