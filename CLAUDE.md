# AI人事24h - プロジェクト設計ガイド

## 設計書一覧
- docs/REQUIREMENTS.md - 要件定義書v7.1
- docs/SCREEN_DESIGN.md - 画面設計書v1.3
- docs/API_DESIGN.md - API設計書v1.1
- docs/INFRASTRUCTURE.md - インフラ構成設計書v1.0
- docs/MIGRATION_SQL.md - マイグレーションSQL履歴

※ 設計書v4.2（会話内で確定した仕様の統合版）の内容が最新。docs/配下の正式設計書への反映は一部未実施。

## 技術スタック
- Next.js 16 App Router + TypeScript + Tailwind CSS 4
- Supabase Free (PostgreSQL 25テーブル, Auth, RLS)
- OpenAI Realtime API (gpt-4o-mini-realtime-preview) ※未導入
- Cloudflare R2 (録画保存180日) ※未導入
- Stripe (課金・プラン管理)
- Twilio Verify (SMS OTP 4桁) ※未導入
- Resend (トランザクションメール)
- Google reCAPTCHA v3
- Vercel (Node 20)
- Sentry (エラー監視)

## 3ロール構成
1. 応募者 (Candidate) - /interview/* - SMS OTP認証(4桁)
2. 企業ユーザー (Client) - /client/* - メール+パスワード認証
3. 運営ユーザー (Admin) - /admin/* - メール+パスワード+TOTP 2FA認証

## 料金体系（確定・従量課金）
- 従量課金制: 請求額 = 当月の課金対象面接人数 × companies.price_per_interview（税別・月末締め）
- 通常企業: plan = pay_per_use / price_per_interview = 4,000（デフォルト）
- 特別企業: plan = custom / price_per_interview = 3,000 等（運営側のみ設定）。企業側に custom/特別契約/カスタムプラン/優遇プランの表記は出さない（「従量課金」＋実単価のみ表示）
- 月間上限: companies.monthly_interview_limit（最低5人）。上限到達で受付停止
- 翌月上限予約: next_month_interview_limit / next_month_limit_effective_month（適用は必ず翌月1日。企業側は翌月分のみ変更可。月初昇格で monthly_interview_limit へ反映）
- 重要設定変更: ログインPWとは別の「管理者設定用パスワード」(companies.company_setting_password_hash) / 「運営管理設定変更用パスワード」(admin_security_settings.setting_password_hash) を使用（hash保存）
- 初期費用: ¥200,000（導入費用。月額固定プランとは独立）
- 旧仕様（ライト/スタンダード/プロの月額固定プラン・31件目以降¥3,500・自動繰上げ・plan_limit・auto_upgrade）は廃止

## 評価グレード（確定）
A(80-100) / B(65-79) / C(50-64) / D(35-49) / E(0-34) の5段階

## 評価軸キー（確定）
communication / logical_thinking / initiative / desire / stress_tolerance / integrity

## 現在の進捗 (2026-06-12)

### Phase 4C: 完了（料金モデル・上限・パスワード）
- **料金モデルを従量課金に統一**（旧ライト/スタンダード/プロ・月額固定・31件目以降3,500円・自動繰上げは廃止）
- `companies.price_per_interview` 対応済み（通常企業=4,000円 / 特別企業=custom で運営側のみ 3,000円等に設定可）
- 企業側画面に custom / 特別契約 / カスタムプラン / 優遇プラン は**表示しない**（「従量課金」＋実単価のみ）
- `/client/plan`・`/client/billing` を `price_per_interview` ベースに対応済み（4000直書き廃止）
- 企業側パスワードを「ログインパスワード」＋「管理者設定用パスワード」に統合（モック削除）
- パスワード表示/非表示トグルを client/admin の login・settings・plan・companies詳細に共通実装（components/shared/PasswordInput.tsx）
- 翌月上限予約（next_month_interview_limit / next_month_limit_effective_month）・**翌月1日固定**・月初昇格処理を実装＆動作確認済み（client/plan・client/company・admin/companies/[id]・verify-url の取得時に lib/companies/applyNextMonthLimit.ts で遅延適用。cron不要・二重反映なし）
- 設定変更用パスワード基盤: companies.company_setting_password_hash（企業側）/ admin_security_settings（運営側）。scrypt hash・ログインPW非流用（lib/security/setting-password.ts）
- migration `supabase/migrations/20260610_v5_pricing_limit_reservation.sql` 適用済み（companies に price_per_interview / next_month_* / company_setting_password_hash 追加、admin_security_settings 作成）
- docs（REQUIREMENTS / SCREEN_DESIGN / INFRASTRUCTURE / API_DESIGN / CLAUDE）を現行料金モデルへ更新済み（コミット 35fdc12）

### Phase 1: 完了
- DB 27テーブル作成済み（Supabase）
- companies テーブルに is_demo カラム追加済み
- Supabase Auth動作確認済み
- RLS全テーブル修正完了（39ポリシー）

### Phase 2: 進行中
実装済みの企業管理画面:
- /client/login (115行)
- /client/dashboard (652行)
- /client/applicants (1115行)
- /client/applicants/[id] (1533行, 5タブ)
- /client/templates (243行)
- /client/plan (571行)
- /client/billing (127行)
- /client/suspension (425行)
- /client/culture-analysis (501行)
- /client/settings (680行)

実装済みの運営管理画面:
- /admin/login (129行)
- /admin/dashboard (289行)
- /admin/companies (773行)
- /admin/companies/[id] (1162行)
- /admin/applicants (591行)
- /admin/applicants/[id] (832行)
- /admin/questions (382行)
- /admin/billing (473行)
- /admin/security (840行)
- /admin/settings (792行)

削除済み（重複・孤立スタブ）:
- /admin/applicant-data → /admin/applicants と重複のため削除（API /api/admin/applicant-data は別物・存続）
- /admin/question-bank → /admin/questions と重複のため削除

実機能（骨格と誤検出されていたが実装済み）:
- /client/jobs （求人管理・JobManager。サイドバー導線あり）
- /client/questions （面接質問設定・QuestionEditor。サイドバー導線あり）

実データ化済み（旧・骨格から実装済みへ）:
- /admin/satisfaction （applicants.satisfaction_rating を GET /api/admin/satisfaction で集計表示）
- /admin/suspension （停止申請一覧＋緊急停止の承認/却下）

実装済みの応募者フロー:
- /interview/[slug]/page.tsx 開始・同意 (328行)
- /interview/[slug]/verify SMS認証 (268行)
- /interview/[slug]/form 履歴書フォーム (477行)
- /interview/[slug]/prepare デバイスチェック (337行)
- /interview/[slug]/practice 練習画面 (508行)
- /interview/[slug]/session AI面接 (661行)
- /interview/[slug]/uploading 送信中 (310行)
- /interview/[slug]/feedback フィードバック (110行)
- /interview/[slug]/diagnosis 性格診断 (853行)
- /interview/[slug]/complete 完了 (393行)
- /interview/[slug]/terms 利用規約 (141行)
- /interview/[slug]/cancelled キャンセル (40行)
- /interview/[slug]/ended 途中終了 (45行)
- /survey/[slug] 社風アンケート (415行)

コード修正完了:
- types/database.ts: PLAN_CONFIG(light/standard/pro), 料金, グレード, 評価軸キー, dataRetentionDays:180, isDemo
- scoreToGrade: lib/utils/scoreToGrade.tsに共通化済み（5段階、gradeColor対応）
- プランUI: 6ファイル32箇所修正済み
- CSVエクスポート: プラン判定修正済み
- form/page.tsx: console.log削除, is_demo対応

### API実装状況
- 主要な client / admin API は実装済み（例: client plan/company/billing/applicants/security setting-password、admin companies[+id]/applicant-data/dashboard/security、interview verify-url 等）
- 認証は getClientUser / getAdminUser、横断取得は service role（RLSバイパス）で統一
- 一部は未接続/ダミー（admin billing 実データ化、admin settings・security のダミーUI 等。下記「残課題」参照）

### 未導入パッケージ
openai, twilio, @aws-sdk/client-s3, idb

### 残課題（料金まわり以降）
- /admin/billing の実データ化（現状 BILLING_DATA は空ダミー、`* 4000` 直書き残存。実データ取得は per-company の price_per_interview を使う）
- /admin/settings のダミーUI整理（EMAIL_TEMPLATES / API_LOGS 等）
- /admin/security のダミーUI整理（SECURITY_ALERTS。実API /api/admin/security/alerts への接続 or 空状態化）
- 応募者詳細系の DUMMY 実データ化（admin/client の applicants/[id]）は**別途方針決定が必要**（現状は触らない指定）
- 満足度（satisfaction）周辺の整理:
  - `satisfaction_ratings` は**書き込み元のない死蔵テーブル**（実データ保存先は `applicants.satisfaction_rating`）。削除/型整理は別タスク（今回は放置）
  - INT-014 `POST /api/interview/satisfaction` は**未実装**。現状は `/interview/[slug]/complete` がブラウザから `applicants.satisfaction_rating` を直接 update。専用API化は将来課題
  - `Applicant` 型に `satisfactionRating: number | null` を追加済み（実DB列に整合）。`SatisfactionRating` テーブル型は死蔵テーブルへの誤誘導になるため追加しない

### 旧・未解決課題（一部継続）
- P-05: 質問データのDB化
- P-06: csvDownload仕様確認
- P-07: admin/applicantsのURL構造統一
- P-08: admin/question-bankの空ファイル処理
- P-09: HTTPセキュリティヘッダー ✅完了
- P-10: 未導入パッケージ追加（openai, twilio, @aws-sdk/client-s3, idb）
- P-11: ドメイン・メール・DPA等
- P-12: camelCase/snake_case変換レイヤー
- P-13: SCREEN_DESIGN.md反映（料金モデル分は 35fdc12 で反映済み）

## 実装ルール
- 設計書に定義されていない機能は勝手に追加しない
- ファイルの変更前に必ず確認を取る
- エラーハンドリングは統一形式を厳守
- RLSポリシーを必ず考慮する
- 環境変数は .env.local で管理
- console.log/console.errorは本番コードに残さない

---

## Workflow Orchestration
- 大きなタスクは必ずサブタスクに分割し、1つずつ完了・検証してから次へ進む
- TodoWriteツールでタスク管理し、完了時にステータスを更新する
- 「完了」と言う前に必ず型チェック・動作確認を実施する

## Subagent Strategy
- 重い調査・リファクタ・テストはサブエージェントに委任する
- メインタスクの流れを止めない

## Self-Improvement Loop
- 失敗やミスはtasks/lessons.mdに記録し、同じミスを繰り返さない
- 新しいパターンを発見したら即座に記録する

## Core Principles
- コードはエレガントに。冗長なコピペは許容しない
- バグを見つけたら自律的に修正し、根本原因を特定する
- 推測で進めず、必ずファイルを読んで事実を確認する
