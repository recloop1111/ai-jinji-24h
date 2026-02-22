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

## 料金体系（確定）
- ライト: ¥40,000/月, 10件まで
- スタンダード: ¥80,000/月, 20件まで
- プロ: ¥120,000/月, 30件まで
- 31件以降: ¥3,500/件
- 初期費用: ¥200,000

## 評価グレード（確定）
A(80-100) / B(65-79) / C(50-64) / D(35-49) / E(0-34) の5段階

## 評価軸キー（確定）
communication / logical_thinking / initiative / desire / stress_tolerance / integrity

## 現在の進捗 (2026-02-21)

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

実質未実装（空or骨格のみ）:
- /admin/applicant-data (3行)
- /admin/question-bank (3行)
- /admin/satisfaction (3行)
- /admin/suspension (3行)
- /client/jobs (16行)
- /client/questions (16行)

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
- 実装済み: /api/health (1本のみ)
- 未実装: 65本

### 未導入パッケージ
openai, twilio, @aws-sdk/client-s3, idb

### 未解決課題
- P-05: 質問データのDB化
- P-06: csvDownload仕様確認
- P-07: admin/applicantsのURL構造統一
- P-08: admin/question-bankの空ファイル処理
- P-09: HTTPセキュリティヘッダー ✅完了
- P-10: 未導入パッケージ追加
- P-11: ドメイン・メール・DPA等
- P-12: camelCase/snake_case変換レイヤー
- P-13: SCREEN_DESIGN.md反映

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
