# AI人事24h API設計書 v1.1

## 概要

本書はAI人事24hの全APIエンドポイント（全66本）の詳細仕様を定義する。
要件定義書 v7.1（docs/REQUIREMENTS.md）に準拠。

### 基本仕様
- **フレームワーク:** Next.js App Router Route Handlers
- **ベースパス:** `/api`
- **リクエスト形式:** JSON (`Content-Type: application/json`)
- **レスポンス形式:** JSON
- **認証:** Supabase Auth（企業・運営）/ Twilio Verify（応募者）
- **データベース:** Supabase PostgreSQL + RLS

### エラーレスポンス形式（全API共通）
```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "日本語の説明文"
  }
}
```

### 共通エラーコード
| コード | HTTPステータス | 説明 |
|--------|--------------|------|
| `UNAUTHORIZED` | 401 | 認証が必要 |
| `FORBIDDEN` | 403 | アクセス権限がない |
| `NOT_FOUND` | 404 | リソースが見つからない |
| `VALIDATION_ERROR` | 400 | リクエストパラメータ不正 |
| `RATE_LIMITED` | 429 | レート制限超過 |
| `INTERNAL_ERROR` | 500 | サーバー内部エラー |
| `CONFLICT` | 409 | リソースの競合 |

### 認証ヘッダー
```
Authorization: Bearer <supabase_access_token>
```
応募者APIはセッションCookieまたはカスタムトークンで認証。

---

## 1. 応募者API（15本）

パスプレフィックス: `/api/interview`

### INT-001: 面接スラッグ検証
```
GET /api/interview/[slug]
```
面接URLの有効性を検証し、企業情報を返す。

> **整理注記（現行フロー）**: 公開面接フロー（page/verify/prepare/form）の企業情報取得は **INT-016 `GET /api/interview/[slug]/public-config`（service-role・安全列のみ）** に置換済み。本エントリは旧仕様で、現行フローでは未使用（削除はせず温存）。

**認証:** 不要

**レスポンス（200）:**
```json
{
  "company": {
    "id": "uuid",
    "name": "株式会社A",
    "logo_url": "https://...",
    "interview_slug": "abc123"
  },
  "available": true
}
```

**エラー:**
| コード | 説明 |
|--------|------|
| `SLUG_NOT_FOUND` | 無効なスラッグ |
| `COMPANY_INACTIVE` | 企業が停止中 |
| `PLAN_LIMIT_REACHED` | 月間上限到達（monthly_interview_limit・available: false） |

---

### INT-002: SMS送信
```
POST /api/interview/sms/send
```
Twilio Verify経由でSMS認証コードを送信する。

**認証:** 不要（reCAPTCHA v3トークン必須）

**リクエスト:**
```json
{
  "phone_number": "+819012345678",
  "company_id": "uuid",
  "recaptcha_token": "xxx"
}
```

**レスポンス（200）:**
```json
{
  "sent": true,
  "expires_in": 300
}
```

**レート制限（第2層）:**
- 同一電話番号: 1日5回
- 同一IP: 1時間3回
- 同一IPから異なる番号: 1日10回
- 再送間隔: 60秒

**エラー:**
| コード | 説明 |
|--------|------|
| `RECAPTCHA_FAILED` | reCAPTCHA検証失敗 |
| `RATE_LIMITED` | SMS送信制限超過 |
| `PHONE_LOCKED` | 電話番号がロック済み |
| `ALREADY_INTERVIEWED` | 再受験制限（1年以内に面接済み） |

---

### INT-003: SMS検証
```
POST /api/interview/sms/verify
```
OTPコードを検証する。

**認証:** 不要

**リクエスト:**
```json
{
  "phone_number": "+819012345678",
  "code": "123456",
  "company_id": "uuid"
}
```

**レスポンス（200）:**
```json
{
  "verified": true,
  "session_token": "xxx"
}
```

**エラー:**
| コード | 説明 |
|--------|------|
| `INVALID_CODE` | 認証コード不正 |
| `CODE_EXPIRED` | 認証コード期限切れ |
| `OTP_LOCKED` | 5回連続失敗で永久ロック |

---

### INT-004: 再受験チェック
```
GET /api/interview/check-reexam?phone_number=xxx&company_id=xxx
```
同一電話番号×同一企業の再受験可否を確認する。

> **整理注記**: 再受験/冷やかしロック（`interview_re_exam_records` / `cooldown_locks`）は未実装で、本APIは現行公開フローでは未使用。SMS（Twilio）実装フェーズで再設計（削除はせず温存）。

**認証:** セッショントークン

**レスポンス（200）:**
```json
{
  "can_interview": true,
  "last_interview_date": null
}
```

**エラー:**
| コード | 説明 |
|--------|------|
| `REEXAM_BLOCKED` | 1年以内に面接済み |
| `PRANK_LOCKED` | 冷やかしロック中 |

---

### INT-005: 職種一覧取得
```
GET /api/interview/job-types?company_id=xxx
```
企業に設定された職種一覧を返す。

> **整理注記（現行フロー）**: 公開フォームの職種（求人）一覧は **INT-016 `GET /api/interview/[slug]/public-config`** が返す active jobs（id/title/employment_type）に統合済み。本エントリは現行フローでは未使用（削除はせず温存）。

**認証:** セッショントークン

**レスポンス（200）:**
```json
{
  "job_types": [
    { "id": "uuid", "name": "営業職" },
    { "id": "uuid", "name": "事務職" },
    { "id": "uuid", "name": "エンジニア" }
  ]
}
```

---

### 公開面接フロー共通: ケイパビリティ・トークン（HMAC）

> **Phase 2-a で実装済み。** 公開面接フロー（未ログイン）の主要書き込みを **token付き service-role API** に移行した（browser からの applicants/interviews 直書きは撤去）。以下 INT-006〜009 / INT-014 は現行実装。

- **方式**: HMAC-SHA256（`lib/interview/capability-token.ts`：`signInterviewToken` / `verifyInterviewToken`）。外部パッケージ不要（node:crypto）・DBカラム不要・Node runtime。
- **署名鍵**: `INTERVIEW_TOKEN_SECRET`（**サーバ専用・`NEXT_PUBLIC_` 不可・値はコミット禁止**）。
- **payload**: `{ slug, applicant_id, iat, exp }`（exp あり＝既定2時間）。`timingSafeEqual` で署名検証。
- **発行**: 応募者作成（INT-006）成功時にサーバが発行 → クライアントは sessionStorage（`interview_${slug}_token`）に保持し、以降の API に添付。
- **各APIの再検証**: ① token 署名・exp ② URL `slug` == token.slug ＆ slug→company 実在・有効（停止中は拒否）③ body.applicant_id == token.applicant_id ＆ applicant.company_id == company.id ④ interview 操作時は interview.applicant_id == applicant_id。
- 実書き込みは **service-role（RLS bypass）**。**secret / service-role key はレスポンスに返さない**。

---

### INT-006: 応募者作成（公開フロー・service-role＋token発行）
```
POST /api/interview/[slug]/applicant
```
> 旧仕様 `POST /api/interview/applicant`（セッショントークン・`company_id` をクライアント送信・`job_type_id`）は**廃止**。`company_id` は slug からサーバ側で確定する。

フォーム入力を保存し applicants を作成、ケイパビリティ・トークンを発行する。

**認証:** なし（未ログイン）。作成は **service-role**。

**リクエスト（応募者入力。company_id/status 等のサーバ確定値は送っても無視）:**
```json
{
  "last_name": "山田", "first_name": "太郎",
  "last_name_kana": "ヤマダ", "first_name_kana": "タロウ",
  "birth_date": "1995-05-15", "gender": "male",
  "phone_number": "+819012345678", "email": "taro@example.com",
  "age": 28, "prefecture": "東京都", "education": "university",
  "employment_type": "mid_career", "industry_experience": "experienced",
  "job_id": "uuid", "work_history": "...", "qualifications": "..."
}
```

**検証/処理:**
- 必須最低限（姓・名・phone_number・email）。`job_id` がある場合は**当該 company の jobs に属するか検証**（不正は 400）。
- **サーバ確定**: `company_id`（slug由来）／`status='準備中'`／`selection_status='pending'`／`result='未対応'`／`duplicate_flag=false`／`inappropriate_flag=false`。
- 無効 slug = 404／停止中 company = 403。

**レスポンス（200）:**
```json
{ "applicant_id": "uuid", "company_id": "uuid", "token": "<capability token>" }
```
クライアントは `interview_${slug}_applicant_id` / `_company_id` / `_token` を sessionStorage に保存。

---

### INT-007: 面接開始（公開フロー・service-role＋token）
```
POST /api/interview/[slug]/start
```
> 旧仕様 `POST /api/interview/session/start`（セッショントークン・realtime_config 返却）は**廃止**。OpenAI Realtime 接続情報（ephemeral key 等）は未導入（P-10）で、本APIは interview レコードの作成のみを行う。

**認証:** なし（未ログイン）。**service-role**。

**リクエスト:**
```json
{ "token": "<capability token>", "applicant_id": "uuid" }
```

**検証/処理:**
- token 検証（slug / applicant_id 一致）・company（停止中は 403）・applicant（company 一致）。`applicant.job_id` が当該 company の jobs か検証（不正なら job_id=null 扱い）。
- **再入場/リロード対策**: 同一 applicant の既存 `in_progress` interview を **`cancelled`** にしてから新規作成（孤児を残さない）。
- `interviews` を `status='in_progress'` で INSERT。

**レスポンス（200）:**
```json
{ "interview_id": "uuid", "job_id": "uuid|null", "company_id": "uuid" }
```
クライアントは `interview_${slug}_interview_id` を sessionStorage に保存。

---

### INT-008: 面接終了（公開フロー・service-role＋token）
```
POST /api/interview/[slug]/end
```
> 旧仕様 `POST /api/interview/session/log`（発話ログ送信）は**廃止**（発話ログ＝interview_logs の保存は OpenAI Realtime 連携＝P-10 で別途）。本APIは面接の終了確定を行う。

面接を終了し、interviews と **applicants.status をサーバ確定**する（anon は applicants を更新できないため end API で確定）。

**認証:** なし（未ログイン）。**service-role**。明示終了は `fetch`、タブ閉じは token付き `sendBeacon` で呼ぶ。

**リクエスト:**
```json
{
  "token": "<capability token>", "applicant_id": "uuid", "interview_id": "uuid",
  "final_status": "completed",
  "end_reason": "全質問完了", "duration_seconds": 1680,
  "total_questions": 8, "answered_questions": 8
}
```
- `final_status` は **`completed` / `cancelled` のみ**許可。

**検証/処理:**
- token（slug/applicant_id）・company（停止中403）・applicant（company一致）・interview（applicant一致）。
- 対象 interview を `status=final_status`・`ended_at`・`duration_seconds`・`total_questions`・`answered_questions`・`end_reason`・**`is_billable`（INT-009：`duration_seconds > 600`＝10分超）** で確定。
- **applicants.status をサーバ確定**: `completed`→`'完了'`／`cancelled`→`'途中離脱'`（＋`result='不採用'`）。
- 同一 applicant の他の `in_progress` interview を **`cancelled`** 化。

**レスポンス（200）:**
```json
{ "interview_id": "uuid", "final_status": "completed" }
```

---

### INT-009: 質問スナップショット保存（公開フロー・service-role＋token）
```
POST /api/interview/[slug]/snapshot
```
> 旧仕様 `POST /api/interview/session/end`（セッショントークン・レポート/フィードバック非同期開始）は**廃止**。終了確定は INT-008（end）に統合。レポート/フィードバック生成（EBCA writer）は OpenAI 連携＝P-10 で別途。

面接で提示した質問リストを `interviews.questions_snapshot` に保存する。

**認証:** なし（未ログイン）。**service-role**。

**リクエスト:**
```json
{
  "token": "<capability token>", "applicant_id": "uuid", "interview_id": "uuid",
  "questions_snapshot": [ { "sort_order": 1, "question_text": "自己紹介をお願いします" } ]
}
```

**検証/処理:**
- token（slug/applicant_id）・company（停止中403）・applicant（company一致）・interview（applicant一致）。
- `questions_snapshot` は**配列のみ**。**interview.status='in_progress' のときのみ更新**（それ以外は 400）。
- 保存失敗は応募者の面接本体を止めない（クライアントは fire-and-forget）。

**レスポンス（200）:** `{ "interview_id": "uuid" }`

---

#### 応募者ステータス仕様（表示導出）
- DBの **`applicants.status` は CHECK 制約で `準備中` / `完了` / `途中離脱` の3値のみ**。「面接中」は**DBに保存しない**。
- 表示は **最新 `interviews.status` から導出**（`lib/applicants/displayStatus.ts`）: `in_progress`→面接中／`completed`→完了／`cancelled`→途中離脱／interview無→準備中。**`applicants.status='完了'/'途中離脱'` を最優先**。最新は `created_at` 降順先頭（古い in_progress 孤児に引っ張られない）。
- `interviews.status` 運用 = `in_progress` / `completed` / `cancelled`。`completed`＝正常完了、`cancelled`＝途中離脱。is_billable は10分超（INT-008）。

---

### INT-010: 録画アップロード（マルチパート開始）
```
POST /api/interview/recording/initiate
```
Cloudflare R2へのマルチパートアップロードを開始する。

**認証:** セッショントークン

**リクエスト:**
```json
{
  "interview_id": "uuid",
  "content_type": "video/webm",
  "total_size": 52428800
}
```

**レスポンス（200）:**
```json
{
  "upload_id": "xxx",
  "key": "recordings/uuid/video.webm"
}
```

---

### INT-011: 録画アップロード（パート署名URL取得）
```
POST /api/interview/recording/part-url
```
各パートのアップロード用署名付きURLを発行する。

**認証:** セッショントークン

**リクエスト:**
```json
{
  "upload_id": "xxx",
  "key": "recordings/uuid/video.webm",
  "part_number": 1
}
```

**レスポンス（200）:**
```json
{
  "signed_url": "https://r2.example.com/...",
  "part_number": 1
}
```

---

### INT-012: 録画アップロード（完了通知）
```
POST /api/interview/recording/complete
```
マルチパートアップロードの完了を通知する。

**認証:** セッショントークン

**リクエスト:**
```json
{
  "interview_id": "uuid",
  "upload_id": "xxx",
  "key": "recordings/uuid/video.webm",
  "parts": [
    { "part_number": 1, "etag": "\"abc123\"" },
    { "part_number": 2, "etag": "\"def456\"" }
  ]
}
```

**レスポンス（200）:**
```json
{
  "recording_status": "completed",
  "recording_key": "recordings/uuid/video.webm"
}
```

`recording_status`:
| 値 | 説明 |
|----|------|
| `completed` | 全パート成功 |
| `partial` | 一部パート失敗（部分欠損） |
| `failed` | 全パート失敗（録画なし） |

`partial` / `failed` 時は運営にメール通知。

---

### INT-013: 応募者フィードバック取得
```
GET /api/interview/feedback?interview_id=xxx
```
応募者向けフィードバック生成結果を取得する（ポーリング）。

**認証:** セッショントークン

**レスポンス（200）— 生成完了時:**
```json
{
  "status": "completed",
  "strengths": [
    "コミュニケーション力が高く、質問の意図を正確に理解して回答できています",
    "具体的なエピソードを交えた説明が分かりやすいです",
    "論理的な構成で話を組み立てる力があります"
  ],
  "personality": {
    "action": { "score": 4, "comment": "積極的に行動を起こす傾向があります" },
    "cooperation": { "score": 5, "comment": "チームでの成果を重視する傾向があります" },
    "analysis": { "score": 3, "comment": "データに基づいた判断を心がけています" },
    "creativity": { "score": 4, "comment": "新しいアプローチを試みる姿勢があります" },
    "stability": { "score": 4, "comment": "冷静に状況を判断できる傾向があります" }
  }
}
```

**レスポンス（200）— 生成中:**
```json
{
  "status": "generating"
}
```

---

### INT-014: 満足度評価送信（公開フロー・service-role＋token）
```
POST /api/interview/[slug]/satisfaction
```
> **実装済み（Phase 2-a）**。旧仕様 `POST /api/interview/satisfaction`（セッショントークン・interview_id ベース）／complete画面のブラウザ直 update は**廃止**。

面接体験の満足度評価を保存する。**認証:** なし（未ログイン）・**service-role**。

**リクエスト:**
```json
{ "token": "<capability token>", "applicant_id": "uuid", "satisfaction_rating": 4 }
```
- `satisfaction_rating`: **1〜5 の整数のみ**（範囲外/非整数は 400）。

**検証/処理:** token（slug/applicant_id）・company（停止中403）・applicant（company一致）→ `applicants.satisfaction_rating` ＋ `updated_at` を service-role で更新。

**レスポンス（200）:** `{ "applicant_id": "uuid", "satisfaction_rating": 4 }`

---

### INT-016: 公開設定取得（公開フロー・service-role・読み取り）
```
GET /api/interview/[slug]/public-config
```
> **実装済み（Phase 2-d-1）**。`/interview/[slug]` の page/verify/prepare/form の **companies/jobs browser anon 直読みを置換**。これにより companies/jobs の anon SELECT を遮断（Phase 2-d / 2-d-3）。

公開面接フォームの表示に必要な企業情報と求人一覧を返す。**認証:** なし（未ログイン）・**service-role**（token 不要）。

**処理/検証:** slug → `companies` を特定（無効 → `NOT_FOUND`）→ companies の**安全列のみ**＋当該企業の active jobs を返す。

**レスポンス（200）:**
```json
{
  "id": "uuid", "name": "株式会社A", "logo_url": "https://...",
  "interview_slug": "abc123", "is_suspended": false, "is_demo": false,
  "brand_color": "#1234ab", "avatar_config": { },
  "company": { "id": "uuid", "name": "株式会社A" },
  "jobs": [ { "id": "uuid", "title": "営業職", "employment_type": "fulltime" } ]
}
```
- **返さない（機微列）**: email / phone / contact / price_per_interview / plan / monthly_interview_* / stripe_customer_id / stripe_subscription_id / company_setting_password_hash / auth_user_id 等。service-role key / secret も返さない。

---

### INT-017: 面接質問取得（公開フロー・service-role＋token）
```
POST /api/interview/[slug]/questions
```
> **実装済み（Phase 2-d-1）**。`/interview/[slug]/session` の `job_questions` browser anon 直読みを置換 → job_questions の anon SELECT を遮断（Phase 2-d-3）。
> **旧 `GET /api/interview/[slug]/questions`** は旧スキーマ（`question_banks` / `questions`）参照の未使用APIで温存。**現行は本 POST**。

面接の質問一覧を返す。**認証:** なし（未ログイン）・**service-role＋capability token**。

**リクエスト:**
```json
{ "token": "<capability token>", "applicant_id": "uuid", "interview_id": "uuid" }
```

**検証/処理:** token（slug/applicant_id 一致）→ company（停止中403）→ applicant（company一致）→ interview（applicant一致）→ applicant.job_id があれば job（company一致）→ `job_questions` を **question_text / sort_order のみ**・sort_order 昇順で返す。job_id 無し/質問無しは空配列（呼び出し側の既定質問フォールバックを維持）。

**レスポンス（200）:** `{ "questions": [ { "question_text": "...", "sort_order": 1 } ] }`
- job_questions の他列・secret・service-role key は返さない。

---

### INT-015: 冷やかしカウント記録
```
POST /api/interview/prank-count
```
面接開始後10分未満での離脱を記録する。

**認証:** セッショントークン

**リクエスト:**
```json
{
  "phone_number": "+819012345678",
  "interview_id": "uuid",
  "reason": "user_ended"
}
```

**レスポンス（200）:**
```json
{
  "prank_count": 2,
  "locked": false
}
```

3回到達時: `locked: true`、以降の面接開始を拒否。

---

## 2. 企業API（24本）

パスプレフィックス: `/api/client`

認証: すべてSupabase Auth Bearer Token必須。RLSにより自社データのみアクセス可能。

### CLI-001: 企業情報取得
```
GET /api/client/company
```
ログイン中の企業情報を取得する。

**レスポンス（200）:**
```json
{
  "id": "uuid",
  "name": "株式会社A",
  "email": "admin@companya.com",
  "interview_slug": "abc123",
  "plan": "pay_per_use",
  "price_per_interview": 4000,
  "monthly_interview_limit": 20,
  "next_month_interview_limit": null,
  "next_month_limit_effective_month": null,
  "status": "active",
  "onboarding_completed": false,
  "created_at": "2024-06-01T00:00:00Z"
}
```

---

### CLI-002: オンボーディング完了記録
```
POST /api/client/onboarding/complete
```
オンボーディングツアーの完了/スキップを記録する。

**レスポンス（200）:**
```json
{
  "onboarding_completed": true
}
```

---

### CLI-003: 応募者一覧取得
```
GET /api/client/applicants?page=1&per_page=20&status=all&search=&sort=created_at&order=desc
```

**クエリパラメータ:**
| パラメータ | 型 | デフォルト | 説明 |
|-----------|-----|-----------|------|
| page | number | 1 | ページ番号 |
| per_page | number | 20 | 1ページの件数 |
| status | string | `all` | `all` / `pending` / `second_interview` / `rejected` |
| search | string | - | 氏名キーワード検索 |
| date_from | string | - | 日付範囲開始 (YYYY-MM-DD) |
| date_to | string | - | 日付範囲終了 (YYYY-MM-DD) |
| job_type_id | string | - | 職種フィルタ |
| rank | string | - | 評価ランクフィルタ (A〜E) |
| sort | string | `created_at` | ソート項目 |
| order | string | `desc` | `asc` / `desc` |

**レスポンス（200）:**
```json
{
  "applicants": [
    {
      "id": "uuid",
      "last_name": "山田",
      "first_name": "太郎",
      "job_type_name": "営業職",
      "selection_status": "pending",
      "rank": "B",
      "total_score_100": 75,
      "summary_points": "コミュニケーション力が高く...",
      "report_status": "completed",
      "duplicate_flag": false,
      "inappropriate_flag": false,
      "created_at": "2025-01-15T10:00:00Z"
    }
  ],
  "total_count": 30,
  "page": 1,
  "per_page": 20
}
```

---

### CLI-004: 応募者詳細取得
```
GET /api/client/applicants/[id]
```

**レスポンス（200）:**
```json
{
  "applicant": {
    "id": "uuid",
    "last_name": "山田",
    "first_name": "太郎",
    "last_name_kana": "ヤマダ",
    "first_name_kana": "タロウ",
    "birth_date": "1995-05-15",
    "gender": "male",
    "phone_number": "+819012345678",
    "email": "taro@example.com",
    "prefecture": "東京都",
    "education": "university",
    "employment_type": "mid_career",
    "industry_experience": "experienced",
    "job_type_name": "営業職",
    "work_history": "...",
    "qualifications": "...",
    "selection_status": "pending",
    "duplicate_flag": false,
    "inappropriate_flag": false,
    "created_at": "2025-01-15T10:00:00Z"
  },
  "interview": {
    "id": "uuid",
    "duration_seconds": 1680,
    "question_count": 8,
    "recording_status": "completed",
    "started_at": "2025-01-15T10:00:00Z",
    "ended_at": "2025-01-15T10:28:00Z"
  }
}
```

---

### CLI-005: ステータス更新
```
PATCH /api/client/applicants/[id]/status
```

**リクエスト:**
```json
{
  "selection_status": "second_interview"
}
```

`selection_status`: `pending` / `second_interview` / `rejected`

**レスポンス（200）:**
```json
{
  "updated": true,
  "old_status": "pending",
  "new_status": "second_interview"
}
```

`selection_status_histories` テーブルに履歴を自動記録。

---

### CLI-006: レポート取得
```
GET /api/client/applicants/[id]/report
```

**レスポンス（200）:**
```json
{
  "report": {
    "id": "uuid",
    "status": "completed",
    "rank": "B",
    "total_score_100": 75,
    "summary_points": "...",
    "overall_comment": "...",
    "created_at": "2025-01-15T10:35:00Z"
  },
  "axis_scores": [
    { "axis": "communication", "axis_score": 16, "axis_rank": "B" },
    { "axis": "logical_thinking", "axis_score": 14, "axis_rank": "B" },
    { "axis": "initiative", "axis_score": 15, "axis_rank": "B" },
    { "axis": "desire", "axis_score": 17, "axis_rank": "A" },
    { "axis": "stress_tolerance", "axis_score": 12, "axis_rank": "C" },
    { "axis": "integrity", "axis_score": 16, "axis_rank": "B" }
  ],
  "qa_summaries": [
    {
      "sort_order": 1,
      "question_text_snapshot": "自己紹介をお願いします",
      "answer_summary": "営業職として3年間の経験を持ち..."
    }
  ]
}
```

`status` が `partial`（10分超で中断した部分レポート）の場合、判断材料が得られない軸は `score: null` とし `insufficient_reason` を付与する（後述の evaluation_axes スキーマ参照）。

#### 評価方式：Evidence-based Competency Analysis（エビデンスベース・コンピテンシー分析）

AI評価は**面接全体の回答を横断的に分析**し、6軸でコンピテンシーを根拠ベースにスコア化する（質問ごとに軸/重みを事前設定する旧方式は廃止。カスタム質問でも評価可能）。評価結果は **`interview_results.evaluation_axes`（jsonb）** に格納する。

**6軸キー（統一）:** `communication` / `logical_thinking` / `initiative` / `desire` / `stress_tolerance` / `integrity`

**evaluation_axes スキーマ:**
```json
[
  {
    "axis": "communication",
    "label": "コミュニケーション力",
    "score": 16,
    "rank": "B",
    "evidence": ["質問の意図を正確に汲み、具体的な数値で簡潔に回答していた"],
    "confidence": "high",
    "insufficient_reason": null
  },
  {
    "axis": "integrity",
    "label": "誠実性・一貫性",
    "score": null,
    "rank": null,
    "evidence": [],
    "confidence": "low",
    "insufficient_reason": "該当軸を判断できる発言が面接中に得られなかった"
  }
]
```

- `score`: 0〜20（**判断材料不足の軸は `null`**）。`rank`: A〜E（不足時は `null`）。
- `evidence`: 応募者の発言（原文/要約）に基づく根拠の配列（1つ以上が望ましい）。
- `confidence`: `high` / `medium` / `low`。
- `insufficient_reason`: 判断材料不足時の理由（断定できる根拠が無い軸）。十分なら `null`。
- 総合スコア（total_score・100換算）は判断可能な軸を集約して算出する。

**書き込み（P-10 / OpenAI評価生成）:** 面接終了後、OpenAIが全Q&Aを横断入力として6軸の `score / rank / evidence / confidence / insufficient_reason` を生成し、`interview_results.evaluation_axes` と `total_score` / `detail_json` に書き込む（writer は P-10 で実装。現状は未実装でシードデータのみ）。`evaluation_axes` 列は jsonb のため **DBスキーマ変更は不要**。

---

### CLI-007: 面接ログ取得
```
GET /api/client/applicants/[id]/logs
```

**レスポンス（200）:**
```json
{
  "logs": [
    { "speaker": "ai", "content": "自己紹介をお願いします", "timestamp_ms": 1705312800000 },
    { "speaker": "applicant", "content": "はい、私は...", "timestamp_ms": 1705312805000 }
  ]
}
```

---

### CLI-008: 録画再生URL取得
```
GET /api/client/applicants/[id]/recording-url
```
Cloudflare R2の署名付きURLを発行する。

**レスポンス（200）:**
```json
{
  "url": "https://r2.example.com/signed/...",
  "expires_in": 600,
  "recording_status": "completed"
}
```

署名付きURL仕様:
- 有効期限: 10分
- IP制限: 発行時のIPアドレスに限定
- 再生のたびに新規発行

`recording_status`:
| 値 | 説明 |
|----|------|
| `completed` | 正常 |
| `partial` | 部分欠損あり |
| `none` | 録画データなし |

---

### CLI-009: メモ一覧取得
```
GET /api/client/applicants/[id]/memos
```

**レスポンス（200）:**
```json
{
  "memos": [
    {
      "id": "uuid",
      "content": "面接態度が良い。二次面接候補。",
      "created_at": "2025-01-15T11:00:00Z",
      "updated_at": "2025-01-15T11:00:00Z"
    }
  ]
}
```

---

### CLI-010: メモ作成
```
POST /api/client/applicants/[id]/memos
```

**リクエスト:**
```json
{
  "content": "面接態度が良い。二次面接候補。"
}
```

`content`: 必須、最大2000文字

**レスポンス（201）:**
```json
{
  "id": "uuid",
  "content": "面接態度が良い。二次面接候補。",
  "created_at": "2025-01-15T11:00:00Z"
}
```

---

### CLI-011: メモ更新
```
PATCH /api/client/applicants/[id]/memos/[memo_id]
```

**リクエスト:**
```json
{
  "content": "更新後のメモ内容"
}
```

**レスポンス（200）:**
```json
{
  "id": "uuid",
  "content": "更新後のメモ内容",
  "updated_at": "2025-01-15T12:00:00Z"
}
```

---

### CLI-012: メモ削除
```
DELETE /api/client/applicants/[id]/memos/[memo_id]
```

**レスポンス（200）:**
```json
{
  "deleted": true
}
```

---

### CLI-013: CSVエクスポート
```
GET /api/client/applicants/export/csv?status=all&search=&date_from=&date_to=&job_type_id=&rank=
```
現在のフィルタ条件を適用した応募者一覧をCSVで返す。

**レスポンスヘッダー:**
```
Content-Type: text/csv; charset=utf-8
Content-Disposition: attachment; filename="applicants_20250115.csv"
```

**CSV列:**
```
氏名,メールアドレス,電話番号,希望職種,総合評価,ステータス,面接日
```

---

### CLI-014: テンプレート一覧取得
```
GET /api/client/templates
```

**レスポンス（200）:**
```json
{
  "templates": [
    {
      "id": "uuid",
      "template_type": "second_interview",
      "subject": "【{企業名}】二次面接のご案内",
      "body": "{応募者名} 様...",
      "updated_at": "2025-01-10T00:00:00Z"
    },
    {
      "id": "uuid",
      "template_type": "rejection",
      "subject": "【{企業名}】選考結果のご連絡",
      "body": "{応募者名} 様...",
      "updated_at": "2025-01-10T00:00:00Z"
    }
  ]
}
```

---

### CLI-015: テンプレート更新
```
PATCH /api/client/templates/[id]
```

**リクエスト:**
```json
{
  "subject": "【{企業名}】二次面接のご案内",
  "body": "更新された本文..."
}
```

**レスポンス（200）:**
```json
{
  "updated": true
}
```

---

### CLI-016: テンプレートプレビュー
```
POST /api/client/templates/[id]/preview
```
変数を実データで展開したプレビューを返す。

**リクエスト:**
```json
{
  "applicant_id": "uuid"
}
```

**レスポンス（200）:**
```json
{
  "subject": "【株式会社A】二次面接のご案内",
  "body": "山田太郎 様 この度は株式会社Aの...",
  "to_email": "taro@example.com",
  "to_name": "山田太郎"
}
```

---

### CLI-017: テンプレートメール送信
```
POST /api/client/templates/[id]/send
```
Resend経由でメールを送信する。

**リクエスト:**
```json
{
  "applicant_id": "uuid"
}
```

**レスポンス（200）:**
```json
{
  "sent": true,
  "sent_email_id": "uuid"
}
```

`sent_emails` テーブルに送信履歴を記録。

---

### CLI-018: 送信履歴取得
```
GET /api/client/applicants/[id]/sent-emails
```

**レスポンス（200）:**
```json
{
  "sent_emails": [
    {
      "id": "uuid",
      "template_type": "second_interview",
      "to_email": "taro@example.com",
      "status": "sent",
      "sent_at": "2025-01-15T12:00:00Z"
    }
  ]
}
```

---

### CLI-019: 料金・利用状況取得
```
GET /api/client/plan
```
※ 企業側には契約種別(plan/custom)は返さず、契約形態は常に「従量課金」表記。

**レスポンス（200）:**
```json
{
  "contract_type_label": "従量課金",
  "price_per_interview": 4000,
  "monthly_interview_limit": 20,
  "monthly_count": 8,
  "remaining": 12,
  "current_charge": 32000,
  "max_charge": 80000,
  "next_month_interview_limit": null,
  "next_month_limit_effective_month": null,
  "next_month_max_charge": 80000,
  "next_reset_date": "2026-07-01",
  "min_interview_limit": 5
}
```
- `current_charge` = monthly_count × price_per_interview / `max_charge` = monthly_interview_limit × price_per_interview
- アクセス時に翌月上限予約の月初昇格を実行（適用月到来時に monthly_interview_limit へ反映）

---

### CLI-020: 翌月上限予約（変更）
```
PATCH /api/client/plan
```
企業側が変更できるのは**翌月上限予約のみ**（今月上限・単価・契約種別は変更不可）。

**リクエスト:**
```json
{
  "next_month_interview_limit": 10,
  "settingPassword": "管理者設定用パスワード"
}
```
- `next_month_interview_limit`: 整数・最低5人（使用済み人数より低くても可）
- `settingPassword`: 管理者設定用パスワード（`companies.company_setting_password_hash` と照合。未設定時はエラー）
- 適用は**必ず翌月1日**（`next_month_limit_effective_month` はサーバ側で翌月1日に固定）。即時反映しない
- `demo: true` の場合は DB 更新せず確認用レスポンスを返す

**レスポンス（200）:**
```json
{
  "updated": true,
  "next_month_interview_limit": 10,
  "next_month_limit_effective_month": "2026-07-01"
}
```

> 旧 CLI-020「プラン変更（A/B/C）」・CLI-021「自動繰上げ切替」は廃止。

---

### CLI-022: 請求履歴取得
```
GET /api/client/billing?page=1&per_page=12
```

> **取得元は `billing_records`**（確定請求の正テーブル。`invoices` テーブルは実DBに存在しない）。レスポンスは互換のため次のマッピングで返す: `amount=amount_jpy(税抜)` / `tax_amount=tax_jpy` / `period=billing_month(date)→YYYY-MM` / `status=payment_status` / `stripe_invoice_url=invoice_pdf_url` / `plan=plan_at_billing`。**writer（BATCH-001 / Stripe月末締め）が未実装のため、確定請求履歴は現状空になり得る**。

**レスポンス（200）:**
```json
{
  "invoices": [
    {
      "id": "uuid",
      "period": "2025-01",
      "plan": "pay_per_use",
      "interview_count": 15,
      "amount": 60000,
      "tax_amount": 6000,
      "status": "paid",
      "stripe_invoice_url": "https://invoice.stripe.com/...",
      "created_at": "2025-02-01T00:00:00Z"
    }
  ],
  "total_count": 8
}
```

---

### CLI-023: 一時停止申請（通常停止）
```
POST /api/client/suspension/request
```

**リクエスト:**
```json
{
  "type": "normal"
}
```
> 公開入力の `type:"normal"` は互換のため維持。**DB（suspension_requests）には `request_type='temporary'` として保存**する（DB値として `normal` は使わない）。`status='pending'` で作成。

**レスポンス（200）:**
```json
{
  "requested": true,
  "requested_at": "2025-01-15T10:00:00Z",
  "scheduled_stop_at": "2025-02-15T10:00:00Z"
}
```
> `requested_at` は `created_at`、`scheduled_stop_at` は **DBカラムではなく `created_at + 1ヶ月` で導出したレスポンス値**（`scheduled_stop_at` 列は現DBに存在しない）。

---

### CLI-024: 停止申請取消/緊急停止申請
```
POST /api/client/suspension/cancel
```
通常停止申請（`request_type='temporary'` かつ `status='pending'`）を取り消す。**`status='cancelled'` に更新**する（`cancelled_at` 列は現DBに存在しないため使わない）。

**レスポンス（200）:**
```json
{
  "cancelled": true
}
```

```
POST /api/client/suspension/emergency
```
緊急停止を申請する。**`request_type='emergency'`, `status='pending'` で作成**（必須の `reason` を保存）。運営の承認後に即時停止。

**レスポンス（200）:**
```json
{
  "requested": true,
  "awaiting_approval": true
}
```

> **suspension_requests スキーマ（実DB）**: `id, company_id, request_type, status, reason, created_at` の6列のみ。
> - CHECK: `request_type ∈ {temporary, emergency}` / `status ∈ {pending, approved, rejected, cancelled}`
> - **停止状態の正は `companies.is_suspended`**（`companies.status` は admin表示の補助的な二次判定であり、停止判定の正ではない）。
> - 現DBに存在しない列: `scheduled_stop_at / requested_by / cancelled_at / executed_at`。使わない値: `request_type='normal'` / `status='pending_approval'` / `status='executed'`。

---

## 3. 運営API（19本）

パスプレフィックス: `/api/admin`

認証: すべてSupabase Auth Bearer Token必須 + 2FA検証済み。admin_usersテーブルで権限確認。

### ADM-001: ダッシュボード集計
```
GET /api/admin/dashboard
```

**レスポンス（200）:**
```json
{
  "today_interviews": 12,
  "monthly_interviews": 148,
  "active_companies": 15,
  "estimated_revenue": 1560000,
  "unresolved_alerts": 3,
  "failed_reports": 2,
  "failed_recordings": 1
}
```

---

### ADM-002: 企業一覧取得
```
GET /api/admin/companies?page=1&per_page=20&status=all
```

**レスポンス（200）:**
```json
{
  "companies": [
    {
      "id": "uuid",
      "name": "株式会社A",
      "plan": "pay_per_use",
      "price_per_interview": 4000,
      "status": "active",
      "monthly_count": 12,
      "monthly_interview_limit": 20,
      "created_at": "2024-06-01T00:00:00Z"
    }
  ],
  "total_count": 15
}
```

---

### ADM-003: 企業詳細取得
```
GET /api/admin/companies/[id]
```

**レスポンス（200）:**
```json
{
  "company": {
    "id": "uuid",
    "name": "株式会社A",
    "email": "admin@companya.com",
    "plan": "pay_per_use",
    "price_per_interview": 4000,
    "monthly_interview_limit": 20,
    "next_month_interview_limit": null,
    "next_month_limit_effective_month": null,
    "status": "active",
    "interview_slug": "abc123",
    "onboarding_completed": true,
    "created_at": "2024-06-01T00:00:00Z"
  },
  "job_types": [
    { "id": "uuid", "name": "営業職" },
    { "id": "uuid", "name": "事務職" }
  ],
  "question_banks": [
    { "id": "uuid", "name": "全職種共通", "question_count": 10 }
  ]
}
```

---

### ADM-004: 企業作成
```
POST /api/admin/companies
```

**リクエスト:**
```json
{
  "name": "株式会社D",
  "email": "admin@companyd.com",
  "password": "xxx",
  "contact_person": "担当者名",
  "phone": "03-xxxx-xxxx",
  "industry": "IT・通信",
  "monthly_interview_limit": 20
}
```
※ 新規企業は必ず `plan = pay_per_use` / `price_per_interview = 4000`（DBデフォルト）で作成。custom や特別単価は新規作成では指定しない（運営側の企業設定で後から変更）。

**レスポンス（201）:**
```json
{
  "company_id": "uuid",
  "auth_user_id": "uuid",
  "interview_slug": "xyz789"
}
```

Supabase Authユーザー作成 + companiesレコード作成 + profiles紐づけ + ランダムスラッグ生成。

---

### ADM-005: 企業 重要設定更新（契約・上限）
```
PATCH /api/admin/companies/[id]
```
契約種別・単価・今月/翌月上限・ステータス等の重要設定を更新する。重要フィールド変更時は**運営管理設定変更用パスワード（adminSettingPassword）**を必須とし、`admin_security_settings.setting_password_hash` と照合する（ログインPWは流用しない）。

**リクエスト:**
```json
{
  "plan": "custom",
  "price_per_interview": 3000,
  "monthly_interview_limit": 20,
  "next_month_interview_limit": 10,
  "next_month_limit_effective_month": "2026-07-01",
  "status": "active",
  "adminSettingPassword": "運営管理設定変更用パスワード"
}
```
- `plan` は `pay_per_use` / `custom` のみ（light/standard/pro は不可）
- `price_per_interview` は0以上の整数 / `monthly_interview_limit`・`next_month_interview_limit` は最低5
- `next_month_limit_effective_month` はサーバ側で**翌月1日**に固定（任意日指定不可）

**レスポンス（200）:**
```json
{
  "company": { "...": "更新後の企業オブジェクト" }
}
```

---

### ADM-006: 面接URL再発行
```
POST /api/admin/companies/[id]/regenerate-slug
```

**レスポンス（200）:**
```json
{
  "old_slug": "abc123",
  "new_slug": "def456"
}
```

旧スラッグは無効化される。

---

### ADM-007: 職種CRUD
```
GET    /api/admin/companies/[id]/job-types
POST   /api/admin/companies/[id]/job-types
PATCH  /api/admin/companies/[id]/job-types/[job_type_id]
DELETE /api/admin/companies/[id]/job-types/[job_type_id]
```

**POST リクエスト:**
```json
{
  "name": "エンジニア"
}
```

**POST レスポンス（201）:**
```json
{
  "id": "uuid",
  "name": "エンジニア"
}
```

---

### ADM-008: 質問バンク取得
```
GET /api/admin/companies/[id]/questions
```

**レスポンス（200）:**
```json
{
  "questions": [
    {
      "id": "uuid",
      "sort_order": 1,
      "text": "自己紹介をお願いします",
      "primary_axis": "communication",
      "secondary_axis": null,
      "weight": 1.5,
      "allow_followup": true,
      "job_type_id": null
    }
  ]
}
```

`job_type_id: null` は全職種共通。

> **EBCA 移行に伴う注記:** `primary_axis` / `secondary_axis` / `weight` は旧「質問ごと採点（加重平均）」方式の名残であり、Evidence-based Competency Analysis では**評価に必須ではない**（任意の軸ヒントとして保持可。値が無くても面接全体横断評価で6軸を算出する）。質問の自由作成（カスタム質問）を妨げない。

---

### ADM-009: 質問CRUD
```
POST   /api/admin/companies/[id]/questions
PATCH  /api/admin/companies/[id]/questions/[question_id]
DELETE /api/admin/companies/[id]/questions/[question_id]
PUT    /api/admin/companies/[id]/questions/reorder
```

**POST リクエスト:**
```json
{
  "text": "困難を乗り越えた経験を教えてください",
  "primary_axis": "initiative",
  "secondary_axis": "stress_tolerance",
  "weight": 1.5,
  "allow_followup": true,
  "sort_order": 3,
  "job_type_id": null
}
```

**PUT reorder リクエスト:**
```json
{
  "question_ids": ["uuid1", "uuid2", "uuid3"]
}
```

---

### ADM-010: 応募者テキストデータ検索
```
GET /api/admin/applicant-data?page=1&per_page=20&company_id=&search=&date_from=&date_to=
```

**レスポンス（200）:**
```json
{
  "applicants": [
    {
      "id": "uuid",
      "company_name": "株式会社A",
      "last_name": "山田",
      "first_name": "太郎",
      "rank": "B",
      "created_at": "2025-01-15T10:00:00Z"
    }
  ],
  "total_count": 500
}
```

読取専用。全企業横断検索。

---

### ADM-011: 応募者データエクスポート
```
GET /api/admin/applicant-data/export?company_id=&date_from=&date_to=
```

**レスポンスヘッダー:**
```
Content-Type: text/csv; charset=utf-8
Content-Disposition: attachment; filename="admin_applicants_20250115.csv"
```

---

### ADM-012: 請求管理
```
GET /api/admin/billing?company_id=&period=2025-01
```

> **取得元は `billing_records`**（確定請求の正テーブル。`invoices` テーブルは実DBに存在しない）。マッピングは CLI-022 と同様（`amount=amount_jpy` / `status=payment_status` / `period=billing_month→YYYY-MM` 等）。**writer 未実装のため確定請求は現状空**。
> ※ 運営の課金管理画面（`/admin/billing`）は `GET /api/admin/billing/summary` を使用し、**当月見込み**（companies × interviews(billable) × price_per_interview, Stripe非依存）はリアルタイムに動作する。未入金・年間累計・月次グラフは billing_records 由来のため writer 実装まで 0/空。
> `payment_status` の値集合は未確認（billing_records 0件・CHECK確認不能）。`summary` の status 正規化（paid/overdue/その他→billed）は暫定で、writer 実装時に要再確認。

**レスポンス（200）:**
```json
{
  "invoices": [
    {
      "company_id": "uuid",
      "company_name": "株式会社A",
      "plan": "pay_per_use",
      "interview_count": 15,
      "amount": 60000,
      "status": "paid",
      "stripe_invoice_url": "https://..."
    }
  ],
  "total_revenue": 1560000
}
```

---

### ADM-013: 停止申請一覧
```
GET /api/admin/suspensions
```

**レスポンス（200）:**
```json
{
  "suspensions": [
    {
      "id": "uuid",
      "company_name": "株式会社C",
      "type": "emergency",
      "status": "pending",
      "requested_at": "2025-01-20T10:00:00Z",
      "scheduled_stop_at": null,
      "created_at": "2025-01-20T10:00:00Z"
    }
  ]
}
```
> `type` は `request_type`（`temporary` / `emergency`）。`status` は `pending / approved / rejected / cancelled`（`pending_approval` は使わない）。`scheduled_stop_at` は `temporary` のみ `created_at + 1ヶ月` の導出値、`emergency` は `null`。`requested_at` は `created_at`。

---

### ADM-014: 停止申請承認/却下（緊急停止のみ）
```
POST /api/admin/suspensions/[id]/approve
POST /api/admin/suspensions/[id]/reject
```
**対象は `request_type='emergency'` かつ `status='pending'` のみ**（通常停止 `temporary` は対象外。BATCH-002 が自動実行する）。

- **承認（approve）**: `companies.is_suspended=true`（即時停止反映）＋ `suspension_requests.status='approved'`。
- **却下（reject）**: `suspension_requests.status='rejected'`（`companies.is_suspended` は変更しない）。
- 停止状態の正は `companies.is_suspended`（`companies.status` は触らない）。`status='executed'` は使わず、終端は `approved`。
- **監査記録（DB変更なし・既存列を使用）**: 承認/却下とも `reviewed_by`（admin の auth user id = `profiles.id`）と `reviewed_at`（処理日時）を記録。**却下は任意で `review_comment`**（理由）を `body.review_comment` で受け取り記録（空は null）。承認は `review_comment` を設定しない。

**approve レスポンス（200）:**
```json
{
  "approved": true,
  "company_status": "suspended"
}
```

**reject レスポンス（200）:**
```json
{
  "rejected": true
}
```

---

### ADM-015: 企業強制 停止/再開（契約停止・契約再開）
専用エンドポイント `toggle-status` は存在せず、企業詳細 `/admin/companies/[id]` の「契約停止／契約再開」から **`PATCH /api/admin/companies/[id]`** で行う。
```
PATCH /api/admin/companies/[id]
```

**リクエスト（契約停止）:**
```json
{
  "is_suspended": true,
  "status": "suspended"
}
```

**リクエスト（契約再開 / resume）:**
```json
{
  "is_suspended": false,
  "status": "active"
}
```

> 停止状態の正は `is_suspended`。再開は `is_suspended=false`＋（admin一覧/詳細が `status==='suspended'` を二次判定に使うため表示整合用に）`status='active'` を更新する。`is_active` / `interview_url_active` / `suspension_requests`（履歴）は触らない。緊急承認・BATCH-002 で停止（`is_suspended=true`）した企業も同じ契約再開で復帰できる。

---

### ADM-016: セキュリティアラート一覧
```
GET /api/admin/security/alerts?page=1&per_page=20
```

**レスポンス（200）:**
```json
{
  "alerts": [
    {
      "id": "uuid",
      "type": "sms_flood",
      "ip_address": "192.168.1.1",
      "details": "1分間に20回のSMS送信リクエスト",
      "resolved": false,
      "created_at": "2025-01-20T14:30:00Z"
    }
  ],
  "total_count": 3
}
```

`type`: `sms_flood` / `login_bruteforce` / `suspicious_access`

---

### ADM-017: IPブロック操作
```
POST   /api/admin/security/ip-block
DELETE /api/admin/security/ip-block/[id]
GET    /api/admin/security/ip-blocks
```

**POST リクエスト:**
```json
{
  "ip_address": "192.168.1.1",
  "reason": "SMS大量送信"
}
```

**GET レスポンス（200）:**
```json
{
  "blocked_ips": [
    {
      "id": "uuid",
      "ip_address": "192.168.1.1",
      "reason": "SMS大量送信",
      "blocked_at": "2025-01-20T14:35:00Z"
    }
  ]
}
```

---

### ADM-018: ロック解除
```
GET  /api/admin/security/locked-accounts
POST /api/admin/security/unlock/[id]
```

**GET レスポンス（200）:**
```json
{
  "locked_accounts": [
    {
      "id": "uuid",
      "lock_type": "otp_lock",
      "identifier": "+819012345678",
      "locked_at": "2025-01-20T10:00:00Z"
    },
    {
      "id": "uuid",
      "lock_type": "prank_lock",
      "identifier": "+819098765432",
      "locked_at": "2025-01-18T15:00:00Z"
    },
    {
      "id": "uuid",
      "lock_type": "client_lock",
      "identifier": "admin@companya.com",
      "locked_at": "2025-01-19T08:00:00Z"
    }
  ]
}
```

`lock_type`: `otp_lock` / `prank_lock` / `client_lock`

---

### ADM-019: 満足度データ取得
```
GET /api/admin/satisfaction?company_id=&period=2025-01
```

> **集計元は `applicants.satisfaction_rating`**（満足度の実データ保存先）。`satisfaction_ratings` テーブルは書き込み元が無い死蔵テーブルのため使わない。運営は全企業横断で集計するため **service role**（RLS非依存）で取得する。レスポンス形は下記のとおり既存互換。

**レスポンス（200）:**
```json
{
  "overall_average": 4.2,
  "total_responses": 230,
  "by_company": [
    {
      "company_id": "uuid",
      "company_name": "株式会社A",
      "average": 4.3,
      "count": 45,
      "distribution": { "1": 1, "2": 2, "3": 5, "4": 17, "5": 20 }
    }
  ],
  "by_month": [
    { "month": "2025-01", "average": 4.2, "count": 68 },
    { "month": "2024-12", "average": 4.1, "count": 72 }
  ]
}
```

---

## 4. Webhook（4本）

パスプレフィックス: `/api/webhooks`

### WH-001: Stripe Webhook
```
POST /api/webhooks/stripe
```
Stripe決済イベントを受信する。

**Stripe署名検証:** `stripe-signature` ヘッダーでHMAC検証。

**処理対象イベント:**
| イベント | 処理 |
|---------|------|
| `invoice.payment_succeeded` | 請求ステータスを「支払済」に更新 |
| `invoice.payment_failed` | 企業・運営に支払い失敗通知 |
| `customer.subscription.updated` | 契約情報の変更を反映 |
| `customer.subscription.deleted` | サブスクリプション解約処理 |

**レスポンス:** `200` （Stripeへの応答）

---

### WH-002: Twilio Status Callback
```
POST /api/webhooks/twilio/status
```
Twilio SMSの配信ステータスを受信する。

**処理対象ステータス:**
| ステータス | 処理 |
|-----------|------|
| `delivered` | 配信成功記録 |
| `failed` | 配信失敗記録、リトライ判定 |
| `undelivered` | 配信不能記録 |

---

### WH-003: Resend Webhook
```
POST /api/webhooks/resend
```
Resendメール送信の配信ステータスを受信する。

**処理対象イベント:**
| イベント | 処理 |
|---------|------|
| `email.delivered` | sent_emailsステータスを`sent`に更新 |
| `email.bounced` | sent_emailsステータスを`bounced`に更新 |
| `email.complained` | sent_emailsステータスを`complained`に更新 |

---

### WH-004: Sentry Webhook
```
POST /api/webhooks/sentry
```
Sentryのエラーアラートを受信し、運営にメール通知する。

**処理:** 重大エラー（level: error以上）を検知した場合、運営へシステムエラー通知メールを送信。

---

## 5. 内部バッチAPI（4本）

パスプレフィックス: `/api/internal/batch`

認証: 内部シークレットキー（`x-batch-secret` ヘッダー）。Vercel Cron Jobsから呼び出し。

### BATCH-001: 月次課金集計
```
POST /api/internal/batch/monthly-billing
```
全企業の月次面接件数を集計し、Stripeで請求書を発行する。

> **未実装（🔲）**。`/api/internal/batch/monthly-billing` ルートは存在しない＝**`billing_records` の writer が無い**。そのため確定請求（CLI-022 / ADM-012）は現状空。Stripe 連携（P-10）とセットで将来実装。

**実行タイミング:** 毎月1日 00:00 JST

**処理:**
1. 全企業の前月面接件数を集計（10分超のみカウント）
2. プラン料金を算出
3. Stripe Invoice作成・自動発行
4. **`billing_records` に記録**（旧記述の `invoices` テーブルは実DBに存在しない）

**レスポンス（200）:**
```json
{
  "processed_companies": 15,
  "total_invoices": 15,
  "total_amount": 1560000
}
```

---

### BATCH-002: 一時停止自動実行
```
POST /api/internal/batch/suspension-execute
```
通常停止（temporary）申請日から1ヶ月経過したものを自動実行する。`scheduled_stop_at` 列は存在しないため、`created_at` を基準に判定する。

**実行タイミング:** 毎日 01:00 JST

**処理:**
1. `request_type='temporary'` かつ `status='pending'` かつ `created_at <= (now - 1ヶ月)` の停止申請を検索
2. 該当企業を `companies.is_suspended=true` に更新（停止状態の正は `is_suspended`。`companies.status` は変更しない）
3. 該当申請を `suspension_requests.status='approved'` に更新（再実行対象から外す。`status='executed'` は使わない）

> ※ 面接URLの無効化（`interview_url_active`）は**未実装**。面接受付の停止は `is_suspended` ゲート（verify-url 等）で成立する。

**レスポンス（200）:**
```json
{
  "suspended_companies": ["uuid1", "uuid2"]
}
```

---

### BATCH-003: 翌月上限予約の月初昇格（アクセス時・cron不要）
自動繰上げは廃止。代わりに「翌月上限予約の月初昇格」を**遅延適用**で行う（専用バッチ/cronは不要）。

**実行タイミング:** 企業データ取得API（`GET /api/client/plan`・`GET /api/client/company`・`GET /api/admin/companies/[id]`・`POST /api/interview/verify-url`）のアクセス時に共通ヘルパー `applyNextMonthLimit` を実行。

**処理（条件を満たす場合のみ）:**
1. `next_month_interview_limit`（5以上）と `next_month_limit_effective_month` が設定済み、かつ 今日(JST) ≥ effective_month
2. `monthly_interview_limit = next_month_interview_limit` に反映
3. `next_month_interview_limit` / `next_month_limit_effective_month` を null にクリア
4. 二重反映防止: `WHERE next_month_limit_effective_month IS NOT NULL` ガード（service role で更新）
5. `price_per_interview` / `plan` / `company_setting_password_hash` は変更しない

---

### BATCH-004: レポート生成リトライ
```
POST /api/internal/batch/report-retry
```
失敗したレポート生成を再試行する。

**実行タイミング:** 毎時00分

**処理:**
1. `report_status = 'failed'` かつ `retry_count < 3` のレポートを検索
2. レポート生成を再実行
3. 3回失敗で運営にメール通知

**レスポンス（200）:**
```json
{
  "retried": 2,
  "succeeded": 1,
  "permanently_failed": 1
}
```

---

## 6. ヘルスチェック

### HEALTH-001: ヘルスチェック
```
GET /api/health
```
**実装済み。** サーバーの稼働状況を返す。

**レスポンス（200）:**
```json
{
  "status": "ok",
  "timestamp": "2025-01-15T10:00:00Z"
}
```

---

## 7. APIファイル・パス対応表

### 応募者API（15本）

| ID | メソッド | パス | ファイル | 実装状況 |
|----|---------|------|---------|---------|
| INT-001 | GET | `/api/interview/[slug]` | `app/api/interview/[slug]/route.ts` | 🔲 |
| INT-002 | POST | `/api/interview/sms/send` | `app/api/interview/sms/send/route.ts` | 🔲 |
| INT-003 | POST | `/api/interview/sms/verify` | `app/api/interview/sms/verify/route.ts` | 🔲 |
| INT-004 | GET | `/api/interview/check-reexam` | `app/api/interview/check-reexam/route.ts` | 🔲 |
| INT-005 | GET | `/api/interview/job-types` | `app/api/interview/job-types/route.ts` | 🔲 |
| INT-006 | POST | `/api/interview/applicant` | `app/api/interview/applicant/route.ts` | 🔲 |
| INT-007 | POST | `/api/interview/session/start` | `app/api/interview/session/start/route.ts` | 🔲 |
| INT-008 | POST | `/api/interview/session/log` | `app/api/interview/session/log/route.ts` | 🔲 |
| INT-009 | POST | `/api/interview/session/end` | `app/api/interview/session/end/route.ts` | 🔲 |
| INT-010 | POST | `/api/interview/recording/initiate` | `app/api/interview/recording/initiate/route.ts` | 🔲 |
| INT-011 | POST | `/api/interview/recording/part-url` | `app/api/interview/recording/part-url/route.ts` | 🔲 |
| INT-012 | POST | `/api/interview/recording/complete` | `app/api/interview/recording/complete/route.ts` | 🔲 |
| INT-013 | GET | `/api/interview/feedback` | `app/api/interview/feedback/route.ts` | 🔲 |
| INT-014 | POST | `/api/interview/satisfaction`（未実装。現状は complete画面が `applicants.satisfaction_rating` を直接update） | `app/api/interview/satisfaction/route.ts` | 🔲 |
| INT-015 | POST | `/api/interview/prank-count` | `app/api/interview/prank-count/route.ts` | 🔲 |

### 企業API（24本）

| ID | メソッド | パス | ファイル | 実装状況 |
|----|---------|------|---------|---------|
| CLI-001 | GET | `/api/client/company` | `app/api/client/company/route.ts` | 🔲 |
| CLI-002 | POST | `/api/client/onboarding/complete` | `app/api/client/onboarding/complete/route.ts` | 🔲 |
| CLI-003 | GET | `/api/client/applicants` | `app/api/client/applicants/route.ts` | 🔲 |
| CLI-004 | GET | `/api/client/applicants/[id]` | `app/api/client/applicants/[id]/route.ts` | 🔲 |
| CLI-005 | PATCH | `/api/client/applicants/[id]/status` | `app/api/client/applicants/[id]/status/route.ts` | 🔲 |
| CLI-006 | GET | `/api/client/applicants/[id]/report` | `app/api/client/applicants/[id]/report/route.ts` | 🔲 |
| CLI-007 | GET | `/api/client/applicants/[id]/logs` | `app/api/client/applicants/[id]/logs/route.ts` | 🔲 |
| CLI-008 | GET | `/api/client/applicants/[id]/recording-url` | `app/api/client/applicants/[id]/recording-url/route.ts` | 🔲 |
| CLI-009 | GET | `/api/client/applicants/[id]/memos` | `app/api/client/applicants/[id]/memos/route.ts` | 🔲 |
| CLI-010 | POST | `/api/client/applicants/[id]/memos` | `app/api/client/applicants/[id]/memos/route.ts` | 🔲 |
| CLI-011 | PATCH | `/api/client/applicants/[id]/memos/[memo_id]` | `app/api/client/applicants/[id]/memos/[memo_id]/route.ts` | 🔲 |
| CLI-012 | DELETE | `/api/client/applicants/[id]/memos/[memo_id]` | `app/api/client/applicants/[id]/memos/[memo_id]/route.ts` | 🔲 |
| CLI-013 | GET | `/api/client/applicants/export/csv` | `app/api/client/applicants/export/csv/route.ts` | 🔲 |
| CLI-014 | GET | `/api/client/templates` | `app/api/client/templates/route.ts` | 🔲 |
| CLI-015 | PATCH | `/api/client/templates/[id]` | `app/api/client/templates/[id]/route.ts` | 🔲 |
| CLI-016 | POST | `/api/client/templates/[id]/preview` | `app/api/client/templates/[id]/preview/route.ts` | 🔲 |
| CLI-017 | POST | `/api/client/templates/[id]/send` | `app/api/client/templates/[id]/send/route.ts` | 🔲 |
| CLI-018 | GET | `/api/client/applicants/[id]/sent-emails` | `app/api/client/applicants/[id]/sent-emails/route.ts` | 🔲 |
| CLI-019 | GET | `/api/client/plan` | `app/api/client/plan/route.ts` | 🔲 |
| CLI-020 | POST | `/api/client/plan/change` | `app/api/client/plan/change/route.ts` | 🔲 |
| CLI-021 | POST | `/api/client/plan/auto-upgrade` | `app/api/client/plan/auto-upgrade/route.ts` | 🔲 |
| CLI-022 | GET | `/api/client/billing`（billing_records 読み。writer未実装のため確定請求は空） | `app/api/client/billing/route.ts` | ✅ |
| CLI-023 | POST | `/api/client/suspension/request` | `app/api/client/suspension/request/route.ts` | ✅ |
| CLI-024 | POST | `/api/client/suspension/cancel` `POST /api/client/suspension/emergency` | `app/api/client/suspension/*/route.ts` | ✅ |
| CLI-025 | GET | `/api/client/suspension`（現在の停止状態・最新pending申請の取得） | `app/api/client/suspension/route.ts` | ✅ |

### 運営API（19本）

| ID | メソッド | パス | ファイル | 実装状況 |
|----|---------|------|---------|---------|
| ADM-001 | GET | `/api/admin/dashboard` | `app/api/admin/dashboard/route.ts` | 🔲 |
| ADM-002 | GET | `/api/admin/companies` | `app/api/admin/companies/route.ts` | 🔲 |
| ADM-003 | GET | `/api/admin/companies/[id]` | `app/api/admin/companies/[id]/route.ts` | 🔲 |
| ADM-004 | POST | `/api/admin/companies` | `app/api/admin/companies/route.ts` | 🔲 |
| ADM-005 | PATCH | `/api/admin/companies/[id]/settings` | `app/api/admin/companies/[id]/settings/route.ts` | 🔲 |
| ADM-006 | POST | `/api/admin/companies/[id]/regenerate-slug` | `app/api/admin/companies/[id]/regenerate-slug/route.ts` | 🔲 |
| ADM-007 | CRUD | `/api/admin/companies/[id]/job-types` | `app/api/admin/companies/[id]/job-types/route.ts` | 🔲 |
| ADM-008 | GET | `/api/admin/companies/[id]/questions` | `app/api/admin/companies/[id]/questions/route.ts` | 🔲 |
| ADM-009 | CRUD | `/api/admin/companies/[id]/questions` | `app/api/admin/companies/[id]/questions/*/route.ts` | 🔲 |
| ADM-010 | GET | `/api/admin/applicant-data` | `app/api/admin/applicant-data/route.ts` | 🔲 |
| ADM-011 | GET | `/api/admin/applicant-data/export` | `app/api/admin/applicant-data/export/route.ts` | 🔲 |
| ADM-012 | GET | `/api/admin/billing`（billing_records 読み。writer未実装のため確定請求は空。当月見込みは `/api/admin/billing/summary`） | `app/api/admin/billing/route.ts` | ✅ |
| ADM-013 | GET | `/api/admin/suspensions` | `app/api/admin/suspensions/route.ts` | ✅ |
| ADM-014 | POST | `/api/admin/suspensions/[id]/approve` `reject`（緊急停止のみ） | `app/api/admin/suspensions/[id]/*/route.ts` | ✅ |
| ADM-015 | PATCH | `/api/admin/companies/[id]`（契約停止/再開で `is_suspended`+`status` を更新。`toggle-status` 専用EPは不採用） | `app/api/admin/companies/[id]/route.ts` | ✅ |
| ADM-016 | GET | `/api/admin/security/alerts` | `app/api/admin/security/alerts/route.ts` | 🔲 |
| ADM-017 | CRUD | `/api/admin/security/ip-block` | `app/api/admin/security/ip-block/route.ts` | 🔲 |
| ADM-018 | GET/POST | `/api/admin/security/locked-accounts` `unlock/[id]` | `app/api/admin/security/*/route.ts` | 🔲 |
| ADM-019 | GET | `/api/admin/satisfaction`（集計元 `applicants.satisfaction_rating`・service role） | `app/api/admin/satisfaction/route.ts` | ✅ |

### Webhook（4本）

| ID | メソッド | パス | ファイル | 実装状況 |
|----|---------|------|---------|---------|
| WH-001 | POST | `/api/webhooks/stripe` | `app/api/webhooks/stripe/route.ts` | 🔲 |
| WH-002 | POST | `/api/webhooks/twilio/status` | `app/api/webhooks/twilio/status/route.ts` | 🔲 |
| WH-003 | POST | `/api/webhooks/resend` | `app/api/webhooks/resend/route.ts` | 🔲 |
| WH-004 | POST | `/api/webhooks/sentry` | `app/api/webhooks/sentry/route.ts` | 🔲 |

### 内部バッチ（4本）

| ID | メソッド | パス | ファイル | 実行タイミング | 実装状況 |
|----|---------|------|---------|--------------|---------|
| BATCH-001 | POST | `/api/internal/batch/monthly-billing`（未実装。記録先は `billing_records`。billing_records writer はこれ） | `app/api/internal/batch/monthly-billing/route.ts` | 毎月1日 00:00 | 🔲 |
| BATCH-002 | POST | `/api/internal/batch/suspension-execute` | `app/api/internal/batch/suspension-execute/route.ts` | 毎日 01:00 | ✅ |
| BATCH-003 | POST | `/api/internal/batch/auto-upgrade-check` | `app/api/internal/batch/auto-upgrade-check/route.ts` | 面接完了時 | 🔲 |
| BATCH-004 | POST | `/api/internal/batch/report-retry` | `app/api/internal/batch/report-retry/route.ts` | 毎時00分 | 🔲 |

### ヘルスチェック（1本）

| ID | メソッド | パス | ファイル | 実装状況 |
|----|---------|------|---------|---------|
| HEALTH-001 | GET | `/api/health` | `app/api/health/route.ts` | ✅ 実装済み |

---

## 8. 認証・認可まとめ

| カテゴリ | 認証方式 | RLS | 備考 |
|---------|---------|-----|------|
| 応募者API | セッショントークン（SMS認証後発行） | N/A | company_id スコープ |
| 企業API | Supabase Auth Bearer Token | 適用 | auth_user_id → company_id |
| 運営API | Supabase Auth Bearer Token + 2FA | N/A | admin_usersテーブルで権限確認 |
| Webhook | サービス固有署名検証 | N/A | Stripe/Twilio/Resend/Sentry |
| バッチAPI | 内部シークレットキー | N/A | Vercel Cron Jobs |

---

## 9. レート制限まとめ

| 対象 | 制限 | 備考 |
|------|------|------|
| SMS送信（同一番号） | 1日5回 | Twilio Verify |
| SMS送信（同一IP） | 1時間3回 | サーバー側チェック |
| SMS送信（同一IP異番号） | 1日10回 | サーバー側チェック |
| SMS再送間隔 | 60秒 | |
| OTP入力試行 | 5回で永久ロック | |
| 企業ログイン | 5回で15分ロック、10回で永久ロック | |
| 冷やかし | 3回で永久ロック | 10分未満離脱 |
| 一般API | 100リクエスト/分/IP | 将来実装 |

---

## 10. 社風アンケート公開API（survey）— 不採用・削除済み

> **不採用・削除済み（Phase C）**。社風分析 / 社員アンケート / culture fit は質問設計と評価軸の整合が取りにくく根拠が弱いため**不採用**。`/api/survey/[slug]/public-config`・`/api/survey/[slug]/response`（旧 SUR-001 / SUR-002）と `app/survey/*`・`/client/culture-analysis` は**削除済み**。評価の中心は **EBCA**（質問非依存）。
> DB の `culture_surveys` / `culture_survey_responses` / `culture_profiles`（テーブル）・`companies.culture_analysis_enabled`・`interview_results.culture_fit_score` / `culture_fit_detail` / `big_five_scores`（列）はコード参照ゼロの死蔵で、別タスク（C-4）で DROP 予定。

---

## 公開フローの状態（まとめ）
- **`/interview/[slug]` 配下**: browser Supabase 直アクセス（読み書きとも）撤去済み。書き込み＝`applicant`/`start`/`end`/`satisfaction`/`snapshot`、読み取り＝`public-config`/`questions`。すべて **service-role API＋capability token**。
- **`/survey/[slug]` 配下**: 社風アンケートは不採用・**画面/APIとも削除済み**（残る公開フローは `/interview/[slug]` のみ）。
- 公開フローは Service Role Key で RLS をバイパスして書き込み、各APIで slug/整合を再検証する。
