# R1-B 実行 Runbook（初回 OpenAI Realtime actual E2E）

R1-A（runtime wiring preflight・OpenAI actual 0）完了後に実施する **初回有料 actual test** の手順。
R1-B 中に設計判断をしなくてよいよう、事前に確定する。**本 runbook 自体は Production を変更しない**（手順書）。

## Task 12 — Gate Matrix（すべて default OFF・fail-closed）
| gate / env | 用途 | R1-B | OFF 時の保証 |
|---|---|---|---|
| `OPENAI_REALTIME_ENABLED` | Realtime SDP/session 発行 | `true`（R1中のみ） | realtime-call/session が 503（OpenAI 未呼出・¥0） |
| `OPENAI_REALTIME_COMPANY_IDS` | Realtime allowlist（1社のみ） | test company id | 空/不一致は非許可（is_demo は常に禁止） |
| `OPENAI_REALTIME_MODEL` | Realtime model | 任意（既定 gpt-realtime） | 不正値は既定へ |
| `OPENAI_API_KEY` | OpenAI 認証（Realtime/Evaluation 共通） | 設定 | 未設定は evaluation provider=null・Realtime 発行不可 |
| `TRANSCRIPT_INGEST_ENABLED` | transcript 保存 route | `true`（R1中のみ） | `/transcript` が 503（DB 未到達・sender は disabled 扱いで no-op） |
| `OPENAI_EVALUATION_ENABLED` | EBCA 評価トリガー | `true`（R1中のみ） | `/api/internal/evaluate` が 503（provider 未構築・OpenAI 未呼出） |
| `OPENAI_EVALUATION_MODEL` | 評価 model | 設定 | 未設定は provider=null（model_missing） |
| `INTERNAL_BATCH_SECRET` | 評価トリガー route 認証 | 既設 | 未設定は fail-closed（401） |
| `SMS_PROVIDER_ENABLED` | 実 SMS provider | **OFF 維持**（R1 は内部固定検証） | provider=null（実送信 0） |

**gate OFF での不変条件（R1-A test で固定）**: Realtime call 0 / Transcript write 0 / Evaluation provider call 0 / SMS send 0。
demo 企業（`is_demo=true`）は全経路で禁止（変更しない）。

## Task 13 — Controlled test company 要件
- `is_demo = false`（**既存 demo「テスト株式会社」を Realtime 対象にしない**・変更しない）
- 専用の company id（R1 専用に作成 or 既存の非公開社内企業）
- `OPENAI_REALTIME_COMPANY_IDS` に **その 1 社のみ**
- 外部公開しない（応募者募集・URL 共有をしない）
- SMS は内部固定検証（`is_demo` の 1234 は使わない＝non-demo のため。`SMS_FIXED_CODE_COMPANY_ID` にこの test company を一時指定して固定コード検証を通す／または内部で applicant+token を用意）。実 SMS 送信はしない。
- **actual test 終了後、allowlist から即解除**

## Task 14 — Production 未適用 SQL（R1-B 適用対象・依存/rollback/verification）
すべて `supabase/rls/`（手動 SQL・自動適用されない）。**R1-A では適用しない**。

| 適用順 | SQL | R1-B 必要度 | rollback | verification query |
|---|---|---|---|---|
| 1 | `p1_interview_transcripts.sql` | **必須** | ファイル内 ROLLBACK 節 | `select to_regclass('public.interview_transcripts');`（非 null） |
| 2 | `p2_transcript_seq_allocator.sql` | **必須**（P1 前提） | ファイル内 ROLLBACK 節 | `select proname from pg_proc where proname='allocate_transcript_seq';` |
| 3 | `p5_evaluation_lock_state.sql` | **必須** | `p5_evaluation_lock_state_ROLLBACK.sql` | `select column_name from information_schema.columns where table_name='interviews' and column_name in ('evaluation_locked_until','evaluation_status','evaluation_retry_after');` |
| 4 | `p7_1_interview_progress.sql` | **必須へ格上げ**（server-authoritative progress を R1-B で検証するため。serverless で in-memory を SoT にできない） | `p7_1_interview_progress_ROLLBACK.sql` | `select column_name from information_schema.columns where table_name='interviews' and column_name='interview_progress';` |
| — | `p8_otp_state.sql` | **不要**（R1 は実 SMS を使わない） | `p8_otp_state_ROLLBACK.sql` | — |

**rollback 順**（適用の逆・原則 additive は不具合が無ければ即 rollback しない）: p7_1 → p5 → p2 → p1。
`phase_h_realtime_call_lock.sql` は既に本番適用済み（追加不要）。

## Task 15 — R1-B exact runbook（A–T）
- **A. 事前バックアップ/確認**: Supabase バックアップ、現行 env スナップショット、main HEAD 記録
- **B. SQL 適用**: 上表の順 1→4（p1→p2→p5→p7_1）
- **C. SQL verification**: 上表の verification query を各実行
- **D. non-demo test company 確認**: `is_demo=false`・専用 id・URL 非公開
- **E. OpenAI Billing/API Key**: OpenAI project に月次ハードキャップ設定 + API Key 発行（`OPENAI_API_KEY`）
- **F. env 設定**: `OPENAI_EVALUATION_MODEL` / `OPENAI_REALTIME_MODEL`（任意）
- **G. allowlist**: `OPENAI_REALTIME_COMPANY_IDS = <test company id>`
- **H. gates**: `OPENAI_REALTIME_ENABLED=true` / `TRANSCRIPT_INGEST_ENABLED=true` / `OPENAI_EVALUATION_ENABLED=true`（SMS_PROVIDER_ENABLED は OFF 維持）
- **I. deploy**: env 反映（redeploy）
- **J. preflight**: `lib/interview/realtime-preflight.ts` の facts を service-role で確認（READY / BLOCKED code）
- **K. actual interview 1 回**: test applicant で開始→AI 挨拶→質問→回答→follow-up→complete
- **L. Transcript 確認**: `interview_transcripts` に seq 連番で AI/応募者発話が保存（speaker/source=realtime・server 権威）
- **M. Progress 確認**: `interviews.interview_progress` の currentIndex/completedCount 進行・premature complete が弾かれる
- **N. Evaluation 確認**: `POST /api/internal/evaluate`（INTERNAL_BATCH_SECRET）→ `interview_results` に EBCA 保存・evidence が transcript 実在
- **O. Company UI 確認**: 企業応募者詳細で会話ログ + EBCA（発話#seq・評価確度・null≠0）が 500 なく表示
- **P. cost 確認**: OpenAI Usage で実コスト（想定 ~¥2,000/60分 と照合）
- **Q. logs 確認**: エラー/PII 漏洩なし・secret 非出力
- **R. gates OFF**: 3 gate を false（or 削除）
- **S. allowlist 解除**: `OPENAI_REALTIME_COMPANY_IDS` を空/削除
- **T. cleanup**: test interview/transcript/result のテストデータ整理・env スナップショットへ戻す

## Task 16 — Rollback runbook（actual 失敗時）
1. **gate OFF**（最優先）: `OPENAI_REALTIME_ENABLED` / `TRANSCRIPT_INGEST_ENABLED` / `OPENAI_EVALUATION_ENABLED` を false → 即 OpenAI 停止・¥0
2. **allowlist 解除**: `OPENAI_REALTIME_COMPANY_IDS` を空
3. **env rollback**: API Key/model を撤去（必要時）
4. **SQL rollback**: **原則しない**（additive 列/テーブルは NULL 既定で既存挙動に無害）。データ破損等の明確な不具合時のみ上記 rollback 順で実行
5. **test data cleanup**: test company の interview/transcript/interview_results を削除
- 判断基準: gate OFF で被害は止まる（課金/接続は即停止）。additive SQL は「消すと再適用コスト＞放置リスク」のため、実害が無ければ据え置き。

## Task 17 — Option B 境界（変更なし）
Option B（server relay）は R1-A でも実装しない。R1-B は controlled internal smoke（non-demo test company 1社 / allowlist / gate 通常 OFF / 短時間のみ ON / 外部公開しない / 終了後 OFF）で実施。
**runtime wiring による Option B との新規設計衝突なし**: transcript は server 権威 ingest（client の speaker/source/seq を信用しない）、progress は server 権威 reducer + interview_progress、evaluation は internal route + provider fail-closed。いずれも「client/LLM を SoT にしない」方向で Option B（供給 transport の信頼化）と同方向。一般公開は Option B 完成を必須 blocker とする。
