# AI面接官 挙動仕様（Interview Behavior Specification）— Phase P7

OpenAI Realtime を**初めて実接続する前**に、AI面接官の会話挙動を可能な限り決定論的に固定するための仕様。
実 OpenAI 呼び出しは R1 まで **0**。本書は `lib/interview/conversation-policy.ts`（SoT・純ロジック）と
`lib/openai/realtime.ts`（instructions builder）を人間可読にまとめたもの。

## SoT（唯一の権威）の所在
| 項目 | SoT |
|---|---|
| 基本原則 / トーン / 開始フロー / 禁止トピック | `lib/interview/conversation-policy.ts` |
| 回答分類（A–J）と次アクションの決定論 | `conversation-policy.ts` `reduceInterview()` |
| 深掘り上限 | `REALTIME_MAX_FOLLOWUPS`（`lib/config/openai.ts`）＝ `MAX_FOLLOWUPS_PER_QUESTION` ＝ `DEEP_DIVE_MAX_PER_QUESTION` |
| 面接時間 / 質問上限 | `lib/config/interview-policy.ts`（`MAX_INTERVIEW_SECONDS` / `MAX_TOTAL_QUESTIONS` 等） |
| 実 OpenAI 多重呼び出し防止ロック | `interviews.realtime_call_locked_until`（`realtime-call-lock.ts`・TTL 65分・fail-closed・適用済み） |
| 完了確定（サーバ権威） | `POST /api/interview/[slug]/end`（`status='in_progress'` 条件付き UPDATE・冪等） |

## 基本原則（Task 2）
1問ずつ / 回答完了を待つ / 途中で次を聞かない / snapshot 順 / 同一質問を繰り返さない /
回答を補完しない / 誘導しない / 模範解答を教えない / 面接官が話しすぎない / 過剰にフレンドリーにしない。

## トーン（Task 16・voice/画像は P9）
敬語 / 簡潔 / 中立 / 相槌控えめ / 感情過多禁止 / 人格否定しない / 評価を本人に漏らさない。

## 開始フロー（Task 3）
挨拶 → お礼 → 所要時間の目安 → 聞き取りづらい時は伝えてよい旨 → 準備確認 → 最初の本質問。
`reduceInterview(state, {kind:'start'})` は「挨拶〜Q1提示」を 1 ターン（`GREET`, `askIndex:1`）として返す。

## 回答分類（Task 4）と次アクション（決定論）
| 分類 | 意味 | 次アクション |
|---|---|---|
| sufficient (A) | 十分 | `ASK_NEXT`（深掘りしない） |
| too_short (B) | 短すぎ | `FOLLOW_UP`（上限内）→上限で `ASK_NEXT` |
| vague (C) | 曖昧 | `CLARIFY`（具体例要求・上限内）→上限で `ASK_NEXT` |
| no_answer (D) | 無回答 | `REPROMPT`（上限内）→上限で `ASK_NEXT` |
| inaudible (E) | 聞き取れない | `REPROMPT`（勝手に補完しない） |
| off_topic (F) | 無関係 | `REDIRECT`（追及しない・上限で次へ） |
| reverse_question (G) | 逆質問 | `ANSWER_REVERSE_QUESTION`（登録情報の範囲で誠実に→質問へ戻る・index進めない） |
| too_long (H) | 長い（情報十分） | `ASK_NEXT`（AIは長く話さない） |
| inappropriate (I) | 不適切/攻撃的 | `REDIRECT`（丁寧に戻す・エスカレートしない） |
| refusal (J) | 回答拒否 | `ASK_NEXT`（執拗に聞かない） |

> 実際の意味分類（NLP 精度）は R1 で確認。P7 では「分類集合」と「各分類→次アクション」のみ固定（独自 NLP は作らない）。

## 深掘り（Task 5）
トリガー: 抽象的 / 具体例なし / 役割不明 / 結果不明 / 理由不明。
上限 = `MAX_FOLLOWUPS_PER_QUESTION`（=2）。上限到達で言い換え反復せず次へ。十分回答/拒否は深掘りしない。

## 沈黙（Task 6・server_vad 実挙動は R1）
`< SILENCE_PROMPT_AFTER_MS(8s)`=通常待機(`WAIT`・考え中)。超過で一度だけ `REPROMPT`。
`SILENCE_MAX_PROMPTS(2)` 到達で保留して次へ。勝手に回答完了と決めない。

## Interruption / barge-in（Task 7）
応募者が AI 発話中に話し始めたら常に `STOP_AND_LISTEN`（発話停止・応募者優先・index/followups は変えない＝
質問の二重送信/再生ループを防ぐ）。実 barge-in 品質は R1。

## 逆質問（Task 8）
company/job の**登録済み情報の範囲でのみ**回答。無い情報は**捏造せず**「確認のうえ採用担当より連絡」等 honest response。
その後、面接の質問へ戻る。

## 禁止トピック（Task 9・P4 bias guard と整合）
宗教/政治/家族計画/妊娠/性的指向/健康/人種/民族/本籍/思想団体 等を面接官から**能動的に聞かない**。
応募者が自ら話しても評価誘導に使わない（評価側は `FORBIDDEN_EVAL_KEYS` で strip 済み）。

## 時間・質問上限（Task 10）
`MAX_INTERVIEW_SECONDS(3600)` 到達で `END_EARLY_SAFE`（正常完了ではない）。質問上限は既存 SoT を再利用（重複定数なし）。

## 終了条件（Task 11）
- 正常: 全質問完了→`CLOSE`→（全問終了後の）`complete_tool`→`FINISH`（`completed=true`）。
- 時間上限 / 応募者終了要求: `END_EARLY_SAFE`（`completed=false`・正常完了と区別）。
- 異常（切断/再接続上限超）: `ABORT`（`aborted=true`・正常完了と誤認しない）。
- 質問未完了での `complete_tool`: `IGNORE_PREMATURE_COMPLETE`（早すぎる完了を弾く）。

## Reconnect（Task 12）
`MAX_RECONNECT_ATTEMPTS(3)` 内は現在質問位置から `RESUME`（snapshot 不変・大量再送しない）。超過で `ABORT`。
**完了済み面接は再開しない**（`FINISH` を返す＝二重セッション/再課金防止）。実 OpenAI 多重呼び出しは
`realtime-call-lock`（fail-closed）で 1 面接 1 セッションに制限済み。

## Instructions builder（Task 13）
`buildRealtimeInstructions()` は巨大自由文ではなく、SoT（原則/トーン/禁止トピック/逆質問誠実性/完了規則）から
構造化して生成する。**本書の時点で actual API へは送信しない**。

## Tool / complete guard（Task 14・現状）
- `complete_interview` は「シグナル」。**完了の権威はサーバ `/end`**（`in_progress` 条件付き UPDATE＝冪等・二重確定防止）。
- クライアント/LLM が勝手に確定できない（`/end` が唯一の状態確定経路）。課金は server-side 純ロジック `lib/billing/interview-eligibility.ts`（completed必須／applicant_exit条件付き／旧「duration>600s」は廃止・superseded）。duration は server 算出（started_at 由来）。
- **既知の制約（P2・Realtime OFF のため非露出）**: SDP-proxy 方式では接続後 `session.update` を client が改変可能
  （`lib/openai/realtime.ts` の信頼境界コメント参照）。恒久対策 = server relay（Option B）。本番 Realtime 有効化の blocker。
- **既知のギャップ（将来）**: realtime 中の「質問到達 index」をサーバが追跡していない（`questionProgress` は realtime で
  index 不確定）。`reduceInterview` は premature complete を弾くが、サーバ側の question-progression 追跡は未実装（R1/後続）。

---

## R1 チェックリスト（Task 17）— mock で保証済み vs actual でしか確認できない

### ✅ mock/pure test で保証済み（本 PR）
- 回答分類 → 次アクションの決定論（`reduceInterview` 20 fixtures）
- 深掘り上限で停止・言い換え反復しない
- 沈黙 prompt 上限・その後の次へ移行
- barge-in で STOP_AND_LISTEN・index 不変
- 逆質問で index を進めない
- 時間上限 / 応募者終了 → END_EARLY_SAFE（正常完了と区別）
- 切断 → ABORT / 再接続 → RESUME / 上限超 → ABORT / 完了面接は再開しない
- premature complete を弾く
- 禁止トピックが SoT に含まれ P4 protected と整合
- instructions が SoT から構造化生成される（送信はしない）
- 定数の非重複（深掘り上限が単一 SoT）

### 🔴 R1 の実スモークでしか確認できない（本 PR では保証不可）
- 音声品質 / TTS の自然さ
- レイテンシ（応答遅延）
- `server_vad` の実発話区切りタイミング（沈黙 ms の実挙動）
- 実際の沈黙検知・barge-in の中断品質
- LLM の instruction 追従度（原則/禁止トピック/逆質問誠実性を実際に守るか）
- 深掘りの自然さ（意味的に適切な follow-up か）
- 日本語（および多言語）音声認識精度
- `complete_interview` tool call の実発火タイミング
- 接続後 `session.update` 改変の実挙動（信頼境界・Option B の要否確認）

> R1 は「1社限定・短時間・低コスト・即OFF可能」（`realtime-preflight.ts`）で開始し、上記赤字を実測する。

---

## P7.1 — Server-authoritative Interview Progress（追補）

Realtime の AI/LLM や client を進行状態の SoT にしない。サーバが検証できる最小の状態機械を追加。

### SoT
- `lib/interview/interview-progress.ts` — `InterviewProgressState`（serializable・PII 無し）＋
  `applyProgressEvent(state,event)` reducer ＋ `evaluateCompletionRequest(state,{reason})` premature guard ＋
  reconnect（`restoreProgress`/`canResume`/`resumeIndex`）＋ `InterviewProgressStore`（楽観ロック interface）。
- 永続化: `interviews.interview_progress jsonb`（additive・1列・**Production 未適用**。`supabase/rls/p7_1_interview_progress.sql`(+ROLLBACK)）。
  既存列で代替不可（questions_snapshot=不変リスト / seq=発話単位 / status=粗い）。

### 不変条件（テスト固定）
- index は `ADVANCE` でしか +1（N→N+2 へ飛べない）。未回答質問は ADVANCE 不可。
- `COMPLETE` は `completedCount >= totalQuestions` のときだけ正常完了。未完了は `rejected_premature`（AI/client の早すぎる complete を弾く）。
- eventId 冪等（ADVANCE/COMPLETE の再送で二重加算/二重完了しない）。version 楽観ロック（並行更新は片方 conflict）。
- client 由来 index/count/complete を state に代入しない。別 interviewId の event は `rejected_interview_mismatch`（spoof の 1 層）。
- 早期終了（applicant_end/time_limit=early_ended、fatal/retry_exhausted=aborted）は正常完了(completed)と区別。
- 完了/異常終了は `canResume=false`（再開しない＝二重セッション/再課金防止）。reconnect は `resumeIndex` で 0 に戻らない。

### 完了権威 / 認可
- 状態確定の最終権威はサーバ（`/end` の in_progress 条件付き UPDATE＝冪等）。progress reducer は「completed か early か premature か」を判定して `/end` の final_status を決める材料になる。
- 認可（company/applicant/interview/token）は既存 route 層を維持（progress SoT は interview-scoped）。

### R1 wiring interface（本 PR では未結線）
```
Realtime normalized event → applyProgressEvent(state, event)
  → (COMPLETE 時) evaluateCompletionRequest → 正常/early/premature
  → InterviewProgressStore.save(state, expectedVersion)  // 楽観ロック
  → /end（final_status = completed | cancelled）
```
巨大実装を R1 に残さない。R1 は「正規化イベントの供給」と「store の Supabase adapter（実証済み CAS SQL から実装）」を結線するのみ。

### Option B（server relay）との整合
progress reducer は「正規化イベントの供給元」に非依存。Option B（サーバがメディア経路に入り正規化イベントを emit）でも、
transcript-ingestion 経由でも、同じ `ProgressEvent` を消費する。Option B は本 reducer を**供給する transport**であり、
reducer は**その上の検証層**＝設計衝突なし。SDP-proxy 信頼境界（一般公開前 blocker）は本 PR の対象外で、変更しない。
