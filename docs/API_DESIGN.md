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

### INT-006: 応募者情報保存
```
POST /api/interview/applicant
```
フォーム入力情報を保存し、応募者レコードを作成する。

**認証:** セッショントークン

**リクエスト:**
```json
{
  "company_id": "uuid",
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
  "job_type_id": "uuid",
  "work_history": "...",
  "qualifications": "..."
}
```

**バリデーション:**
| フィールド | ルール |
|-----------|--------|
| last_name, first_name | 必須、1〜50文字 |
| last_name_kana, first_name_kana | 必須、カタカナのみ |
| birth_date | 必須、過去の日付 |
| gender | 必須、`male` / `female` / `other` / `no_answer` |
| phone_number | 必須、SMS認証済み番号と一致 |
| email | 必須、メール形式 |
| prefecture | 必須、47都道府県のいずれか |
| education | 必須、定義済み選択肢 |
| employment_type | 必須、`new_graduate` / `mid_career` |
| industry_experience | 必須、`experienced` / `inexperienced` |
| job_type_id | 必須、企業に属するjob_type |
| work_history | 任意、最大500文字 |
| qualifications | 任意、最大300文字 |

**レスポンス（201）:**
```json
{
  "applicant_id": "uuid",
  "duplicate_flag": false
}
```

**重複検知:** 氏名＋生年月日一致 → `duplicate_flag: true`、企業・運営に通知

---

### INT-007: 面接セッション開始
```
POST /api/interview/session/start
```
面接セッションを開始し、OpenAI Realtime APIの接続情報を返す。

**認証:** セッショントークン

**リクエスト:**
```json
{
  "applicant_id": "uuid"
}
```

**レスポンス（200）:**
```json
{
  "interview_id": "uuid",
  "realtime_config": {
    "model": "gpt-4o-mini-realtime-preview",
    "session_id": "xxx",
    "ephemeral_key": "xxx"
  },
  "questions": [
    {
      "id": "uuid",
      "text": "自己紹介をお願いします",
      "axis": "communication",
      "allow_followup": true
    }
  ],
  "started_at": "2025-01-15T10:00:00Z"
}
```

---

### INT-008: 面接ログ送信
```
POST /api/interview/session/log
```
面接中の発話ログをリアルタイムでサーバーに送信する。

**認証:** セッショントークン

**リクエスト:**
```json
{
  "interview_id": "uuid",
  "logs": [
    {
      "speaker": "ai",
      "content": "自己紹介をお願いします",
      "timestamp_ms": 1705312800000
    },
    {
      "speaker": "applicant",
      "content": "はい、私は...",
      "timestamp_ms": 1705312805000
    }
  ]
}
```

**レスポンス（200）:**
```json
{
  "received": true,
  "log_count": 2
}
```

---

### INT-009: 面接セッション終了
```
POST /api/interview/session/end
```
面接セッションを終了し、レポート生成・フィードバック生成を非同期開始する。

**認証:** セッショントークン

**リクエスト:**
```json
{
  "interview_id": "uuid",
  "end_reason": "completed",
  "duration_seconds": 1680,
  "question_count": 8
}
```

`end_reason` の値:
| 値 | 説明 |
|----|------|
| `completed` | 全質問回答完了 |
| `user_ended` | 応募者が終了ボタン押下 |
| `timeout` | 40分タイムアウト |
| `silence` | 無言1分 |
| `inappropriate` | 不適切行為検知 |
| `disconnected` | ネットワーク切断60秒超 |
| `browser_closed` | ブラウザ閉鎖 |

**レスポンス（200）:**
```json
{
  "interview_id": "uuid",
  "billable": true,
  "report_status": "generating",
  "feedback_status": "generating"
}
```

**課金判定:** `duration_seconds > 600`（10分超）かつ `end_reason !== 'inappropriate'` で `billable: true`

**非同期処理トリガー:**
1. 企業向けレポート生成（5分以内目標）
2. 応募者向けフィードバック生成（20秒以内目標）

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

### INT-014: 満足度評価送信
```
POST /api/interview/satisfaction
```
面接体験の満足度評価を送信する。

**認証:** セッショントークン

**リクエスト:**
```json
{
  "interview_id": "uuid",
  "rating": 4
}
```

`rating`: 1〜5（整数）

**レスポンス（200）:**
```json
{
  "saved": true
}
```

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
    { "axis": "logic", "axis_score": 14, "axis_rank": "B" },
    { "axis": "initiative", "axis_score": 15, "axis_rank": "B" },
    { "axis": "motivation", "axis_score": 17, "axis_rank": "A" },
    { "axis": "stress_tolerance", "axis_score": 12, "axis_rank": "C" },
    { "axis": "integrity", "axis_score": 16, "axis_rank": "B" }
  ],
  "question_scores": [
    {
      "question_text_snapshot": "自己紹介をお願いします",
      "axis": "communication",
      "score": 16,
      "rank": "B",
      "evidence_quote": "私は3年間営業として...",
      "evaluation_reason": "具体的なエピソードを交えて...",
      "improvement_point": null
    }
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

`status` が `partial` の場合、未回答質問は `score: null, rank: null` で「未実施」表示。

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

### CLI-023: 一時停止申請
```
POST /api/client/suspension/request
```

**リクエスト:**
```json
{
  "type": "normal"
}
```

**レスポンス（200）:**
```json
{
  "requested": true,
  "requested_at": "2025-01-15T10:00:00Z",
  "scheduled_stop_at": "2025-02-15T10:00:00Z"
}
```

---

### CLI-024: 停止申請取消/緊急停止申請
```
POST /api/client/suspension/cancel
```
一時停止申請を取り消す。

**レスポンス（200）:**
```json
{
  "cancelled": true
}
```

```
POST /api/client/suspension/emergency
```
緊急停止を申請する。運営承認後に即時停止。

**レスポンス（200）:**
```json
{
  "requested": true,
  "awaiting_approval": true
}
```

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
      "status": "pending_approval",
      "requested_at": "2025-01-20T10:00:00Z"
    }
  ]
}
```

---

### ADM-014: 停止申請承認/却下
```
POST /api/admin/suspensions/[id]/approve
POST /api/admin/suspensions/[id]/reject
```

**approve レスポンス（200）:**
```json
{
  "approved": true,
  "company_status": "suspended"
}
```

---

### ADM-015: 企業強制ON/OFF
```
POST /api/admin/companies/[id]/toggle-status
```

**リクエスト:**
```json
{
  "status": "suspended"
}
```

`status`: `active` / `suspended`

**レスポンス（200）:**
```json
{
  "updated": true,
  "new_status": "suspended"
}
```

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

**実行タイミング:** 毎月1日 00:00 JST

**処理:**
1. 全企業の前月面接件数を集計（10分超のみカウント）
2. プラン料金を算出
3. Stripe Invoice作成・自動発行
4. invoicesテーブルに記録

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
申請日から1ヶ月経過した一時停止を自動実行する。

**実行タイミング:** 毎日 01:00 JST

**処理:**
1. `scheduled_stop_at <= now()` の停止申請を検索
2. 該当企業のステータスを `suspended` に変更
3. 面接URLを無効化

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
| INT-014 | POST | `/api/interview/satisfaction` | `app/api/interview/satisfaction/route.ts` | 🔲 |
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
| CLI-022 | GET | `/api/client/billing` | `app/api/client/billing/route.ts` | 🔲 |
| CLI-023 | POST | `/api/client/suspension/request` | `app/api/client/suspension/request/route.ts` | 🔲 |
| CLI-024 | POST | `/api/client/suspension/cancel` `POST /api/client/suspension/emergency` | `app/api/client/suspension/*/route.ts` | 🔲 |

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
| ADM-012 | GET | `/api/admin/billing` | `app/api/admin/billing/route.ts` | 🔲 |
| ADM-013 | GET | `/api/admin/suspensions` | `app/api/admin/suspensions/route.ts` | 🔲 |
| ADM-014 | POST | `/api/admin/suspensions/[id]/approve` `reject` | `app/api/admin/suspensions/[id]/*/route.ts` | 🔲 |
| ADM-015 | POST | `/api/admin/companies/[id]/toggle-status` | `app/api/admin/companies/[id]/toggle-status/route.ts` | 🔲 |
| ADM-016 | GET | `/api/admin/security/alerts` | `app/api/admin/security/alerts/route.ts` | 🔲 |
| ADM-017 | CRUD | `/api/admin/security/ip-block` | `app/api/admin/security/ip-block/route.ts` | 🔲 |
| ADM-018 | GET/POST | `/api/admin/security/locked-accounts` `unlock/[id]` | `app/api/admin/security/*/route.ts` | 🔲 |
| ADM-019 | GET | `/api/admin/satisfaction` | `app/api/admin/satisfaction/route.ts` | 🔲 |

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
| BATCH-001 | POST | `/api/internal/batch/monthly-billing` | `app/api/internal/batch/monthly-billing/route.ts` | 毎月1日 00:00 | 🔲 |
| BATCH-002 | POST | `/api/internal/batch/suspension-execute` | `app/api/internal/batch/suspension-execute/route.ts` | 毎日 01:00 | 🔲 |
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
