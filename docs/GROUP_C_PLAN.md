# グループC（有料API接続）準備プラン

> **位置づけ**: グループC＝外部有料API（OpenAI / Twilio / Cloudflare R2 / Stripe / Resend）＋ EBCA 評価 writer ＋ 定期バッチ(cron) の導入計画。
> **本ドキュメントは計画のみ。コード接続・env設定・本番デプロイは含まない。** 関連: `CLAUDE.md` / `docs/PRE_RELEASE_CHECKLIST.md`（§2 有料API E2E、§3 本番前 disable）。
> 作成: 2026-06-27。

---

## 0. 前提・プラン切替タイミング（確定方針）

- **開発中・Preview 検証中は Free/Hobby のまま**進める（Vercel Hobby / Supabase Free）。
- **クライアント導入が決まった直前に Vercel Pro / Supabase Pro へ切替**、そのタイミングで以下をまとめて実施:
  - 本番ドメイン取得
  - Production 環境変数の設定（secret 系は本番値・コミット禁止）
  - Supabase Auth CAPTCHA 有効化（＋Turnstile secret）
  - Cloudflare Turnstile に本番ホスト名を登録
  - Production デプロイ / main マージ
- **有料API接続は上記タイミングまで行わない**（費用・外部審査・本番設定が絡むため最後にまとめて）。

---

## 1. 現状棚卸し（2026-06-27）

- **SDK**: `openai` / `@aws-sdk/client-s3`（R2はS3互換）/ `stripe` / `resend` / `idb` は**依存に存在するがコードで未 import・未使用**。`twilio` は**未インストール**。
- **EBCA writer**: `interview_results` への INSERT/UPDATE は**コードにゼロ**（read-only。seed のみ）。
- **コード内 env 参照**: `INTERNAL_BATCH_SECRET` のみ（他APIの env は実装時に追加）。
- **cron**: `vercel.json` に crons 定義なし。`/api/internal/batch/suspension-execute` は service-role 化済み（`e62a776`）だが **`INTERNAL_BATCH_SECRET` 未設定・未スケジュールで起動しない**。月末請求バッチ（BATCH-001）のルートは**未作成**。
- **面接 UX**: `session/page.tsx` は先頭1問表示のモック（質問ラリー/音声は未実装）。録画・メール・請求PDF は各所 TODO。

→ グループCは**ほぼ greenfield**（既存統合の改修ではなくプレースホルダへの新規実装）。

---

## 2. 推奨導入順（依存・リスク・コスト順）

1. **INTERNAL_BATCH_SECRET + cron 整備**（外部API不要・既存停止バッチを起動可能に）
2. **Resend（通知）**（独立・低コスト/低リスク・パイプライン検証に最適）
3. **Twilio Verify（実SMS）**（認証ゲート・「1234」バイパス除去。実応募者が使う前提）
4. **OpenAI Realtime（＋TTS/Whisper/質問ラリー）**（面接コア・最高コスト/複雑度）
5. **EBCA 評価 writer**（④の文字起こしが前提）
6. **R2 録画保存**（面接セッション稼働が前提・非公開＋署名URL）
7. **Stripe 請求 writer（BATCH-001）**（月末・最後。※Stripe要否は判断事項）

---

## 3. 各API 詳細

### ① Twilio Verify（実SMS）
- **目的**: 応募者の本人確認SMS（現状「1234」モックの置換）。
- **現状**: 未インストール。`sms/verify/route.ts` は固定コード判定（テスト企業限定・本番fail-closed）。`verify/page.tsx` 再送は TODO。
- **env（サーバ専用）**: `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` / `TWILIO_VERIFY_SERVICE_SID`。
- **注意**: 既存 `sms_verified` capability token 発行は維持。電話番号正規化（normalizeDigits 済み）・国内/国際形式・レート/コスト上限。
- **fail-closed**: env 未設定/送信失敗は `SMS_NOT_AVAILABLE(503)`/認証失敗で面接に進ませない。
- **E2E**: 実番号OTP送信→検証成功で sms_token 発行→/start 通過 / 誤コード・期限切れ・再送・レート超過 / 本番で「1234」無効。

### ② OpenAI Realtime（＋TTS＋音声認識）
- **目的**: AI音声面接（質問読み上げ・応答音声・文字起こし・質問ラリーUX）。
- **現状**: `openai` 未使用。`session/page.tsx` は先頭1問モック。`practice` に TTS/Whisper TODO。
- **env（サーバ専用）**: `OPENAI_API_KEY`。Realtime は**サーバでエフェメラル token 発行→ブラウザ接続**（API キーをクライアントに出さない）。
- **注意**: コスト/レイテンシ/同時接続上限。質問ラリーの状態機械・無音/中断検知・コスト上限/タイムアウト。
- **fail-closed**: 接続失敗は blockingError で面接UI安全停止。録画/課金を巻き込まない。
- **E2E**: 双方向音声・読み上げ・文字起こし・ラリー完了→/end / 失敗時の安全停止。

### ③ EBCA 評価 writer（interview_results）
- **目的**: 面接終了後、全Q&A横断で6軸スコア生成→`interview_results`（evaluation_axes/total_score/detail_json）へ書込み。
- **現状**: writer ゼロ（seed のみ）。表示 `normalizeEvaluationAxes` は存在。
- **env**: `OPENAI_API_KEY`（②と共用）。
- **注意**: ②の文字起こしが前提＝**②の後**。冪等性（同面接で二重生成しない）・根拠不足軸は score=null・service-role で書込み。
- **fail-closed**: 生成失敗でも面接終了/課金の確定を壊さない。未生成は「生成中/未生成」表示。
- **E2E**: 終了後に6軸生成・格納→管理画面表示 / 再実行で重複しない / 根拠不足の扱い。

### ④ Cloudflare R2 録画保存
- **目的**: 面接録画の保存（180日）。
- **現状**: `@aws-sdk/client-s3` 未使用。`session/page.tsx` に保存 TODO、`applicants/[id]` に再生 TODO。
- **env（サーバ専用）**: `R2_ACCOUNT_ID` / `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` / `R2_BUCKET` / `R2_ENDPOINT`。
- **注意（監査指摘）**: **非公開バケット＋短期署名URL＋企業/応募者スコープ**。公開URL不可・他社録画にアクセス不可。
- **fail-closed**: 録画保存失敗で面接終了/課金/評価を壊さない（付随データ）。
- **E2E**: アップロード→非公開保存→当該企業のみ署名URL再生→他社不可→180日 lifecycle。

### ⑤ Stripe 請求 writer（BATCH-001 月末締め）
- **目的**: 月末締めで `billing_records` 確定（確定請求・未入金・年間累計）。
- **現状**: writer/バッチ未実装。当月見込みは Stripe 非依存でリアルタイム算出済み。請求は**銀行振込/請求書モデル**。
- **判断事項**: **Stripe 要否**（カード課金でないため、Stripe＝請求書PDF生成のみか／billing_records writer は内製でも可か）。
- **env（採用時・サーバ専用）**: `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET`。
- **注意**: バッチ `/api/internal/batch/monthly-billing`（新規・`INTERNAL_BATCH_SECRET`＋cron）。二重請求防止（冪等キー＝company×period）・JST月境界（既存 helper 流用）・is_billable 集計。
- **fail-closed**: バッチ失敗で二重請求しない・部分失敗の再実行が安全。
- **E2E**: 月末バッチで当月確定→billing_records 反映→請求履歴/未入金/年間表示 / 冪等再実行。

### ⑥ Resend 通知
- **目的**: トランザクションメール（合否/面接案内/管理通知 等）。
- **現状**: `resend` 未使用。client 各所に送信 TODO。
- **env（サーバ専用）**: `RESEND_API_KEY` ＋ **検証済み送信ドメイン（SPF/DKIM）**。
- **注意**: 送信条件（誰に/いつ）仕様確定・テスト宛先限定・本番での誤送信防止。
- **fail-closed**: 送信失敗で業務処理（合否更新等）を巻き戻さない（best-effort＋再送/記録）。
- **E2E**: 各トリガで送信→到達→テンプレ差込→失敗時の挙動。

### ⑦ INTERNAL_BATCH_SECRET / cron
- **目的**: 内部バッチ（停止自動実行・将来の月末請求）の認証＋定期実行。
- **現状**: `suspension-execute` は service-role 化済み（`e62a776`）。`INTERNAL_BATCH_SECRET` 未設定・cron 未定義で**起動しない**。
- **env（サーバ専用）**: `INTERNAL_BATCH_SECRET`（強ランダム）。
- **注意**: `vercel.json` に `crons` 追加（停止実行＝日次／月末請求＝月初等）。Bearer 比較の timing-safe 化推奨（P3）。
- **E2E**: cron 実行→認証通過→対象更新／未認証は 401。

---

## 4. 必要env一覧（**名称のみ・値は扱わない・全てサーバ専用＝NEXT_PUBLIC不可**）

| API | env |
|-----|-----|
| Twilio | `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` / `TWILIO_VERIFY_SERVICE_SID` |
| OpenAI | `OPENAI_API_KEY` |
| R2 | `R2_ACCOUNT_ID` / `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` / `R2_BUCKET` / `R2_ENDPOINT` |
| Stripe | `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` |
| Resend | `RESEND_API_KEY` ＋ 検証済み送信ドメイン |
| Batch | `INTERNAL_BATCH_SECRET` ＋ `vercel.json` crons |

> いずれも **Production スコープでの本番値設定はプラン切替（クライアント導入直前）のタイミング**で実施。Preview のテスト値を本番に流用しない。

---

## 5. 本番前に無効化/置換すべきもの（§3 PRE_RELEASE_CHECKLIST と整合）

- **「1234」固定コード** → Twilio 接続で置換。本番は `SMS_FIXED_CODE_COMPANY_ID` 未設定（or テスト企業のみ）。`sms/verify` は本番 fail-closed 済み。
- **デモ補助入力** → `form/page.tsx` の `is_demo` 自動入力分岐を削除（unused `isDemo` も同時）。`useCompanyId` の `?demo`/`DEMO_COMPANY_ID` 経路は本番無効だがコード削除推奨。
- **テストデータ/デモ企業** → 「テスト株式会社」(`DEMO_COMPANY_ID`)・seed を本番に混ぜない/分離。
- **Preview専用env** → secret 系は現状 Preview/ブランチのみ。本番は別途 Production スコープに本番値。
- **デモ録画/モック表示** → applicants 詳細の動画プレースホルダを実R2へ置換。

---

## 6. 着手前に確定すべき判断事項

- **Stripe 要否**（銀行振込/請求書モデルで Stripe が必要か／請求書PDF生成のみか／billing_records writer 内製可否）。
- **OpenAI Realtime のモデル/コスト上限・同時接続上限**（gpt-4o-mini-realtime-preview 想定）。
- **EBCA 再実行ポリシー**（冪等キー・再評価の可否）。
- **R2 配信方式**（署名URL期限・カスタムドメイン要否）。
- **Resend 送信ドメイン**（取得・SPF/DKIM）・送信トリガ仕様。
- **本番ドメイン取得**（Turnstile 本番ホスト・Resend ドメイン・cookie Secure の前提）。

---

## 7. ステータス

- コード接続・env設定・DB変更・main マージ・本番デプロイ・有料API接続: **未実施**。
- 本計画は **Free/Hobby 維持で開発・Preview 検証 → クライアント導入直前に Pro 切替＋本番設定＋有料API接続** を前提とする。
