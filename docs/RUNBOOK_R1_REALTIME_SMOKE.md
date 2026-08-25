# Runbook: Phase R1 — OpenAI Realtime 実スモーク（1社限定・短時間・低コスト・即OFF）

本 Runbook は AIMEN24 Production で**初めて OpenAI Realtime を実接続**する 1 回の検証手順。
ゴール = 「自社テスターが実ブラウザ・実マイクで 1 セッションだけ音声面接を成立させ、即 OFF に戻す」。

> ⚠️ **公開前 blocker（必読）**: SDP-proxy 方式には既知の信頼境界の限界がある（`lib/openai/realtime.ts` 参照）。
> 接続確立後、音声/イベントは browser↔OpenAI の P2P であり、悪意あるクライアントは `session.update` /
> `response.create` で instructions / tools / tool_choice を改変し得る（変更不可は voice/model のみ）。
> **R1（自社テスターの管理下 1 セッション）では許容**だが、**一般応募者への公開は恒久対策
> （server relay / Option B, `docs/REALTIME_SESSION_TRUST_DESIGN.md`）の完了を必須 blocker とする。**
> preflight は READY でも常に `TRUST_BOUNDARY_SDP_PROXY_PUBLIC_LAUNCH_BLOCKER` を warning で提示する。

---

## 前提（コード側・確認済み）
- Realtime SDP-proxy 基盤は **main に搭載済み・gate OFF（¥0）**。`app/api/interview/[slug]/realtime-call` / `realtime-session`。
- gate は厳格 `OPENAI_REALTIME_ENABLED === 'true'`。未設定/他値は OFF＝OpenAI 未呼び出し。
- `OPENAI_API_KEY` 未設定なら fail-closed（503・呼び出さない）。キーは response/log に出さない。
- **demo 企業（`is_demo=true` / DEMO_COMPANY_ID）は Realtime 構造的に禁止**（`isCompanyAllowed`）。
- 使用モデルは `OPENAI_REALTIME_MODEL`（許可候補 `gpt-realtime` / `gpt-realtime-2`、既定 `gpt-realtime`）。不正値は既定へ。
- 多重呼び出し防止ロック `interviews.realtime_call_locked_until`（TTL 65分＝面接60分+5分）。
- preflight（副作用ゼロ純関数）: `lib/interview/realtime-preflight.ts` `evaluateRealtimeSmokePreflight`。

---

## STEP 1 — OpenAI API Billing を有効化
OpenAI プラットフォームで課金を有効化し、Realtime API が利用可能な組織/プロジェクトを用意する。

## STEP 2 — Realtime 対応 API key を作成
Realtime（`/v1/realtime/calls`）を許可する API key を作成。**key の値は Vercel Production env にのみ置き、repo/log/PR に書かない。**

## STEP 3 — Realtime smoke 専用の「非 demo」テスト企業を1社用意
- Production 上に **本番挙動確認専用のテスト企業を1社**作成（通常顧客企業ではない）。
- **`is_demo = false` とする**。理由: demo 企業は Realtime を構造的に禁止しているため（`is_demo=true` だと必ず 403/BLOCKED）。
- この企業に求人・面接質問を設定し、**`questions_snapshot` が凍結される**面接（in_progress）を用意する。
- ⚠️ 既定質問のみ（自己紹介1問のみ）だと `SNAPSHOT_NOT_FROZEN` で弾かれる（mock 扱い）。実質問を1問以上設定すること。

## STEP 4 — その企業だけを allowlist へ登録
```
OPENAI_REALTIME_COMPANY_IDS=<test company id>   # ← 1社のみ。一般企業を複数登録しない
```
allowlist が空だと preflight は `ALLOWLIST_MISSING` で BLOCKED（＝誤って全非demo企業を許可しない）。

## STEP 5 — 実 SMS 未実装の回避（このテスト企業に限定）
実 SMS provider は未接続のため、通常企業は本人確認で 503。R1 検証用に限り固定コードで面接到達可能にする:
```
SMS_FIXED_CODE_COMPANY_ID=<test company id>     # ← R1 テスト企業のみ
```
- ⚠️ **一時的な R1 検証専用**。一般顧客には使わない。
- demo 判定（`is_demo`）とは**別**の env override（特定 1 社の company_id のみ有効・複数企業へ波及しない）。
- **smoke 終了後に削除**する（STEP 10）。

## STEP 6 — 暫定 Realtime env（Production）
```
OPENAI_REALTIME_ENABLED=true
OPENAI_REALTIME_COMPANY_IDS=<test company only>
OPENAI_REALTIME_MODEL=gpt-realtime           # 現在コードが正式対応する model
OPENAI_API_KEY=<realtime対応key>             # 値は env のみ

OPENAI_EVALUATION_ENABLED=false              # 触らない（OFF維持）
TRANSCRIPT_INGEST_ENABLED=false              # 触らない（OFF維持）
```
Transcript / Evaluation は **OFF のままで R1 音声スモークは成立**する（preflight でも `*GateIndependent=true`）。

## STEP 7 — preflight READY を確認
`evaluateRealtimeSmokePreflight` の観点で go/no-go を確認する（OpenAI 未接続）。
- env レベル: gate=true / key 存在 / allowlist に対象企業 / model 許可候補。
- DB レベル（READ-ONLY SQL で確認可・書き込みしない）:
  ```sql
  -- 対象企業が非demo・非停止か
  select id, is_demo, is_suspended from companies where id = '<test company id>';
  -- 対象 interview が in_progress・snapshot 凍結・ロック無しか（値そのものは出さず存在確認）
  select id, status,
         (questions_snapshot is not null and jsonb_array_length(questions_snapshot) > 0) as snapshot_frozen,
         (realtime_call_locked_until is null or realtime_call_locked_until < now()) as no_active_lock
  from interviews where id = '<interview id>';
  ```
- 全て満たせば preflight は **READY**（reasons 空）。1つでも欠ければ **BLOCKED** ＋ reason code。

## STEP 8 — 実スモーク（1セッションだけ）
- 人間が**実ブラウザ・実マイク**で、R1 テスト企業の `/interview/<slug>` から開始 → フォーム → 本人確認（固定コード）→ prepare/practice → **session で Realtime 音声面接**。
- 想定時間 = **必要最小限（数分）**。全質問を通す必要はなく、接続〜数往復〜終了を確認できれば十分。

## STEP 9 — 確認項目
- [ ] WebRTC 接続確立（answer SDP 200）
- [ ] AI の最初の発話
- [ ] 応募者の音声入力が認識される
- [ ] AI 応答が返る
- [ ] 質問が順に進行する
- [ ] interruption / silence（server VAD）の挙動
- [ ] complete 処理（`complete_interview` tool → 完了遷移）
- [ ] connection close（session 終了で切断）
- [ ] reconnect storm が起きない（再接続の暴走なし）
- [ ] 500 / クラッシュが無い
- [ ] OpenAI コストが想定内（1セッション・数分）

## STEP 10 — 即 OFF（rollback）
smoke 完了後、**速やかに以下を戻す**（OpenAI 未呼び出し状態＝¥0 へ復帰）:
1. `OPENAI_REALTIME_ENABLED` を `false` にする、または env 削除（**これだけで即 OFF＝503**）。
2. `OPENAI_REALTIME_COMPANY_IDS` を削除。
3. `SMS_FIXED_CODE_COMPANY_ID` の R1 テスト企業 override を削除。
4. （任意）`OPENAI_API_KEY` は次工程まで使わないなら削除、または Realtime を絞ったキーに限定。
- ロールバックは env 変更のみ（コード/DB 変更なし）。gate OFF に戻れば route は即 503。
- ロック残留があっても TTL 65分で自動失効（`/end` 正常時は即解放）。

---

## Task 2 — Cost / blast-radius guard 監査結果（現コード・main）
| 観点 | 状態 |
|---|---|
| 1社 allowlist | ✅ `OPENAI_REALTIME_COMPANY_IDS`（空=全非demo許容だが preflight は空を BLOCKED＝スモークは1社必須） |
| demo 企業禁止 | ✅ `isCompanyAllowed`：`is_demo=true` と `DEMO_COMPANY_ID` は常に false |
| interview/company authz | ✅ token(slug/applicant一致) → company(slug解決) → applicant(company所属) → interview(applicant一致/in_progress) |
| max interview duration | ✅ `MAX_INTERVIEW_SECONDS=3600`（session タイマー）。ロック TTL=65分 |
| realtime-call lock | ✅ `interviews.realtime_call_locked_until` 条件付きUPDATE・fail-closed（error/contended は拒否） |
| reconnect 制御 | ✅ 確立失敗の全経路でロック解放（即再試行可）／成功時のみ保持し `/end` で解放 |
| duplicate connection 防止 | ✅ 同一 interview 並列は 409（contended） |
| server 側 model 固定/allowlist | ✅ `resolveRealtimeModel()`（許可候補のみ・client model 不使用） |
| client spoof（company/model/gate） | ✅ 判定は env + server 解決 company のみ。`body.model/company_id/is_demo` 不使用 |
| gate OFF 時 OpenAI 未到達 | ✅ 両ルートとも fetch 前に `isRealtimeEnabled()` + `OPENAI_API_KEY` を確認（source-guard test で固定） |
| session 終了時 close | ✅ `/end` でロック解放。P2P 切断は client 側（session page） |

**新規 P0/P1 コード修正は不要**（既存ガードは十分堅牢）。ただし下記は **公開前** の blocker/P2:
- **P1（公開前 blocker・既知）**: SDP-proxy 信頼境界（接続後 client 改変）。恒久対策 = server relay / Option B。R1 では自社テスターのため許容。
- **P2（公開前・既知 Issue #20）**: `isDefaultQuestionSnapshot` は content 比較のため、企業が偶然「既定文と同一の1問」を設定すると mock 誤判定。provenance マーカー（DB列）で正確化予定。R1 には影響小（実質問を複数設定すれば回避）。

## Task 4 — Character（暫定）設定の API 互換監査（最終デザインは R1 後）
現行 `buildRealtimeSessionConfig` / `buildRealtimeInstructions` を実 API 仕様と照合:
| 項目 | 現値 | 互換懸念 |
|---|---|---|
| model | `gpt-realtime`（許可 `gpt-realtime` / `gpt-realtime-2`） | 実 API のモデル名と要突合（R1 前に OpenAI 側で有効モデル名を確認） |
| voice | `alloy`（`REALTIME_VOICE`） | GA voice 名の有効性を要確認（無効なら 400 の可能性→R1 で確認・容易に差し替え可） |
| instructions | questions_snapshot から server 生成（1問ずつ・最大2深掘り・complete_interview tool） | 仕様上は問題なし。実音声の口調/長さは R1 後に調整 |
| tools / tool_choice | `complete_interview`（flat form）/ `auto` | GA の function tool 形式（flat `{type:'function',name,...}`）に整合 |
| audio.input | `transcription: whisper-1` + `turn_detection: server_vad` | GA の `audio.input` 形式に整合。whisper-1 有効性は R1 で確認 |
| temperature 等 | 未指定（サーバ既定） | 明示していない＝API 既定。R1 後に必要なら追加 |
| first response | instructions 依存（AI が1番から質問開始） | greeting を自動発話させるか（`response.create` 誘導）は R1 で挙動確認し調整 |

→ **明らかな非互換設定は無い**が、**voice 名・model 名・whisper-1 の“実 API 上の有効性”は R1 実接続で最終確認**する（無効時は定数差し替えのみで対応可）。キャラクター最終デザイン（口調・人物像・画像・UI）は **R1 実音声を聞いた後**に別タスクで行う。

---

## R1 完了後の次工程
R1 で音声成立を確認したら → Phase T1（Transcript 保存）→ Phase E1（EBCA 評価）。
**一般公開は SDP-proxy 信頼境界の恒久対策（Option B）完了が blocker。**
