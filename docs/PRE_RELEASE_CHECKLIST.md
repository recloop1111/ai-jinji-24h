# 本番前チェックリスト（PRE_RELEASE_CHECKLIST）

RLSハードニング（Phase 1〜2-e）完了時点の本番前確認・棚卸しを集約する。
無料で確認できるものと、外部有料API導入後に確認するものを分離する。

> 関連: 設計の現状は `CLAUDE.md` / `docs/INFRASTRUCTURE.md` / `docs/API_DESIGN.md` / `docs/REQUIREMENTS.md` を正とする。

---

## 1. 無料で確認できる E2E チェックリスト（外部有料API不要）

ローカル `npm run dev` ＋ Supabase（無料枠）で確認できる範囲。SMSは「1234」モック。

### 1-1. 公開面接フロー（/interview/[slug]）
- [ ] `/interview/test` でフォーム（page）が開き、企業名・ロゴが表示される（`public-config` 経由）
- [ ] 職種ドロップダウンに active jobs が出る（`public-config` の jobs）
- [ ] 履歴書フォーム（form）送信で応募者が作成される（`applicant` API・token 発行）
- [ ] verify 画面で **「1234」** で通過、誤コードで入力欄クリア＋先頭フォーカス＋インラインエラー
- [ ] prepare（デバイスチェック）→ practice（練習）→ session（面接）へ遷移できる
- [ ] session で面接開始（`start` API・interviews=in_progress 作成）
- [ ] session で質問が表示される（`questions` API・job_questions）。※現状は**先頭1問のみ表示のモック**（質問ラリーは未実装＝下記 §2）
- [ ] 面接終了（`end` API）で interviews=completed、`applicants.status='完了'`、is_billable=10分超で true
- [ ] 途中離脱（タブ閉じ/明示終了）で interviews=cancelled、`applicants.status='途中離脱'`＋result='不採用'
- [ ] 満足度送信（`satisfaction` API・1〜5）で `applicants.satisfaction_rating` 保存
- [ ] 質問スナップショット（`snapshot` API・in_progress時）で `interviews.questions_snapshot` 保存

### 1-2. 応募者ステータス表示（導出）
- [ ] 最新 `interviews.status` から **準備中/面接中/完了/途中離脱** が導出表示される（`lib/applicants/displayStatus.ts`）
- [ ] client 一覧・詳細・dashboard、admin 一覧・詳細で同一の導出表示
- [ ] DB の `applicants.status` は `準備中`/`完了`/`途中離脱` の3値のみ（「面接中」は保存しない）

### 1-3. client / admin 管理画面
- [ ] client ログイン → 自社の応募者一覧・詳細が表示（RLS company スコープ）
- [ ] admin ログイン → 全社の応募者一覧・詳細が表示（admin_select_*）
- [ ] company アカウントで `/admin/*` に入れない（layout guard ＋ `GET /api/admin/me`）

> ※ 社風アンケート（/survey）/ culture fit は**不採用・削除済み**（Phase C）。E2E 対象外。`/survey/*` と `/client/culture-analysis` は存在しない（404）扱いでよい。

### 1-4. RLS 遮断確認（anon key で REST 直叩き）
- [ ] anon で `interview_results` / `applicants` / `interviews` / `companies` / `common_questions` / `jobs` / `job_questions` が 0件 or 403
- [ ] anon で 死蔵5テーブル（applicant_feedback / cooldown_locks / interview_re_exam_records / otp_locks / satisfaction_ratings）が 0件 or 403（Phase 2-f）
- [ ] （死蔵）`culture_*` 3テーブルも anon で 0件 or 403（C-4 で DROP 予定）
- [ ] service-role では上記が読める（RLS bypass）

### 1-5. 公開フロー API 動作確認
- [ ] `GET /api/interview/[slug]/public-config` が安全列のみ返す（機微列を返さない）
- [ ] `POST /api/interview/[slug]/questions` が question_text / sort_order のみ返す（token 必須）

---

## 2. 有料API導入後に確認する E2E（料金・外部設定が絡む・最後にまとめて）

- [ ] **OpenAI Realtime（AI音声面接）**：音声の双方向・レイテンシ
- [ ] **アバター発話**：質問読み上げ・口パク・状態遷移
- [ ] **音声認識**：応募者回答の文字起こし
- [ ] **質問ラリー UX**（§下記の未実装項目）：質問読み上げ→「回答してください」→回答→無音検知/「回答完了」→次質問→完了判定
- [ ] **EBCA 評価 writer**：面接終了後に全Q&Aから6軸スコアを生成し `interview_results`（evaluation_axes / total_score / detail_json）へ書き込み
- [ ] **R2 録画保存**：録画アップロード・180日保持
- [ ] **Twilio Verify（実SMS）**：OTP 送信・検証（「1234」モックを置換）
- [ ] **Stripe 確定請求**：月末締めバッチ（BATCH-001）・billing_records writer・請求履歴
- [ ] **Resend 通知**：トランザクションメール送信

---

## 3. 本番前に消す/無効化するもの

- [ ] **デモ用フォーム入力補助/初期値**：`app/interview/[slug]/form/page.tsx` の `is_demo` 分岐（テスト太郎 / 09012345678 / debug@test.com / 東京都 / university の自動入力）を削除・無効化
- [ ] **1234 認証モック**：`app/interview/[slug]/verify/page.tsx`（`codeString === '1234'`）を Twilio Verify へ置換
- [ ] **テスト会社/テストデータ**：`is_demo=true` の「テスト株式会社」・デモ seed（`supabase/seed/`）・社風分析デモデータの本番除外/分離
- [ ] **本番 env 未設定項目**の確認：`INTERVIEW_TOKEN_SECRET`（サーバ専用・本番値）／`SUPABASE_SERVICE_ROLE_KEY`／OpenAI/Twilio/R2/Stripe/Resend の各キー（導入時）
- [ ] **secret/token のログ出力なし**（現状 console に token/secret/key 出力は無し＝確認済み・回帰しないこと）

---

## 4. 死蔵API棚卸し（削除はまだしない・一覧化のみ）

`/api/interview/[slug]/` 配下で **現行フローから実 fetch されていない**旧API（createClient(anon) 等）。現行は `applicant` / `start` / `end` / `satisfaction` / `snapshot` / `public-config` / `POST questions`。

| 旧API | 状態 | 備考 |
|---|---|---|
| `verify-url` | 実fetchなし | 旧slug検証。public-config が代替 |
| `answer` | 実fetchなし | 旧・回答送信 |
| `end-reason` | 実fetchなし | 旧・終了理由 |
| `extend` | 実fetchなし | 旧・延長 |
| `status` | 実fetchなし | 旧・状態取得 |
| `complete` | 実fetchなし | 旧・完了処理（end に統合） |
| `GET /api/interview/[slug]/questions` | 実fetchなし | 旧スキーマ（question_banks/questions）参照。**POST が現行**で同一 route に同居 |

- いずれも **削除候補だが今回は削除しない**（別タスクで独立コミット）。削除時は影響ゼロを再確認すること。

---

## 5. 既存lint棚卸し（修正は別タスク・今回しない）

- 全体 **約110件超**（error/warning）。**すべて非機能**（unused-vars / react-hooks/exhaustive-deps / 変数宣言順 / `<img>` 推奨 等）。
- 集中ファイル（件数多い順・概算）：
  - `app/admin/(dashboard)/applicants/[id]/page.tsx`
  - `app/client/(dashboard)/dashboard/page.tsx` / `applicants/page.tsx`
  - `app/interview/[slug]/practice/page.tsx` / `session/page.tsx` / `prepare/page.tsx` / `diagnosis/page.tsx`
  - `components/shared/JobManager.tsx`
  - 一部 `app/api/admin/*`
- **機能変更なしで直せるもの**が大半。ファイル群ごとに分割して別タスクで対応。新規コミットでは「新規lintゼロ」を維持する運用を継続。

---

## 6. 残課題の優先順位

### すぐやる（無料・低リスク）
- 本チェックリストの無料E2E（§1）を実機で一通り通す
- docs整合の残（必要なら）

### 有料API導入前にやる（無料・コード変更あり・各独立）
- 死蔵API削除（§4）
- 既存lint修正（§5・ファイル群ごと）

### 有料API導入時にやる
- OpenAI Realtime / アバター / 音声認識 / 質問ラリー UX / EBCA writer / R2 / Twilio / Stripe / Resend（§2）

### 本番直前にやる
- デモ補助/1234モック無効化・テストデータ分離・本番env確認（§3）
- 低優先 cleanup（`roles={public}→{authenticated}` relabel・死蔵テーブル DROP・死蔵API削除の最終確定）

### 後回しでよい
- **culture_* 一式の DROP（C-4）**：社風機能は不採用・コード削除済み。死蔵テーブル/列（culture_surveys/culture_survey_responses/culture_profiles・companies.culture_analysis_enabled・interview_results.culture_fit_score/culture_fit_detail/big_five_scores）を要バックアップで DROP
- 古い `docs/MIGRATION_SQL.md` と実DBの差異の追記整理（注記済み）
