-- ============================================================================
-- p1_interview_transcripts.sql
--   Phase P1: 面接 Transcript（発話1件＝1行）の正規テーブル public.interview_transcripts を新設する。
--   発話（応募者 / AI面接官）を保存・順序付け・冪等取得し、将来の評価（EBCA）入力へ正規化できる基盤。
--   ※ 現 main（Production 基準点）から再構成した P1 版。schema + RLS + 明示 GRANT を 1 ファイルに統合。
--     旧 stack（PR #27/#48）を直接 merge せず、必要部分のみ現 main 上で再構成している。
--
-- 【重要 / 未適用】
--   * これは MIGRATION ではない。supabase/migrations には置かない（本番自動適用しない）。
--   * 手動実行専用（運用者が Supabase SQL Editor / psql で意図的に流す）。本ファイルは未実行。
--   * 本番=Preview 同一プロジェクトのため、適用＝本番反映。適用は承認後に行う。
--   * 追加のみ（additive）＝新テーブル1個の作成。既存 interviews / interview_logs /
--     applicants / interview_results 等には一切触れない。可逆（ROLLBACK で DROP TABLE）。
--   * 書き込みは将来 service-role API（PR-3B）経由のみ。anon/authenticated には INSERT/UPDATE/DELETE
--     の policy を与えない（RLS 有効化＋policy 無し＝既定 deny）。SELECT のみ company/admin に許可。
--
-- 設計判断（要点）:
--   - 保存レイアウト = 発話1件1行（utterance-per-row）。jsonb 一括より ordering / 冪等 / retry /
--     partial→final 更新 / RLS join / 評価入力に強い。
--   - Realtime の内部イベント構造（item_id / event 名）に強依存しない。冪等は汎用列 dedup_key に集約。
--     realtime_item_id 等が必要になっても dedup_key / metadata に載せる（列/主キーには昇格させない）。
--   - seq = 面接内の順序（サーバ採番）。表示・評価は seq 昇順。
--   - UNIQUE(interview_id, seq) は「付けない」。理由: 再送 / partial→final / server relay(#19) の採番競合で
--     seq 衝突が起こり得るが、それを UNIQUE で hard-fail させると発話をロスする。順序は sort で足り、
--     一意性は不要。冪等は dedup_key（下記の部分ユニーク）で担保する。seq には非ユニークな索引のみ。
--   - dedup_key は NULL 許容。NULL は「冪等キー無し」（synthetic/mock 等）。PostgreSQL の UNIQUE は
--     NULL を相異と見なし複数許容するため、冪等は「dedup_key IS NOT NULL のときだけ効く」部分ユニーク索引で表現する。
--   - FK interview_id → interviews(id) ON DELETE CASCADE: 面接を物理削除したら transcript も消す
--     （孤児 PII を残さない＝retention/削除の親子ライフサイクルに一致）。本アプリは面接を通常物理削除
--     しない（status 遷移）ため実発火は稀。将来の retention 削除でも「面接ごと削除」を素直に表現できる。
--
-- 適用前後の確認 / 巻き戻し（別ファイル・いずれも未実行）:
--   precheck : supabase/rls/pr3a_interview_transcripts_precheck.sql
--   postcheck: supabase/rls/pr3a_interview_transcripts_postcheck.sql
--   rollback : supabase/rls/pr3a_interview_transcripts_ROLLBACK.sql
--
-- 適用時の安全性:
--   * 新テーブル作成 = 既存テーブルへの ACCESS EXCLUSIVE 取得や rewrite は無い。
--   * FK 追加は参照先 interviews(id)（PK・索引済み）に対する検証のみで、新テーブルは空なので即時。
--     ただし FK は参照先 interviews に SHARE ROW EXCLUSIVE を一瞬取るため lock_timeout でガードする。
-- ============================================================================

-- ロック待ちで本番を止めないためのガード（取得できなければ即エラーで中断＝安全側）。
SET lock_timeout = '3s';

BEGIN;

CREATE TABLE IF NOT EXISTS public.interview_transcripts (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  interview_id uuid        NOT NULL REFERENCES public.interviews (id) ON DELETE CASCADE,
  speaker      text        NOT NULL,
  text         text        NOT NULL,
  seq          integer     NOT NULL,
  final        boolean     NOT NULL DEFAULT true,
  source       text        NOT NULL,
  dedup_key    text,
  language     text,
  metadata     jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at   timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT interview_transcripts_speaker_chk
    CHECK (speaker IN ('applicant', 'interviewer')),
  CONSTRAINT interview_transcripts_source_chk
    CHECK (source IN ('realtime', 'server', 'mock', 'synthetic')),
  CONSTRAINT interview_transcripts_seq_chk
    CHECK (seq >= 1),
  -- 暴走入力/巨大行の防御（1発話の上限。whisper 由来の1発話でこの長さを超えることは想定しない）。
  CONSTRAINT interview_transcripts_text_len_chk
    CHECK (char_length(text) <= 20000)
);

-- 順序付き取得（interview 単位で seq 昇順に読む）用の索引。UNIQUE ではない（seq 衝突を hard-fail させない）。
CREATE INDEX IF NOT EXISTS idx_interview_transcripts_interview_seq
  ON public.interview_transcripts (interview_id, seq);

-- 冪等（再送/重複受信で二重行を作らない）。dedup_key が有るときだけ (interview_id, dedup_key) を一意にする。
-- NULL（冪等キー無し = synthetic/mock 等）は複数許容する。→ 書込側は ON CONFLICT で upsert する（PR-3B）。
CREATE UNIQUE INDEX IF NOT EXISTS uq_interview_transcripts_interview_dedup
  ON public.interview_transcripts (interview_id, dedup_key)
  WHERE dedup_key IS NOT NULL;

-- ── RLS（初期から有効。書込は service-role のみ＝policy を与えない＝既定 deny）──────────────
ALTER TABLE public.interview_transcripts ENABLE ROW LEVEL SECURITY;

-- client 企業ユーザー: 自社の応募者に紐づく面接の transcript のみ SELECT 可
-- （interview → applicant → company を join。既存 company_select_* と同じ auth.uid()→profiles パターン）。
DROP POLICY IF EXISTS company_select_interview_transcripts ON public.interview_transcripts;
CREATE POLICY company_select_interview_transcripts ON public.interview_transcripts
  FOR SELECT TO authenticated
  USING (
    interview_id IN (
      SELECT i.id
        FROM public.interviews i
        JOIN public.applicants a ON a.id = i.applicant_id
       WHERE a.company_id IN (
         SELECT profiles.company_id FROM public.profiles WHERE profiles.id = auth.uid()
       )
    )
  );

-- admin / super_admin: 全社の transcript を SELECT 可（admin 応募者詳細の browser 直読み用・既存方針に合わせる）。
DROP POLICY IF EXISTS admin_select_interview_transcripts ON public.interview_transcripts;
CREATE POLICY admin_select_interview_transcripts ON public.interview_transcripts
  FOR SELECT TO authenticated
  USING (
    auth.uid() IN (
      SELECT profiles.id FROM public.profiles
       WHERE profiles.id = auth.uid()
         AND profiles.role IN ('admin', 'super_admin')
    )
  );

-- INSERT / UPDATE / DELETE の policy は「与えない」＝anon/authenticated からは不可。
-- 書き込みは service-role（RLS bypass）API（PR-3B）でのみ行う。anon には SELECT policy も無い＝一切不可。

-- ── 明示的 table privilege（ambient / default privilege に依存しない＝fresh Supabase へ移植可能）─────────
--   Supabase の default privilege は環境により new table へ SELECT/DML を自動付与しない場合があり、
--   その場合 RLS policy が正しくても authenticated は「permission denied」、service-role writer も INSERT 不可になる。
--   よって既存 auth_login_throttle と同じく REVOKE ALL + 明示 GRANT で権限を確定する（RLS が row isolation を担う）。
--     authenticated : SELECT のみ（company/admin policy 経由で自社/全社 row を読む。INSERT/UPDATE/DELETE 不可）。
--     anon          : 何も付与しない（SELECT/DML すべて不可）。
--     service_role  : SELECT/INSERT/UPDATE/DELETE（server-side writer=saveUtterance / reader=loader / retention）。RLS bypass。
--     PUBLIC        : 何も残さない（PUBLIC 経由の権限漏れを防ぐ）。
REVOKE ALL ON public.interview_transcripts FROM PUBLIC;
REVOKE ALL ON public.interview_transcripts FROM anon;
REVOKE ALL ON public.interview_transcripts FROM authenticated;
REVOKE ALL ON public.interview_transcripts FROM service_role;
GRANT SELECT ON public.interview_transcripts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.interview_transcripts TO service_role;

COMMIT;

RESET lock_timeout;
