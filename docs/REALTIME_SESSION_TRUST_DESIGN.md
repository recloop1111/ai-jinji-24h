# Realtime セッション信頼境界 設計案（Option B: サーバ中継リレー）

> ステータス: **設計案のみ（未実装）**。本ドキュメントはコード/インフラ/DB/env を変更しない。
> 実装・インフラ追加・有料API E2E は別途承認後。Codex P1「Prevent clients from replacing the
> server-owned session」(realtime.ts:96) への恒久対策の設計。
> **follow-up: GitHub Issue #19 / 関連: PR #11。**
>
> ## ⛔ 本番有効化のブロッカー（必須条件）
> **本設計 B（サーバ中継）が完了するまで、Realtime 経路を本番で有効化してはならない。**
> `OPENAI_REALTIME_ENABLED` を設定しない（＝既定 OFF・OpenAI 未呼び出し・¥0 を維持）。
> 現行 SDP-proxy / P2P 方式では、接続後の client `session.update` による instructions/tools/tool_choice
> 上書きを完全には防止できない（OpenAI API 仕様上の構造的限界。詳細は §1）。よって PR #11 は
> **「既定 OFF の安全な基盤」**であり、本番 Realtime 有効化は本フォローアップ B の完了を blocker とする。

## 1. 背景 / 問題（Codex P1）

現行 PR-2 は **SDP プロキシ方式**：ブラウザの offer SDP を自社 `/api/interview/[slug]/realtime-call`
が OpenAI `/v1/realtime/calls` へ中継し、answer SDP を返す。SDP 交換後は **音声＋`oai-events`
データチャネルが browser↔OpenAI の P2P** で流れ、自社サーバはメディア/イベント経路に居ない。

OpenAI Realtime API の仕様（調査結果）:
- クライアントは接続後 `session.update` で **`voice` と `model` 以外の任意フィールド**
  （`instructions` / `tools` / `tool_choice` を含む）を**いつでも変更できる**。
- **サーバ強制の不変session／ephemeralトークンのフィールドスコープ制限／Promptロック／公式の緩和策は無い**
  （公式コミュニティの合意：バックエンドで自前防御するしかない）。
  - 参照: https://platform.openai.com/docs/api-reference/realtime-client-events/session-update
  - 参照: https://community.openai.com/t/realtime-api-webrtc-how-to-avoid-end-users-updating-instructions-of-the-model/1251817

→ 応募者が独自 WebRTC クライアント（＋有効な capability token）で **`session.update` を送り
`instructions`/`tools`/`tool_choice` を上書き**できる：`complete_interview` tool の除去、設問改竄、
有料セッションの任意プロンプト悪用。サーバは**初期**設定しか強制できず、接続後は防げない。

## 2. なぜ「サーバ中継」が必要か

OpenAI の Realtime セッションは**単一の接続**（WebRTC または WebSocket）であり、**その接続を保持する側が
セッションを制御する**。SDP プロキシではブラウザが OpenAI 接続を保持するため、ブラウザが常に制御権を持つ。
`session.update` を封じるには、**サーバが OpenAI 接続を保持**し、ブラウザとは別接続にする必要がある
（＝サーバが音声/イベントの中継点に入る）。音声だけ P2P・制御だけサーバ、という分離は同一セッション上では不可。

## 3. アーキテクチャ案

```
 Browser  <== WebRTC(音声) ==>  Relay Server  <== WebRTC/WebSocket ==>  OpenAI Realtime
 (UIのみ・OpenAIに直接繋がない)   (session権威 / イベント検閲 / API key保持)
```

### Relay Server（新規・永続ステートフル・自社側）
- **OpenAI との Realtime 接続を保持**（API key はここだけ・ブラウザ非公開は現状同様）。
- **authoritative session config を設定**（`instructions`/`tools`/`tool_choice`＝サーバ凍結の
  `questions_snapshot`（→ [frozenQuestions](../lib/interview/frozenQuestions.ts)）由来）。
- **ブラウザ→OpenAI の制御イベントを allowlist 検閲**：
  - `session.update` は **破棄**（またはサーバ確定値のみ許可）。
  - `response.create` 等はサーバ側で生成/制御。
  - `complete_interview` 完了などの **OpenAI→ブラウザ**イベントはサーバが受けて `/end` 等アプリ側へ
    反映できる（P1-3 完了シグナルの**サーバ権威化**という副次メリット）。
- **音声を双方向リレー**（Browser ⇄ Relay ⇄ OpenAI）。

### 接続確立フロー（案）
1. ブラウザ → 自社API（capability token 検証）→ Relay セッション確立要求。
2. Relay が OpenAI 接続を張り、session config をサーバ確定で設定。
3. Relay ↔ ブラウザ の WebRTC を SDP 交換で確立（**音声のみ**。制御データチャネルはブラウザに公開しない）。
4. 音声: Browser ⇄ Relay ⇄ OpenAI。制御イベント: Relay が仲介・検閲。

## 4. 技術 / インフラ

- **メディアリレー実装**: Node の WebRTC ライブラリ（`werift` / `@roamhq/wrtc` / `mediasoup`）で Opus/RTP
  終端、または **managed SFU（LiveKit 等）** を採用して自前メディア終端を回避（第一候補）。
- **ホスティング**: **永続プロセス必須 → Vercel serverless では不可**
  （関数は要求スコープ・最大 ~300s・永続 UDP 不可。面接は最大60分＝`MAX_INTERVIEW_SECONDS`）。
  専用常駐サービス（Fly.io / Render / Cloud Run(min-instances>0) / 専用VM / LiveKit Cloud）。
- **スケール**: 同時面接数ぶんのメディアセッション（CPU/帯域）。監視・オートスケール設計が要る。

## 5. セキュリティモデル（B で達成できること）

- クライアントは OpenAI セッションを**直接保持しない** → **`session.update` を送れない**
  （サーバが唯一の OpenAI ピア）。
- `instructions`/`tools`/`tool_choice` はサーバ確定・不変。`complete_interview` 完了もサーバ権威で受信。
- API key / client_secret は一切ブラウザに出ない（現状同様）。
- 設問一貫性（凍結 `questions_snapshot`）と完了シグナルの信頼境界が一本化される。

## 6. 影響 / コスト / リスク

- **インフラ追加**（新常駐サービス・デプロイ経路・監視）。Vercel 単体で完結しなくなる。
- **音声がサーバ経由** → 帯域・CPU コスト、レイテンシ増（P2P 比）。音質/スケール設計が必須。
- **実装コスト大**：WebRTC 終端・メディアパイプライン・再接続/障害処理、録画(R2)・transcript 永続の再設計。
- **有料API E2E**（費用・外部審査）が絡む。
- **移行**: 既存 SDP-proxy（`realtime-call` / `realtime-client.ts`）はリレー方式へ置換 or 併存の判断。

## 7. 推奨 / 段階

1. **短期（現状維持）**: Option A — 限界を明文化し、フラグ OFF 既定 / allowlist 限定 / demo・test 禁止で
   **本番露出ゼロ**を担保（realtime は既定 OFF）。ミスリードなコメント（"モデル制限＋逸脱検知で担保"）は
   API では防げない旨に是正する。
2. **中期（本設計 B）**: Relay を**別サービスの PoC**として構築 → 有料 API E2E と合わせて導入判断。
   **managed SFU（LiveKit 等）採用を第一候補**にメディア終端の自前実装を回避。
3. リレー化に伴い **P1-3 完了シグナル / 録画 / transcript 永続もサーバ権威化**でき、設計を一本化できる。

## 8. 非対象（本設計案では変更しない）

- 既存 SDP-proxy コード、DB スキーマ、env、フラグ、有料 API 呼び出し。実装は別途承認後。
