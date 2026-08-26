# OpenAI 公式仕様 監査記録（R1-B 直前・現行 docs を SoT）

現行 OpenAI 公式 docs（2026-08 時点で再確認。過去キャッシュを信用しない）に基づく、AIMEN24 の Realtime/Evaluation 実装との整合記録。

## Realtime モデル（現行）
- **`gpt-realtime-2.1`（推奨・R1 production candidate）**: `gpt-realtime-2` を更新。alphanumeric 認識・**silence/noise handling・interruption behavior**・instruction following・tool use 改善。**configurable reasoning effort** 対応（effort 高で latency/token 増）。音声料金 **$32/1M in・$64/1M out**。
- `gpt-realtime-2.1-mini`（安価版）、`gpt-realtime-2`、`gpt-realtime-1.5` も実在。
- **deprecated（2026-07-20 通知・2027-01-20 shutdown）**: `gpt-realtime` / `gpt-realtime-mini` / `gpt-4o-realtime` / `gpt-4o-mini-realtime`。推奨後継 = `gpt-realtime-2.1` / `gpt-realtime-2.1-mini`。
- 接続方式: **WebRTC 推奨** + ephemeral **`POST /v1/realtime/client_secrets`**、通話 `/v1/realtime/calls`（現 repo と一致）。
- session schema: `session.type`・`session.audio.input.transcription`・`session.audio.input.turn_detection`（`server_vad`）・`session.audio.output.voice`・`instructions`・`tools`（現 repo `buildRealtimeSessionConfig` と一致）。**breaking change なし**。

## input transcription モデル（現行）
- 選択肢: **`whisper-1`（GA でも有効・現状維持）** / `gpt-4o-transcribe` / `gpt-4o-mini-transcribe` / `gpt-realtime-whisper`。
- 判断: whisper-1 は日本語実績・event 互換・変更 risk 低のため **R1 は whisper-1 維持**。切替えは `OPENAI_REALTIME_TRANSCRIPTION_MODEL` で env 上書き可（コード分散なし）。R1 の実音声で精度が不足すれば `gpt-4o-transcribe` を候補に（R1-B 判断）。

## transcript / tool イベント
- 現 repo の event matcher は部分文字列判定（`input_audio_transcription`+`completed` / `audio_transcript`+`done`）で、GA の `response.output_audio_transcript.*` リネームにも耐性。**R1-B で応募者 input transcription の実 event 名を live 確認**（matcher 依存）。

## Evaluation（Responses API）
- endpoint `https://api.openai.com/v1/responses`。structured outputs = **`text.format`（type:`json_schema`, name, strict, schema）**、`max_output_tokens`、応答は `output_text` / `output[].content[].text`（現 repo `openai-provider.ts` と一致）。
- モデル: **`gpt-5.6-terra`/`luna`/`sol`** は structured outputs 対応。terra は intelligence/cost バランス（**$2/1M in・$12/1M out**）・**reasoning model**（`reasoning.effort`: none/low/medium/high/xhigh/max・既定 medium）。gpt-4o 系は temperature 対応・非 reasoning。
- **temperature 注意**: reasoning model（gpt-5*/o系）は `temperature` 非対応（送ると 400）。→ adapter は model capability で **temperature を条件付き送信**（`evaluationRequestOptionsForModel`）。全 model 共通の必須パラメータにしない。
- 不変の安全策: raw は untrusted → **P4 validator が最終防波堤**、**protected 非送信**（prompt は P4 で protected 非使用）、**raw 全文非保存**（EBCA 正規化のみ保存）。

## 本 patch での対応（コード）
- `REALTIME_DEFAULT_MODEL='gpt-realtime-2.1'`、`REALTIME_ALLOWED_MODELS` に 2.1/2.1-mini/2/1.5 追加（deprecated gpt-realtime/mini は互換許可・非 default）、`REALTIME_DEPRECATED_MODELS` 明示。
- `resolveRealtimeTranscriptionModel` / `resolveRealtimeReasoningEffort` を env SoT 化。`buildRealtimeSessionConfig` は reasoning を **明示時のみ**載せる（未検証パラメータを送らない）。
- 評価 adapter: `buildOpenAiEvaluationRequest(prompt, model, opts)` で temperature/reasoning を capability 由来で出し分け。`provider-resolver` が model から opts を計算。

## 未解決の R1-B live 確認事項
1. 応募者 input transcription の実 event 名（matcher 依存）。
2. gpt-realtime-2.1 の reasoning effort 実 param path / 最適値（latency 影響）。
3. whisper-1 の日本語精度（不足なら gpt-4o-transcribe）。
4. 評価モデルの最終選定（下記）と実 structured output 追従。
