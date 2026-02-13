# AI人事24h - プロジェクト設計ガイド

## 設計書一覧
このプロジェクトの全設計書は docs/ フォルダに格納されています。実装時は必ず参照してください。

- docs/REQUIREMENTS.md - 要件定義書v7.0（サービス概要、ビジネスモデル、全機能定義、セキュリティ、非機能要件）
- docs/SCREEN_DESIGN.md - 画面設計書v1.1（全28画面42ビューの詳細設計、レイアウト、コンポーネント仕様）
- docs/API_DESIGN.md - API設計書v1.1（全66エンドポイントの詳細仕様、認証、エラー形式）
- docs/INFRASTRUCTURE.md - インフラ構成設計書v1.0（環境構成、外部サービス、デプロイ戦略）

## 技術スタック
- Next.js App Router + TypeScript + Tailwind CSS
- Supabase (PostgreSQL 27テーブル, Auth, Storage, RLS)
- OpenAI Realtime API (gpt-4o-mini-realtime-preview)
- Cloudflare R2 (録画保存、90日ライフサイクル)
- Stripe (課金・プラン管理)
- Twilio Verify (SMS OTP認証)
- Resend (トランザクションメール)
- Google reCAPTCHA v3
- Vercel (Node 20, 東京リージョン)
- Sentry (エラー監視)

## 3ロール構成
1. 応募者 (Candidate) - /interview/* - SMS OTP認証
2. 企業ユーザー (Client) - /client/* - メール+パスワード認証 (Supabase Auth)
3. 運営ユーザー (Admin) - /admin/* - メール+パスワード+2FA認証

## API構成 (全66本)
- 応募者API 15本: /api/interview/*
- 企業API 24本: /api/client/*
- 運営API 19本: /api/admin/*
- Webhook 4本: /api/webhooks/*
- 内部バッチ 4本: /api/internal/batch/*

## エラー形式（全API共通）
{ "error": { "code": "ERROR_CODE", "message": "説明文" } }

## 現在の進捗
- Phase 1完了: DB27テーブル作成済み, Auth動作, RLS設定済み(companies, applicants, job_types)
- Phase 2進行中: 企業ログイン, 応募者一覧, 応募者詳細ページ実装済み
- 未着手: テンプレメール, プラン管理, 請求履歴, 停止申請, 応募者フロー, 管理画面, レポートエンジン, Webhook, バッチ

## 実装ルール
- 設計書に定義されていない機能は勝手に追加しない
- エラーハンドリングは統一形式を厳守
- RLSポリシーを必ず考慮する
- 環境変数は .env.local で管理（NEXT_PUBLIC_ のみクライアント公開）


## Current Progress (2026-02-13)
- Phase 1: Complete (27 Supabase tables, RLS policies, authentication)
- Phase 2 Client Admin UI:
  - Applicant list page: DONE (full Japanese, filtering, pagination)
  - Applicant detail page (5 tabs): DONE
  - Template email settings: DONE (CRUD, variable preview)
  - Plan management: DONE (simple version, data fetching works)
  - Billing history: DONE (Japanese UI)
  - Suspension/cancellation request: DONE (Japanese UI, form)
  - DB: companies table updated with plan, auto_upgrade_enabled, monthly_interview_count, monthly_interview_limit columns
- Phase 2 Remaining: Enrich plan management UI, onboarding guide, CSV export
- Phase 3-6: Not started
