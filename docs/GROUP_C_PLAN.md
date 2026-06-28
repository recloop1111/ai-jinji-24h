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

> **請求方針（確定）**: 初期リリースは **Stripe 不採用**。請求は**銀行振込**、`billing_records` を**自前で月末/翌月に確定**し、**請求書PDFはサーバ側生成（pdfkit）**。詳細は §3-7〜§3-9。

1. **INTERNAL_BATCH_SECRET + cron 整備**（外部API不要・既存停止バッチを起動可能に）
2. **自前 billing_records 確定 writer（月末/翌月・BATCH-001 自前版）**（外部API不要・請求書PDFの前提）
3. **請求書PDF download（client）＋ admin 請求管理**（外部API不要・pdfkit。`billing_records` 確定が前提）
4. **Resend（通知）**（独立・低コスト/低リスク。請求通知＝期限7日前/当日/超過後 は本フェーズで実装）
5. **Twilio Verify（実SMS）**（認証ゲート・「1234」バイパス除去。実応募者が使う前提）
6. **OpenAI Realtime（＋TTS/Whisper/質問ラリー）**（面接コア・最高コスト/複雑度）
7. **EBCA 評価 writer**（⑥の文字起こしが前提）
8. **R2 録画保存**（面接セッション稼働が前提・非公開＋署名URL）
9. ~~Stripe 請求 writer~~ → **初期リリース不採用**（将来カード決済が必要になった場合のみ再検討。§3-10）

> 1〜3 は**外部有料API不要**で Free/Hobby のまま Preview で検証可能（請求の中核を無料で先行実装できる）。4〜8 が有料API接続フェーズ。

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

### ⑤ 自前 billing_records 確定 writer（月末/翌月・BATCH-001 自前版・**Stripe不使用**）
- **目的**: 月末/翌月に当月の課金を確定し `billing_records` を作成（請求書PDF・請求管理の前提データ）。
- **現状**: writer/バッチ未実装。当月見込みはリアルタイム算出済み（Stripe非依存）。請求は**銀行振込**。
- **billing_records（de-facto列）**: `id` / `company_id` / `billing_month`(date) / `interview_count` / `amount_jpy`(税抜) / `tax_jpy` / `payment_status` / `invoice_pdf_url` / `created_at`。
- **算出**: 当月（JST月境界・既存 `jstCurrentMonthStartIso` 流用）の `is_billable=true` 件数 × `companies.price_per_interview`＝`amount_jpy`、`tax_jpy=round(amount_jpy*0.1)`。`payment_status` 初期=`unpaid`。
- **注意**: バッチ `/api/internal/batch/monthly-billing`（新規・`INTERNAL_BATCH_SECRET`＋cron・service-role）。**二重確定防止＝冪等キー company×billing_month**（既存あれば skip/更新）。外部API不要＝Free/Hobby で検証可。
- **fail-closed**: 二重請求しない・部分失敗の再実行が安全。
- **E2E**: 月末バッチ→当月 billing_records 確定→client/admin 請求履歴に反映 / 冪等再実行で重複しない。

### ⑤-b 請求書PDF download（client・**サーバ生成 / pdfkit / Stripe不使用**）
- **目的**: 企業管理画面の請求履歴から、確定済み billing_record の請求書PDFをダウンロード。
- **API**: `GET /api/client/billing/[billing_record_id]/invoice`（Node runtime）。`getClientUser()`→`user.companyId` で billing_record を `id`＋`.eq('company_id', user.companyId)` 取得。**他社 id は 403**／不存在は 404。`Content-Type: application/pdf`・`Content-Disposition: attachment`・`Cache-Control: no-store`。**金額はサーバ確定データ（billing_records）から算出**（client値を信用しない）。
- **ライブラリ**: **pdfkit**（サーバ純JS）＋**日本語TTF 埋め込み（サブセット）**。serverless 関数サイズに留意。
- **請求日 / 支払期限（確定ポリシー）**: 請求日 = `billing_records.created_at`。支払期限 = **請求日の翌月末**。
- **発行者 / 振込先**: `lib/config/billing.ts`（新規・定数。secretではない）に運営の発行者情報・振込先・（任意）インボイス登録番号を保持。
- **PDF 記載項目**: 請求書番号 / 請求日 / 支払期限 / 請求先企業名 / 請求対象月 / 面接件数 / 単価 / 小計（税抜）/ 消費税 / 合計 / 振込先 / 発行者情報 / 登録番号（※インボイス登録時）/ 備考。
- **請求書番号**: billing_record 由来で一意（例 `INV-<billing_month>-<company短縮>` 等・要確定）。
- **fail-closed**: 生成失敗で 500（PDF以外の業務は無影響）。
- **E2E**: 自社 billing_record→PDF DL（全項目）／他社 id→403／不存在→404／金額が billing_records と一致。

### ⑤-c admin 請求管理（運営画面）
- **目的**: 運営が企業ごとの請求状況を確認・管理。
- **表示項目**: 請求月 / 企業名 / 面接件数 / 税抜金額 / 消費税 / 合計金額 / 支払期限 / `payment_status`（**unpaid / paid / overdue**）/ 請求書PDFダウンロード / メモ欄。
- **操作**: **「入金済みに変更」（手動）**（初期は銀行振込のため運営の手動操作で `payment_status=paid`）。メモ編集。
- **API**: admin 用 `GET`（一覧・`getAdminUser`・service-role 全社）＋ `PATCH /api/admin/billing/[billing_record_id]`（payment_status / memo 更新・`getAdminUser`）＋ admin 版 PDF DL（`getAdminUser` で全社の billing_record を取得可）。
- **注意**: `overdue` は支払期限超過＋未入金で導出 or バッチで更新。`billing_records` に `memo` 列が無ければ要追加（**DB変更＝要承認・別タスク**）。
- **E2E**: 一覧表示／入金済み変更／メモ保存／PDF DL／overdue 表示。

### ⑥ Resend 通知（請求通知を含む）
- **目的**: トランザクションメール（合否/面接案内/管理通知）＋**請求通知**。
- **現状**: `resend` 未使用。client 各所に送信 TODO。**請求通知の自動送信は本フェーズ（Resend接続）で実装**。
- **請求通知トリガ（要実装・Resendフェーズ）**: 請求確定時 / **支払期限7日前** / **支払期限当日** / **期限超過後**。
- **初期段階（Resend未接続）**: メール送信はせず、**通知対象を admin 管理画面で確認できる設計**にする（送信は後追い）。
- **env（サーバ専用）**: `RESEND_API_KEY` ＋ **検証済み送信ドメイン（SPF/DKIM）**。
- **注意**: 送信条件（誰に/いつ）仕様確定・テスト宛先限定・本番での誤送信防止・冪等（同一通知を二重送信しない）。
- **fail-closed**: 送信失敗で業務処理（請求確定/合否更新等）を巻き戻さない（best-effort＋再送/記録）。
- **E2E**: 各トリガで送信→到達→テンプレ差込／初期は管理画面で通知対象が見える／失敗時の挙動。

### ⑦ Stripe（**初期リリース不採用・将来候補**）
- **方針**: 初期リリースは銀行振込＋自前 billing_records 確定＋サーバ生成PDF。**Stripe（カード決済/自動引落）は採用しない**。
- **将来再検討の条件**: カード決済・自動引落・サブスク等が必要になった場合のみ。その際 `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` を導入。
- **現状**: `stripe` 依存は残置（未使用）。`billing/page.tsx` の `stripe_invoice_url` マッピングは将来用の名残（自前PDFでは未使用）。

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
| Resend | `RESEND_API_KEY` ＋ 検証済み送信ドメイン |
| Batch | `INTERNAL_BATCH_SECRET` ＋ `vercel.json` crons |
| 請求(自前) | **env 不要**（billing_records writer / 請求書PDF(pdfkit) / admin請求管理 は外部API・env不要。発行者/振込先は `lib/config/billing.ts` 定数） |
| ~~Stripe~~ | **初期リリース不採用**（将来カード決済導入時のみ `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET`） |

> いずれも **Production スコープでの本番値設定はプラン切替（クライアント導入直前）のタイミング**で実施。Preview のテスト値を本番に流用しない。請求(自前)系は env 不要のため Free/Hobby のまま先行実装・検証可能。

---

## 5. 本番前に無効化/置換すべきもの（§3 PRE_RELEASE_CHECKLIST と整合）

- **「1234」固定コード** → Twilio 接続で置換。本番は `SMS_FIXED_CODE_COMPANY_ID` 未設定（or テスト企業のみ）。`sms/verify` は本番 fail-closed 済み。
- **デモ補助入力** → `form/page.tsx` の `is_demo` 自動入力分岐を削除（unused `isDemo` も同時）。`useCompanyId` の `?demo`/`DEMO_COMPANY_ID` 経路は本番無効だがコード削除推奨。
- **テストデータ/デモ企業** → 「テスト株式会社」(`DEMO_COMPANY_ID`)・seed を本番に混ぜない/分離。
- **Preview専用env** → secret 系は現状 Preview/ブランチのみ。本番は別途 Production スコープに本番値。
- **デモ録画/モック表示** → applicants 詳細の動画プレースホルダを実R2へ置換。

---

## 6. 確定した判断事項（請求）／着手前に確定すべき残事項

**確定（2026-06-27・請求方針）**:
- Stripe **初期リリース不採用** / 請求方式 **銀行振込** / `billing_records` **自前で月末/翌月確定** / 請求書PDF **サーバ生成・pdfkit** / 支払期限 **請求日の翌月末** / 請求日 **`billing_records.created_at`** / 他社 billing_record_id **403** / 発行者・振込先 **`lib/config/billing.ts` 定数** / 実装順 **billing_records writer → 請求書PDF（client）→ admin請求管理 → Resend請求通知**。
- admin 請求管理: 請求月/企業名/件数/税抜/消費税/合計/支払期限/`payment_status(unpaid/paid/overdue)`/PDF DL/入金済み手動変更/メモ。
- 請求通知（期限7日前/当日/超過後・確定時）は **Resend 接続フェーズで実装**。初期は **管理画面で通知対象を確認できる設計**に留める。

**残・着手前に確定（有料API系）**:
- **OpenAI Realtime のモデル/コスト上限・同時接続上限**（gpt-4o-mini-realtime-preview 想定）。
- **EBCA 再実行ポリシー**（冪等キー・再評価の可否）。
- **R2 配信方式**（署名URL期限・カスタムドメイン要否）。
- **Resend 送信ドメイン**（取得・SPF/DKIM）・送信トリガ仕様。
- **本番ドメイン取得**（Turnstile 本番ホスト・Resend ドメイン・cookie Secure の前提）。
- **請求書番号の採番規則**（一意・例 `INV-YYYYMM-<company>`）／**インボイス登録番号**の有無。
- **DB変更（要承認・別タスク）**: `billing_records` に admin メモ列が無ければ追加。

---

## 7. ステータス

- コード接続・env設定・DB変更・main マージ・本番デプロイ・有料API接続: **未実施**。
- 本計画は **Free/Hobby 維持で開発・Preview 検証 → クライアント導入直前に Pro 切替＋本番設定＋有料API接続** を前提とする。
