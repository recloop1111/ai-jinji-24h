# R1 実接続チェックリスト（初回 OpenAI Realtime actual E2E）— Phase P9 で確定

R1 は「Realtime voice → Transcript → Evaluation → Persistence → Company UI」の**初回 actual E2E**。
1 回の meaningful なテストで可能な限り確認する。**実 SMS provider 接続は R1 の必須条件ではない**（内部固定検証で代替可）。

## Task 17 — R1 で確認する項目（1 回の E2E）
1. non-demo の controlled test company（社内テスト専用・allowlist）
2. applicant start（応募者フロー開始）
3. controlled SMS bypass / 内部固定検証（`is_demo` 固定 1234 or `SMS_FIXED_CODE_COMPANY_ID`。実 SMS 送信は必須にしない）
4. Realtime connection 確立（WebRTC/SDP-proxy）
5. AI first greeting（開始フロー・P7 `INTERVIEW_START_STEPS`）
6. 日本語 voice 品質（最終 voice 選定はここで判断）
7. question progression（snapshot 順・飛ばさない）
8. answer recognition（日本語音声認識）
9. follow-up（深掘りの自然さ・上限）
10. silence（server_vad の実タイミング・声かけ）
11. barge-in（割り込み時の停止品質）
12. reconnect（切断→復帰・現在質問位置保持）
13. complete guard（全質問完了までは complete させない・premature reject）
14. transcript ingestion（`TRANSCRIPT_INGEST_ENABLED` 有効化・書き込み）
15. transcript ordering（seq 連番・順序）
16. evaluation trigger（`OPENAI_EVALUATION_ENABLED` 有効化・EBCA writer）
17. EBCA evidence integrity（`{seq,quote}` が transcript に実在・hallucination なし）
18. result persistence（`interview_results` へ保存・冪等）
19. company applicant detail（企業画面で表示・500 なし）
20. transcript display（会話ログ 4 状態）
21. EBCA display（6軸・発話#seq・評価確度）
22. total score / null 挙動（null≠0・判断材料不足表示）
23. latency（応答遅延の体感）
24. actual cost（OpenAI Usage で実測・想定 ~¥2,000/60分 と照合）
25. cleanup（テストデータ削除・gate を OFF に戻す・env 撤去）

## Task 18 — Production 未適用 SQL の棚卸しと依存順
すべて `supabase/rls/`（手動 SQL・自動適用されない）。**本 PR では一切適用しない**。R1 実施時に順に手動適用。

| SQL | 内容 | R1 必要度 | 依存 |
|---|---|---|---|
| `p1_interview_transcripts.sql` | interview_transcripts テーブル + RLS | **R1 必須**（transcript 保存/表示） | なし（先頭） |
| `p2_transcript_seq_allocator.sql` | `allocate_transcript_seq` RPC（原子的 seq） | **R1 必須**（transcript 順序） | P1（テーブル）に依存 |
| `p5_evaluation_lock_state.sql` | interviews へ評価 lock/cooldown 列（additive） | **R1 必須**（評価 writer の lock/cooldown） | 独立（additive） |
| `p7_1_interview_progress.sql` | interviews.interview_progress jsonb（additive） | **R1 推奨**（サーバ権威進行）※最小 smoke なら in-memory 可 | 独立（additive） |
| `p8_otp_state.sql` | interviews.otp_state jsonb（additive） | **実 SMS 時のみ**（R1 は内部固定検証のため不要） | 独立（additive） |

**適用順（R1）**: `p1` → `p2`（P1 のテーブル前提）→ `p5`（独立）→（任意）`p7_1`。`p8` は実 SMS を繋ぐときのみ。
- すべて additive/可逆（各 `_ROLLBACK.sql` あり。P1/P2 は各ファイル内 ROLLBACK 節）。
- `phase_h_realtime_call_lock.sql`（realtime-call 多重呼び出しロック）は**既に本番適用済み**（追加適用不要）。

## Option B（SDP-proxy 信頼境界）— R1 controlled smoke の許容条件
既知 blocker: SDP-proxy 方式は接続後 client が `session.update` で instructions/tools を改変し得る
（`lib/openai/realtime.ts` の信頼境界コメント参照）。恒久対策 = server relay（Option B）。**P9 では実装しない**。

R1 の **controlled internal smoke** で許容する条件（すべて満たすこと）:
- non-demo の**社内テスト専用企業に限定**（実応募者を通さない）
- `OPENAI_REALTIME_COMPANY_IDS` **allowlist で 1 社のみ**許可
- **一般公開しない**（public exposure しない・応募者募集に使わない）
- すべての gate は **default OFF**（`OPENAI_REALTIME_ENABLED` / `TRANSCRIPT_INGEST_ENABLED` / `OPENAI_EVALUATION_ENABLED` を R1 の間だけ一時 ON）
- **テスト後は即 OFF**（env 撤去・allowlist 解除）
- demo/テスト企業ガード・`is_demo` 禁止は維持

**判定（P9 最終）**: 上記条件下の 1 社限定 controlled smoke であれば、Option B の完成を R1 の**前提 blocker としない**
（改変し得るのは社内テスターの管理下 1 セッションのみで、実応募者・課金の濫用面がない）。
ただし **一般応募者への公開（general availability）は Option B 完成を必須 blocker とする**。よって順序は
「R1 controlled smoke（Option B 前）→ 結果を見て Option B 実装 → 一般公開」。R1 前倒しで Option B を先に作る必要はない。
