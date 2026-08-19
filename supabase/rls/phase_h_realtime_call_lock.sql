-- ============================================================================
-- phase_h_realtime_call_lock.sql
--   Phase H: AI音声面接（OpenAI Realtime）の realtime-call エンドポイントに対する
--   「同一 interview あたりの多重 OpenAI 呼び出し（並列/連打）」を防止するための
--   短時間TTLロック列を interviews に追加する（Codex P1-2 対応）。
--
-- 【重要】
--   * これは MIGRATION ではない。supabase/migrations には置かない（本番自動適用しない）。
--   * 手動実行専用（運用者が Supabase SQL Editor / psql で意図的に流す）。本ファイルは未実行。
--   * 本番=Preview 同一プロジェクトのため、適用＝本番反映。適用は承認後に行う。
--   * DROP/破壊操作は無い。NULL 許容の列を1本足すだけ（既存行・既存挙動に非影響）。
--
-- 背景 / 問題（P1-2）:
--   有効な capability token を持つ応募者は、interview が in_progress の間、
--   /api/interview/[slug]/realtime-call へ offer を無制限に POST でき、受理ごとに
--   有料 OpenAI /v1/realtime/calls が呼ばれる。月間上限は interview レコード数を数える
--   ため、同一 interview で多数の課金セッションを同時に張れてしまう。
--
-- 設計:
--   - interviews.realtime_call_locked_until (timestamptz, NULL 許容) を追加。
--   - ルート（app/api/interview/[slug]/realtime-call/route.ts）は OpenAI fetch の前に
--     単一の条件付き UPDATE で原子的にロックをクレームする（serverless インスタンス跨ぎでも
--     DB 行ロックで実効。process-local Map では不可）:
--
--       UPDATE interviews
--          SET realtime_call_locked_until = now() + interval '65 minutes'  -- = 面接最大60分 + 5分バッファ
--        WHERE id = :interview_id
--          AND status = 'in_progress'
--          AND (realtime_call_locked_until IS NULL OR realtime_call_locked_until < now())
--       RETURNING id;
--
--     - 1行返る = ロック取得 → OpenAI 呼び出しへ続行。
--     - 0行 = 別セッションが保持中 → 409（呼び出し側はモックへフォールバック）。
--   - ロック寿命（重要 / Codex P1-2 追撃対応）: Realtime セッションは最大60分続くため、TTL は
--     「面接最大長 + バッファ = 65分」に設定してセッション寿命をまたいで保持する（短TTLだと失効後に
--     2本目の並行セッションを張れてしまう）。正常終了時は /api/interview/[slug]/end が本列を NULL に
--     戻してロックを解放し、正当な次セッションを即許可する。/end 未送信で離脱した場合も65分TTLで自動失効
--     （＝永久禁止にならない）。応募者のリロード等は /start が新しい interview 行（別id）を作るため、
--     stale なロックが新セッションを妨げることはない。
--   - コード側は本列が未適用でも安全（fail-open）: claim/解放の UPDATE がエラー（列なし）なら阻害せず
--     続行する。本 SQL 適用をもってロックが有効化される（段階ロールアウト）。
--   - RLS: 本列は service-role（RLS bypass）からのみ書かれる。anon/authenticated への
--     追加 grant/policy は不要（realtime-call / end は service-role で実行）。
--
-- 適用前後の確認 / 巻き戻し（別ファイル・いずれも未実行）:
--   precheck : supabase/rls/phase_h_realtime_call_lock_precheck.sql
--   postcheck: supabase/rls/phase_h_realtime_call_lock_postcheck.sql
--   rollback : supabase/rls/phase_h_realtime_call_lock_ROLLBACK.sql
--
-- ロールバック（要約）:
--   ALTER TABLE public.interviews DROP COLUMN IF EXISTS realtime_call_locked_until;
--
-- 適用時の安全性:
--   * NULL 許容・DEFAULT 無しの列追加は PostgreSQL 11+ では「メタデータのみ」の変更で、
--     テーブル書き換え（rewrite）や既存行の更新は発生しない（大テーブルでも一瞬）。
--   * ただし ADD COLUMN は一時的に ACCESS EXCLUSIVE ロックを取るため、interviews に対する
--     長時間トランザクションが居ると、その後ろで待たされ後続クエリを一時停止させ得る。
--     これを避けるため lock_timeout を短く設定し、取得できなければ即失敗（安全側）にする。
--     失敗したら空いている時間帯に再実行すればよい（IF NOT EXISTS で冪等）。
-- ============================================================================

-- ロック待ちで本番を止めないためのガード（取得できなければ即エラーで中断＝安全側）。
SET lock_timeout = '3s';

ALTER TABLE public.interviews
  ADD COLUMN IF NOT EXISTS realtime_call_locked_until timestamptz;

RESET lock_timeout;

-- 期限切れロックの整理は不要（クレーム時に「NULL or < now()」で上書きするため放置で安全）。
-- 任意で失効行の可視化を軽くするための部分インデックス（無くても機能する・任意・現状は付けない）:
-- CREATE INDEX IF NOT EXISTS idx_interviews_realtime_lock
--   ON public.interviews (realtime_call_locked_until)
--   WHERE realtime_call_locked_until IS NOT NULL;
