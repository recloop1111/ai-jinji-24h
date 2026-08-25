-- ============================================================================
-- p2_transcript_seq_allocator.sql
--   Phase P2: 面接内 Transcript の seq を server-side で安全採番する基盤。
--     (1) interviews.next_transcript_seq（面接ごとの採番カウンタ・additive 列）
--     (2) public.allocate_transcript_seq(uuid)（原子的 +1 採番の SECURITY DEFINER RPC）
--   ※ 現 main から再構成（旧 pr19b/pr19c/pr19f を直接 merge せず、security を再監査して統合）。
--
-- 【重要 / 未適用】
--   * MIGRATION ではない（supabase/migrations に置かない＝本番自動適用しない）。手動実行専用・未実行。
--   * Production 適用は別承認。local Supabase でのみ適用・検証する。
--   * additive（列1個追加＋関数1個）＝既存挙動非変更・可逆（ROLLBACK で関数 DROP＋列 DROP）。
--
-- security 方針（race / injection / authz / 権限）:
--   * 採番は「単一文の atomic UPDATE ... RETURNING」。行ロックで直列化され、並行呼び出しでも seq 重複なし
--     （gap は許容＝無害。UNIQUE(interview_id,seq) は張らない設計＝P1 と整合）。
--   * SECURITY DEFINER: 採番を service_role の「interviews への直接 UPDATE grant」に依存させない
--     （grant 構成が変わっても採番が壊れない）。owner 権限で対象 interview の counter を +1 するだけ。
--   * SET search_path = ''（DEFINER で必須の search_path hijack 対策）＋本体は public.* を完全修飾で参照。
--   * dynamic SQL 不使用＝SQL injection の余地なし。引数は uuid 型（型で不正入力を弾く）。
--   * EXECUTE は service_role のみ（PUBLIC/anon/authenticated から REVOKE）＝ブラウザ/anon から呼べない。
--     cross-company/spoof は「呼び出し側 route が company→applicant→interview を server 解決してから
--     この RPC に interview_id を渡す」ことで担保（RPC 自体は与えられた interview の counter を進めるだけ）。
--   * function owner = 本ファイルを流す特権ロール（Supabase では postgres/supabase_admin）。
--     anon/authenticated が owner にならないこと（DEFINER 実行の前提）。
-- ============================================================================

SET lock_timeout = '3s';

BEGIN;

-- (1) 面接ごとの採番カウンタ（additive・既定 0）。
ALTER TABLE public.interviews
  ADD COLUMN IF NOT EXISTS next_transcript_seq integer NOT NULL DEFAULT 0;

-- (2) 原子的 +1 採番 RPC。返り値 = 新しい seq（>=1）。存在しない interview_id は 0 行更新→NULL 返却。
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
  RETURN v_seq; -- 対象なし → NULL（呼び出し側で失敗として扱う）
END;
$$;

-- EXECUTE 権限を service_role のみに絞る（ブラウザ/anon/authenticated からは呼べない）。
REVOKE ALL ON FUNCTION public.allocate_transcript_seq(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.allocate_transcript_seq(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.allocate_transcript_seq(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.allocate_transcript_seq(uuid) TO service_role;

COMMIT;

RESET lock_timeout;
