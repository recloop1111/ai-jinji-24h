# AI人事24h インフラ構成設計書 v1.0

## 概要

本書はAI人事24hのインフラ構成・外部サービス連携・環境構成・デプロイ戦略を定義する。
要件定義書 v7.1（docs/REQUIREMENTS.md）に準拠。

---

## 1. アーキテクチャ全体図

```
┌─────────────────────────────────────────────────────────────────┐
│                        クライアント（ブラウザ）                     │
│  ┌──────────┐  ┌──────────────┐  ┌────────────────────────┐   │
│  │ React UI  │  │ MediaRecorder│  │ WebRTC (Realtime API)  │   │
│  └─────┬─────┘  └──────┬───────┘  └───────────┬────────────┘   │
└────────┼───────────────┼──────────────────────┼────────────────┘
         │               │                      │
         │ HTTPS         │ HTTPS                │ DTLS-SRTP
         ▼               ▼                      ▼
┌─────────────────────────────────┐  ┌──────────────────────┐
│        Vercel (Next.js)         │  │  OpenAI Realtime API  │
│  ┌────────────────────────┐    │  │  gpt-4o-mini-realtime │
│  │ App Router              │    │  │  -preview             │
│  │  ├─ Pages (SSR/CSR)     │    │  └──────────────────────┘
│  │  ├─ API Routes          │    │
│  │  └─ Cron Jobs           │    │
│  └────────────────────────┘    │
│          │    │    │    │       │
└──────────┼────┼────┼────┼───────┘
           │    │    │    │
     ┌─────┘    │    │    └──────┐
     ▼          ▼    ▼           ▼
┌─────────┐ ┌─────┐ ┌─────┐ ┌──────────┐
│ Supabase│ │Stripe│ │Resend│ │Cloudflare│
│ ├─ Auth │ │      │ │      │ │    R2    │
│ ├─ DB   │ └──────┘ └──────┘ └──────────┘
│ ├─ RLS  │
│ └─Storage│  ┌──────────┐  ┌──────────┐
└──────────┘  │  Twilio   │  │  Sentry  │
              │  Verify   │  │          │
              └──────────┘  └──────────┘
```

---

## 2. 外部サービス一覧

### 2-1. Vercel（ホスティング・実行環境）

| 項目 | 値 |
|------|-----|
| **用途** | Next.js App Routerのホスティング・サーバーレス実行 |
| **ランタイム** | Node.js 20 |
| **リージョン** | 東京 (hnd1) |
| **プラン** | Pro（推奨） |
| **Cron Jobs** | バッチAPI実行に使用 |
| **Edge Functions** | 使用しない（Node.js Runtimeのみ） |
| **ビルドコマンド** | `next build` |
| **出力ディレクトリ** | `.next` |
| **Serverless Function Timeout** | 60秒（Pro: 300秒） |
| **環境変数** | Vercel Dashboard > Settings > Environment Variables |

#### Vercel Cron Jobs（vercel.json）
```json
{
  "crons": [
    {
      "path": "/api/internal/batch/monthly-billing",
      "schedule": "0 15 1 * *"
    },
    {
      "path": "/api/internal/batch/suspension-execute",
      "schedule": "0 16 * * *"
    },
    {
      "path": "/api/internal/batch/report-retry",
      "schedule": "0 * * * *"
    }
  ]
}
```
※ スケジュールはUTC表記。JST変換: `0 15 1 * *` = 毎月1日 00:00 JST

---

### 2-2. Supabase（データベース・認証）

| 項目 | 値 |
|------|-----|
| **用途** | PostgreSQLデータベース、認証（Auth）、RLS、Storage |
| **プラン** | Pro（推奨） |
| **リージョン** | 東京 (ap-northeast-1) |
| **PostgreSQLバージョン** | 15+ |
| **テーブル数** | 27テーブル |
| **接続方式** | Connection Pooling (pgBouncer, Transaction mode) |
| **最大接続数** | Pro: 直接接続60、プーリング200 |

#### 認証設定
| 設定 | 値 |
|------|-----|
| Email認証 | 有効（企業・運営ユーザー） |
| Phone認証 | 無効（Twilio Verify直接使用） |
| MFA (TOTP) | 有効（運営ユーザー必須） |
| セッション有効期限 | 86400秒（24時間） |
| パスワードリセット | メールリンク方式 |
| リフレッシュトークン | 有効 |

#### RLS（Row Level Security）
全テーブルでRLS有効化。主要ポリシー:

| テーブル | ポリシー |
|---------|---------|
| companies | `auth.uid() = auth_user_id` で自社のみ |
| applicants | `company_id` が自社のcompanies.idと一致 |
| job_types | `company_id` が自社と一致 |
| interviews | applicants経由で自社のみ |
| reports | interviews経由で自社のみ |
| internal_memos | `company_id` が自社と一致 |
| email_templates | `company_id` が自社と一致 |
| sent_emails | applicants経由で自社のみ |

運営APIはService Role Keyを使用しRLSをバイパス。

#### 接続文字列
```
# クライアント（ブラウザ）
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...

# サーバー（API Routes）
SUPABASE_SERVICE_ROLE_KEY=sb_secret_...
```

---

### 2-3. OpenAI（AI面接・レポート生成）

| 項目 | 値 |
|------|-----|
| **用途① リアルタイム面接** | Realtime API (gpt-4o-mini-realtime-preview) |
| **用途② レポート生成** | GPT API (gpt-4o-mini) |
| **用途③ フィードバック生成** | GPT API (gpt-4o-mini) |
| **接続方式（面接）** | ブラウザWebRTC直接接続 |
| **接続方式（レポート）** | サーバーサイドHTTP API |
| **リアルタイム最大時間** | 40分/セッション |
| **レポート生成目標** | 5分以内 |
| **フィードバック生成目標** | 20秒以内 |

#### Realtime API接続フロー
```
1. クライアント → サーバー: セッション開始リクエスト
2. サーバー → OpenAI: Ephemeral Key発行
3. サーバー → クライアント: Ephemeral Key返却
4. クライアント → OpenAI: WebRTC直接接続（Ephemeral Key使用）
5. クライアント ↔ OpenAI: 音声ストリーミング（DTLS-SRTP）
```

#### API使用量の目安（1面接あたり）
| 処理 | モデル | トークン目安 | コスト目安 |
|------|--------|------------|-----------|
| リアルタイム面接（30分） | gpt-4o-mini-realtime | 音声入出力 | 〜$0.50 |
| レポート生成 | gpt-4o-mini | 〜8,000トークン | 〜$0.01 |
| フィードバック生成 | gpt-4o-mini | 〜3,000トークン | 〜$0.005 |

---

### 2-4. Cloudflare R2（録画保存）

| 項目 | 値 |
|------|-----|
| **用途** | 面接録画動画の保存・配信 |
| **バケットタイプ** | Private |
| **バケット名** | `ai-jinji-24h-recordings` |
| **保存期間** | 90日（ライフサイクルルールで自動削除） |
| **動画フォーマット** | WebM (VP9), 1280x720, 30fps |
| **アップロード方式** | マルチパートアップロード（パートサイズ 5MiB以上） |
| **配信方式** | 署名付きURL（有効期限10分、IP制限） |
| **Egress料金** | 無料（R2の特徴） |

#### ライフサイクルルール設定
```json
{
  "rules": [
    {
      "id": "auto-delete-90days",
      "status": "Enabled",
      "expiration": {
        "days": 90
      }
    }
  ]
}
```

#### 署名付きURL生成
```typescript
// S3互換APIで署名付きURL発行
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

const url = await getSignedUrl(s3Client, command, {
  expiresIn: 600, // 10分
})
```

#### 環境変数
```
R2_ACCOUNT_ID=your_account_id
R2_ACCESS_KEY_ID=your_access_key_id
R2_SECRET_ACCESS_KEY=your_secret_access_key
R2_BUCKET_NAME=ai-jinji-24h-recordings
```

---

### 2-5. Stripe（課金・決済）

| 項目 | 値 |
|------|-----|
| **用途** | 月次サブスクリプション課金、請求書発行 |
| **課金モデル** | 月次サブスクリプション（契約日基準） |
| **通貨** | JPY |
| **Webhook** | `/api/webhooks/stripe` |

#### Stripe Product/Price設計
| Product | Price ID | 金額（税別） | 面接件数 |
|---------|----------|-------------|---------|
| プランA | `price_plan_a` | ¥60,000/月 | 〜10件 |
| プランB | `price_plan_b` | ¥120,000/月 | 〜20件 |
| プランC | `price_plan_c` | ¥180,000/月 | 〜30件 |
| 初期費用 | `price_setup` | ¥200,000（一括） | - |
| 職種追加 | `price_job_type` | ¥100,000（一括） | - |

#### Webhook処理対象イベント
| イベント | 処理 |
|---------|------|
| `invoice.payment_succeeded` | 支払い完了記録 |
| `invoice.payment_failed` | 企業・運営に通知 |
| `customer.subscription.updated` | プラン変更反映 |
| `customer.subscription.deleted` | 解約処理 |

#### 環境変数
```
STRIPE_SECRET_KEY=sk_live_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

---

### 2-6. Twilio Verify（SMS認証）

| 項目 | 値 |
|------|-----|
| **用途** | 応募者のSMS OTP認証 |
| **サービス** | Twilio Verify |
| **OTP桁数** | 6桁 |
| **OTP有効期限** | 5分（300秒） |
| **対応国** | 日本 (+81) |

#### レート制限（サーバー側実装）
| 制限 | 値 |
|------|-----|
| 同一電話番号/日 | 5回 |
| 同一IP/時間 | 3回 |
| 同一IP異番号/日 | 10回 |
| 再送間隔 | 60秒 |

#### 環境変数
```
TWILIO_ACCOUNT_SID=ACxxxxxxx
TWILIO_AUTH_TOKEN=your_auth_token
TWILIO_VERIFY_SERVICE_SID=VAxxxxxxx
```

---

### 2-7. Resend（メール送信）

| 項目 | 値 |
|------|-----|
| **用途** | トランザクションメール（通知・テンプレートメール） |
| **送信ドメイン** | 未定（ドメイン取得後設定） |
| **送信元アドレス** | noreply@ドメイン名（未定） |
| **Webhook** | `/api/webhooks/resend` |

#### メール種別
| カテゴリ | 件数 | 対象 |
|---------|------|------|
| 企業向け通知 | 10種 | レポート完了、上限到達、支払い失敗 等 |
| 運営向け通知 | 11種 | 生成失敗、異常検知、停止申請 等 |
| テンプレートメール | 2種 | 二次面接案内、選考結果 |

#### 環境変数
```
RESEND_API_KEY=re_xxxxxxx
```

---

### 2-8. Google reCAPTCHA v3（Bot対策）

| 項目 | 値 |
|------|-----|
| **用途** | 面接開始画面・SMS送信のBot対策 |
| **バージョン** | v3（スコアベース、非表示） |
| **設置箇所** | 画面A（同意画面）、画面B（SMS送信ボタン） |
| **閾値** | スコア 0.5 未満でチャレンジ表示 |

#### 環境変数
```
NEXT_PUBLIC_RECAPTCHA_SITE_KEY=6Lxxxxxxx
RECAPTCHA_SECRET_KEY=6Lxxxxxxx
```

---

### 2-9. Sentry（エラー監視）

| 項目 | 値 |
|------|-----|
| **用途** | フロントエンド・サーバーサイドのエラー監視 |
| **SDK** | `@sentry/nextjs` |
| **Webhook** | `/api/webhooks/sentry`（重大エラー通知） |
| **ソースマップ** | ビルド時にアップロード |
| **環境分離** | development / staging / production |

#### 環境変数
```
NEXT_PUBLIC_SENTRY_DSN=https://xxx@xxx.ingest.sentry.io/xxx
SENTRY_AUTH_TOKEN=sntrys_xxx
SENTRY_ORG=your-org
SENTRY_PROJECT=ai-jinji-24h
```

---

## 3. 環境構成

### 3-1. 環境一覧

| 環境 | URL | 用途 | Vercel | Supabase | Stripe |
|------|-----|------|--------|----------|--------|
| **Development** | localhost:3000 | ローカル開発 | - | 開発プロジェクト | テストモード |
| **Preview** | *.vercel.app | PRプレビュー | Preview | 開発プロジェクト | テストモード |
| **Staging** | staging.ai-jinji24h.com | ステージング | Preview Branch | ステージングプロジェクト | テストモード |
| **Production** | ai-jinji24h.com | 本番 | Production | 本番プロジェクト | ライブモード |

### 3-2. 環境変数マッピング

| 環境変数 | 公開 | Dev | Staging | Production |
|---------|------|-----|---------|------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | 開発URL | ステージングURL | 本番URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | 開発Key | ステージングKey | 本番Key |
| `SUPABASE_SERVICE_ROLE_KEY` | No | 開発Key | ステージングKey | 本番Key |
| `OPENAI_API_KEY` | No | テスト用 | テスト用 | 本番Key |
| `STRIPE_SECRET_KEY` | No | sk_test_ | sk_test_ | sk_live_ |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Yes | pk_test_ | pk_test_ | pk_live_ |
| `STRIPE_WEBHOOK_SECRET` | No | whsec_ | whsec_ | whsec_ |
| `TWILIO_ACCOUNT_SID` | No | テスト用 | テスト用 | 本番SID |
| `TWILIO_AUTH_TOKEN` | No | テスト用 | テスト用 | 本番Token |
| `TWILIO_VERIFY_SERVICE_SID` | No | テスト用 | テスト用 | 本番SID |
| `RESEND_API_KEY` | No | テスト用 | テスト用 | 本番Key |
| `R2_ACCOUNT_ID` | No | 共通 | 共通 | 共通 |
| `R2_ACCESS_KEY_ID` | No | 開発用 | ステージング用 | 本番用 |
| `R2_SECRET_ACCESS_KEY` | No | 開発用 | ステージング用 | 本番用 |
| `R2_BUCKET_NAME` | No | dev-recordings | stg-recordings | ai-jinji-24h-recordings |
| `NEXT_PUBLIC_RECAPTCHA_SITE_KEY` | Yes | テスト用 | テスト用 | 本番Key |
| `RECAPTCHA_SECRET_KEY` | No | テスト用 | テスト用 | 本番Key |
| `NEXT_PUBLIC_SENTRY_DSN` | Yes | 開発DSN | ステージングDSN | 本番DSN |
| `NEXT_PUBLIC_APP_URL` | Yes | http://localhost:3000 | https://staging... | https://ai-jinji24h.com |
| `BATCH_SECRET_KEY` | No | 開発用 | ステージング用 | 本番用 |

#### NEXT_PUBLIC_ ルール
- `NEXT_PUBLIC_` プレフィックス付き → クライアント（ブラウザ）に公開される
- プレフィックスなし → サーバーサイドのみ（API Routes、Server Components）
- **秘密鍵は絶対に `NEXT_PUBLIC_` を付けない**

---

## 4. データベース設計（27テーブル）

### 4-1. テーブル一覧

| # | テーブル名 | 用途 | RLS |
|---|-----------|------|-----|
| 1 | `companies` | 契約企業 | ✅ |
| 2 | `job_types` | 企業別職種 | ✅ |
| 3 | `question_banks` | 質問バンク（パターン） | ✅ |
| 4 | `questions` | 質問マスタ | ✅ |
| 5 | `applicants` | 応募者 | ✅ |
| 6 | `interviews` | 面接セッション | ✅ |
| 7 | `interview_logs` | 面接発話ログ | ✅ |
| 8 | `reports` | 評価レポート | ✅ |
| 9 | `report_axis_scores` | 6軸スコア | ✅ |
| 10 | `report_scores` | 質問ごとスコア | ✅ |
| 11 | `report_qa_summaries` | Q&Aまとめ | ✅ |
| 12 | `internal_memos` | 社内メモ | ✅ |
| 13 | `selection_status_histories` | ステータス変更履歴 | ✅ |
| 14 | `email_templates` | メールテンプレート | ✅ |
| 15 | `sent_emails` | メール送信履歴 | ✅ |
| 16 | `satisfaction_ratings` | 満足度評価 | - |
| 17 | `applicant_feedbacks` | 応募者フィードバック（一時保存） | - |
| 18 | `invoices` | 請求書 | ✅ |
| 19 | `subscription_plans` | プランマスタ | - |
| 20 | `suspension_requests` | 停止申請 | ✅ |
| 21 | `admin_users` | 運営ユーザー | - |
| 22 | `security_alerts` | セキュリティアラート | - |
| 23 | `blocked_ips` | ブロック済みIP | - |
| 24 | `locked_accounts` | ロック中アカウント | - |
| 25 | `login_attempts` | ログイン試行ログ | - |
| 26 | `sms_rate_limits` | SMS送信制限カウンタ | - |
| 27 | `prank_counts` | 冷やかしカウント | - |

### 4-2. 主要テーブル定義

#### companies
```sql
CREATE TABLE companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id UUID NOT NULL REFERENCES auth.users(id),
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  interview_slug TEXT NOT NULL UNIQUE,
  plan TEXT NOT NULL DEFAULT 'A' CHECK (plan IN ('A', 'B', 'C', 'custom')),
  plan_limit INTEGER NOT NULL DEFAULT 10,
  auto_upgrade BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
  onboarding_completed BOOLEAN NOT NULL DEFAULT false,
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

#### applicants
```sql
CREATE TABLE applicants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id),
  last_name TEXT NOT NULL,
  first_name TEXT NOT NULL,
  last_name_kana TEXT NOT NULL,
  first_name_kana TEXT NOT NULL,
  birth_date DATE NOT NULL,
  gender TEXT NOT NULL CHECK (gender IN ('male', 'female', 'other', 'no_answer')),
  phone_number TEXT NOT NULL,
  email TEXT NOT NULL,
  prefecture TEXT,
  education TEXT,
  employment_type TEXT CHECK (employment_type IN ('new_graduate', 'mid_career')),
  industry_experience TEXT CHECK (industry_experience IN ('experienced', 'inexperienced')),
  job_type_id UUID REFERENCES job_types(id),
  work_history TEXT,
  qualifications TEXT,
  selection_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (selection_status IN ('pending', 'second_interview', 'rejected')),
  duplicate_flag BOOLEAN NOT NULL DEFAULT false,
  inappropriate_flag BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

#### interviews
```sql
CREATE TABLE interviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  applicant_id UUID NOT NULL REFERENCES applicants(id),
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  duration_seconds INTEGER,
  question_count INTEGER,
  end_reason TEXT CHECK (end_reason IN (
    'completed', 'user_ended', 'timeout', 'silence',
    'inappropriate', 'disconnected', 'browser_closed'
  )),
  billable BOOLEAN NOT NULL DEFAULT false,
  recording_status TEXT DEFAULT 'none'
    CHECK (recording_status IN ('none', 'uploading', 'completed', 'partial', 'failed')),
  recording_key TEXT,
  report_status TEXT DEFAULT 'pending'
    CHECK (report_status IN ('pending', 'generating', 'completed', 'partial', 'failed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

#### reports
```sql
CREATE TABLE reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  interview_id UUID NOT NULL REFERENCES interviews(id) UNIQUE,
  status TEXT NOT NULL DEFAULT 'generating'
    CHECK (status IN ('generating', 'completed', 'partial', 'failed')),
  rank TEXT CHECK (rank IN ('A', 'B', 'C', 'D', 'E')),
  total_score_100 INTEGER,
  summary_points TEXT,
  overall_comment TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

---

## 5. デプロイ戦略

### 5-1. Gitブランチ戦略

```
main ──────────────────────────────────── Production
  │
  ├── staging ─────────────────────────── Staging
  │
  └── feature/xxx ─────────────────────── Preview (PR)
       └── PR → main にマージ
```

| ブランチ | デプロイ先 | 自動デプロイ |
|---------|----------|-------------|
| `main` | Production | ✅ マージ時 |
| `staging` | Staging | ✅ プッシュ時 |
| `feature/*` | Preview | ✅ PR作成時 |

### 5-2. デプロイフロー

```
1. feature/* ブランチで開発
2. PR作成 → Vercel Previewデプロイ（自動）
3. コードレビュー + Preview確認
4. main にマージ → Production デプロイ（自動）
```

### 5-3. ビルド設定

```json
{
  "buildCommand": "next build",
  "outputDirectory": ".next",
  "installCommand": "npm ci",
  "nodeVersion": "20"
}
```

### 5-4. ドメイン設定

| ドメイン | 環境 | SSL |
|---------|------|-----|
| `ai-jinji24h.com` | Production | Vercel自動（Let's Encrypt） |
| `www.ai-jinji24h.com` | → リダイレクト | Vercel自動 |
| `staging.ai-jinji24h.com` | Staging | Vercel自動 |

---

## 6. セキュリティ構成

### 6-1. 通信暗号化

| 通信 | プロトコル | 設定場所 |
|------|----------|---------|
| HTTP | HTTPS (TLS 1.2+) | Vercel自動 |
| WebRTC音声映像 | DTLS-SRTP | OpenAI Realtime API |
| DB接続 | SSL | Supabase自動 |

### 6-2. HTTPセキュリティヘッダー

Next.js `next.config.ts` で設定:

```typescript
const securityHeaders = [
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-XSS-Protection', value: '1; mode=block' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(self), microphone=(self)' },
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-eval' 'unsafe-inline' https://www.google.com https://www.gstatic.com",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "media-src 'self' blob:",
      "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.openai.com https://api.stripe.com https://*.sentry.io",
      "frame-src https://www.google.com https://js.stripe.com",
      "worker-src 'self' blob:",
    ].join('; ')
  },
]
```

### 6-3. 認証フロー図

#### 企業ユーザー
```
ブラウザ → Supabase Auth (email+password)
         → JWT Access Token 発行
         → Cookie保存 (httpOnly, secure, sameSite=lax)
         → API Request に Bearer Token 付与
         → RLS が company_id スコープで制御
```

#### 運営ユーザー
```
ブラウザ → Supabase Auth (email+password)
         → MFA Challenge (TOTP)
         → TOTP検証
         → JWT Access Token 発行
         → admin_users テーブルで権限確認
```

#### 応募者
```
ブラウザ → サーバー (電話番号)
         → Twilio Verify (SMS送信)
         → ブラウザ → サーバー (OTPコード)
         → Twilio Verify (OTP検証)
         → カスタムセッショントークン発行
         → Cookie保存
```

### 6-4. 秘密情報管理

| 項目 | 管理場所 | アクセス |
|------|---------|---------|
| 環境変数（本番） | Vercel Environment Variables | 暗号化保存、デプロイ時注入 |
| 環境変数（開発） | `.env.local`（gitignore済み） | ローカルのみ |
| Supabase Service Role Key | Vercel環境変数 | サーバーサイドのみ |
| Stripe Secret Key | Vercel環境変数 | サーバーサイドのみ |
| バッチシークレット | Vercel環境変数 | Cron Job認証 |

---

## 7. 監視・アラート

### 7-1. 監視スタック

| ツール | 対象 | アラート |
|--------|------|---------|
| **Sentry** | エラー（フロント＋サーバー） | Slack / メール |
| **Vercel Analytics** | Core Web Vitals、パフォーマンス | ダッシュボード |
| **Supabase Dashboard** | DBパフォーマンス、slow query | ダッシュボード |
| **Stripe Dashboard** | 決済成功率、失敗 | Webhook → メール |
| **カスタムバッチ** | レポート生成失敗、録画失敗 | Resend → メール |

### 7-2. アラート閾値

| メトリクス | 閾値 | アラート先 |
|-----------|------|----------|
| エラーレート | > 1%/時間 | 運営メール |
| API応答時間 P95 | > 3秒 | Sentry |
| DB接続数 | > 80% | Supabase Dashboard |
| レポート生成失敗 | 3回連続 | 運営メール |
| 録画アップロード失敗 | 発生時 | 運営メール |
| Stripe決済失敗 | 発生時 | 企業・運営メール |
| SMS異常リクエスト | 1分10回以上/IP | 運営メール |

### 7-3. ログ

| ログ種別 | 保存先 | 保持期間 |
|---------|--------|---------|
| アプリケーションログ | Vercel Logs | 7日（Proプラン） |
| エラーログ | Sentry | 90日 |
| DBクエリログ | Supabase Dashboard | 7日 |
| アクセスログ | Vercel Analytics | 30日 |
| ログイン試行ログ | login_attempts テーブル | 永年 |
| セキュリティアラート | security_alerts テーブル | 永年 |

---

## 8. パフォーマンス最適化

### 8-1. Next.js最適化

| 最適化 | 設定 |
|--------|------|
| Image最適化 | `next/image` + Vercel Image Optimization |
| 静的アセット | `public/` → CDN配信 |
| Code Splitting | App Router自動分割 |
| Prefetch | `<Link>` 自動プリフェッチ |

### 8-2. Supabase最適化

| 最適化 | 設定 |
|--------|------|
| Connection Pooling | pgBouncer (Transaction mode) |
| インデックス | 検索・フィルタ対象カラムにB-tree |
| select最適化 | 必要カラムのみselect |
| ページネーション | range()によるオフセット |

#### 推奨インデックス
```sql
CREATE INDEX idx_applicants_company_id ON applicants(company_id);
CREATE INDEX idx_applicants_created_at ON applicants(created_at DESC);
CREATE INDEX idx_applicants_selection_status ON applicants(selection_status);
CREATE INDEX idx_applicants_phone_company ON applicants(phone_number, company_id);
CREATE INDEX idx_applicants_name_birth ON applicants(last_name, first_name, birth_date);
CREATE INDEX idx_interviews_applicant_id ON interviews(applicant_id);
CREATE INDEX idx_interview_logs_interview_id ON interview_logs(interview_id);
CREATE INDEX idx_reports_interview_id ON reports(interview_id);
CREATE INDEX idx_internal_memos_applicant_id ON internal_memos(applicant_id);
CREATE INDEX idx_sms_rate_limits_phone ON sms_rate_limits(phone_number);
CREATE INDEX idx_sms_rate_limits_ip ON sms_rate_limits(ip_address);
CREATE INDEX idx_login_attempts_email ON login_attempts(email);
```

### 8-3. R2最適化

| 最適化 | 設定 |
|--------|------|
| マルチパートアップロード | パートサイズ 5MiB以上 |
| 並列アップロード | 最大3パート同時 |
| リトライ | 各パート最大3回 |

---

## 9. 依存パッケージ

### 9-1. Productionパッケージ

| パッケージ | バージョン | 用途 |
|-----------|----------|------|
| `next` | 16.x | フレームワーク |
| `react` / `react-dom` | 19.x | UI |
| `@supabase/ssr` | 0.8.x | Supabase SSR統合 |
| `@supabase/supabase-js` | 2.x | Supabaseクライアント |
| `stripe` | 20.x | Stripe サーバーSDK |
| `@stripe/stripe-js` | 8.x | Stripe クライアントSDK |
| `resend` | 6.x | メール送信 |
| `@sentry/nextjs` | 10.x | エラー監視 |
| `zod` | 4.x | バリデーション |
| `react-hook-form` | 7.x | フォーム管理 |
| `@hookform/resolvers` | 5.x | zodリゾルバ |
| `date-fns` | 4.x | 日付操作 |
| `clsx` | 2.x | className結合 |
| `tailwind-merge` | 3.x | Tailwindクラスマージ |
| `lucide-react` | 0.x | アイコン |

### 9-2. 未導入（今後追加予定）

| パッケージ | 用途 | 導入タイミング |
|-----------|------|--------------|
| `@aws-sdk/client-s3` | R2マルチパートアップロード | 録画機能実装時 |
| `@aws-sdk/s3-request-presigner` | R2署名付きURL | 録画再生実装時 |
| `twilio` | SMS送信 | 応募者認証実装時 |
| `chart.js` or `recharts` | レーダーチャート | フィードバック実装時 |
| `openai` | GPT API（レポート生成） | レポート機能実装時 |
| `idb` | IndexedDB操作 | 録画バックアップ実装時 |

---

## 10. コスト見積もり（月間100面接の場合）

| サービス | プラン | 月額目安 |
|---------|--------|---------|
| Vercel | Pro | $20 |
| Supabase | Pro | $25 |
| OpenAI Realtime API | 従量課金 | 〜$50 (100面接 × $0.50) |
| OpenAI GPT API | 従量課金 | 〜$2 (レポート+FB) |
| Cloudflare R2 | 従量課金 | 〜$1 (ストレージ10GB) |
| Stripe | 従量課金 | 取引の2.9%+$0.30 |
| Twilio Verify | 従量課金 | 〜$5 (100回 × $0.05) |
| Resend | 無料枠 | $0 (3,000通/月まで無料) |
| Sentry | Developer | $0 (5,000イベント/月) |
| Google reCAPTCHA | 無料 | $0 |
| **合計** | | **〜$103/月** (インフラのみ) |

※ ドメイン費用、SSL証明書（Vercel自動）は含まず

---

## 11. 障害対応

### 11-1. 障害レベル定義

| レベル | 定義 | 対応時間 | 例 |
|--------|------|---------|-----|
| **P1 (Critical)** | サービス全面停止 | 30分以内に対応開始 | Vercelダウン、Supabaseダウン |
| **P2 (High)** | 主要機能の障害 | 1時間以内に対応開始 | 面接接続不可、レポート生成全失敗 |
| **P3 (Medium)** | 一部機能の障害 | 4時間以内に対応開始 | 録画アップロード失敗、メール送信失敗 |
| **P4 (Low)** | 軽微な問題 | 翌営業日対応 | UI表示崩れ、非重要ログエラー |

### 11-2. 障害時の連絡フロー

```
Sentry/監視アラート検知
  ↓
運営メール通知（自動）
  ↓
障害レベル判定
  ↓
P1/P2 → 即時対応 → ステータスページ更新
P3/P4 → 翌営業日以降に対応
```

### 11-3. ロールバック手順

```
1. Vercel Dashboard → Deployments
2. 正常動作している前回のデプロイを選択
3. "Promote to Production" をクリック
4. DBマイグレーションが含まれる場合はSupabaseで手動ロールバック
```

---

## 12. 未決定事項

| 項目 | 状態 | 備考 |
|------|------|------|
| ドメイン名 | `ai-jinji24h.com` 予定 | 取得未完了 |
| 送信元メールアドレス | `noreply@ドメイン名` | ドメイン取得後にResend設定 |
| サポートメールアドレス | `support@ドメイン名` | ドメイン取得後に設定 |
| Vercelチーム | 未作成 | Proプラン契約時に作成 |
| Supabase本番プロジェクト | 未作成 | 本番デプロイ前に作成 |
| Stripe本番アカウント | テストモード | ライブモード切替はローンチ前 |
| Sentry Organization | 未設定 | 開発環境でのテスト後に設定 |
