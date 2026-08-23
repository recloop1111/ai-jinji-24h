-- ============================================================================
-- pr19c_allocate_transcript_seq_fn.sql  （草案 / 未適用 / CANONICAL seq migration）
--   PR-19C: transcript の server-authoritative 採番を「単一文 atomic UPDATE」を包む
--   PostgreSQL function public.allocate_transcript_seq(uuid) として提供する。
--   アプリは service-role の supabase.rpc('allocate_transcript_seq', { p_interview_id }) で呼ぶ。
--
-- 【CANONICAL / P2-2 整理（PR-19F）】
--   * 本ファイルが seq 採番機能の CANONICAL migration（列 next_transcript_seq ＋ 採番 function を自己完結で作成）。
--   * 旧 pr19b_interviews_transcript_seq*.sql（列のみを作る草案）は本ファイルに統合され SUPERSEDED＝削除済み。
--     → 本番適用は pr3a → 本ファイル(pr19c) → pr4e3 の 3 本だけで成立する。
--     → rollback も pr4e3 → 本ファイル(pr19c) → pr3a で成立（本 rollback が function ＋ 列 を両方 DROP）。
--
-- 【重要 / 未適用】
--   * これは MIGRATION ではない。supabase/migrations には置かない（本番自動適用しない）。
--   * 手動実行専用（運用者が Supabase SQL Editor / psql で意図的に流す）。本ファイルは未実行。
--   * 本番=Preview 同一プロジェクトのため、適用＝本番反映。適用は承認後に行う。additive のみ・可逆。
--
-- なぜ RPC か:
--   PostgREST の .update({col: value}) は「リテラル代入」しか表現できず col = col + 1 を表現できない。
--   よって atomic increment を単一文 SQL として function に閉じ込め、service-role の rpc で呼ぶ
--   （既存 auth_throttle_* と同じ「原子的 function 経由」パターン）。SELECT→UPDATE 2段 / MAX(seq)+1 は使わない。
--
-- security 方針（PR-19F・P1-1 解消）: SECURITY DEFINER を採用（旧 SECURITY INVOKER から変更）。
--   * 理由: 採番の実行を service_role の「interviews への直接 UPDATE grant」に依存させない（＝P1-1 の
--     「未検証の前提」を precheck で確認するのではなく、DEFINER で前提そのものを排除する）。将来 interviews の
--     grant が変わっても採番が壊れない。既存 auth_throttle_*（service_role 専用の原子的 function）と同一の
--     セキュリティパターンに揃える（一貫性）。
--     ※ 参考: service_role は現状 interviews を直接 UPDATE できる（/end route が本番で UPDATE 済み）。
--        よって INVOKER でも動くが、依存を明示的に排除する DEFINER をより安全・明示的として採用する。
--   * 昇格面は極小: 引数は p_interview_id uuid のみ・本体は「interviews の counter を +1 する固定 UPDATE 1 文」
--     のみ・dynamic SQL 不使用（SQLi 余地なし）・owner 権限で任意 interview の counter を +1 できるだけ（gap は
--     許容＝無害）。EXECUTE は service_role のみ（PUBLIC/anon/authenticated から REVOKE）でブラウザから呼べない。
--   * SET search_path = ''（DEFINER で必須の hijack 対策）＋本体は public.interviews を完全修飾で参照。
--   * function owner = 本ファイルを実行する特権ロール（Supabase では postgres/supabase_admin）。anon/authenticated
--     が owner にならないこと（owner が interviews を UPDATE できる特権を持つことが DEFINER 実行の前提）。
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

-- 1) 採番 counter 列（自己完結・冪等）。DEFAULT 0 → post-increment で first = 1。
ALTER TABLE public.interviews
  ADD COLUMN IF NOT EXISTS next_transcript_seq integer NOT NULL DEFAULT 0;

-- 2) 採番 function（単一文 atomic UPDATE を包む）。SECURITY DEFINER（PR-19F: service_role の
--    interviews 直接 UPDATE grant に依存させない・auth_throttle_* と同一パターン）。search_path='' 必須。
CREATE OR REPLACE FUNCTION public.allocate_transcript_seq(p_interview_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
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
