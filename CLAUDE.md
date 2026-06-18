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

## AI評価方式（確定）: Evidence-based Competency Analysis（エビデンスベース・コンピテンシー分析）
- 企業ごとに質問が異なっても、AIが**面接全体の回答を横断的に分析**し、発言内容・具体性・一貫性・行動傾向を根拠（evidence）に6軸でコンピテンシーをスコア化する方式
- 各軸に **score / rank / evidence / confidence / insufficient_reason** を付与。根拠不足の軸は無理に断定せず `score=null` ＋「判断材料不足（insufficient_reason）」として扱う
- **旧方式（質問ごとに primary_axis / secondary_axis / weight を運営が事前設定し加重平均）は廃止**（カスタム質問と相性が悪いため）。質問の軸ヒントは任意・評価に非必須
- 格納先 = `interview_results.evaluation_axes`（jsonb・DB変更不要）。スキーマは docs/API_DESIGN.md（CLI-006 レポート取得）参照
  - 形式: `[{ axis, label, score(0-20 or null), rank(A-E or null), evidence:[], confidence: high|medium|low, insufficient_reason: string|null }]`
- **P-10 実装課題**: 面接終了後、OpenAIが全Q&Aを横断入力として6軸評価を生成し `evaluation_axes` / `total_score` / `detail_json` へ書き込む writer（現状 writer 無し＝シードのみ）。表示側 `normalizeEvaluationAxes`（admin/client 応募者詳細）は将来 evidence/confidence/判断材料不足 の表示に拡張が必要

## 現在の進捗 (2026-06-17)

### Phase 2-a: 完了（公開面接フローの service-role API化＋ケイパビリティ・トークン）
- **HMAC-SHA256 ケイパビリティ・トークン**導入（`lib/interview/capability-token.ts`。payload `{slug, applicant_id, iat, exp}`・exp 2h・`timingSafeEqual`）。秘密鍵 = **`INTERVIEW_TOKEN_SECRET`（サーバ専用 env・NEXT_PUBLIC不可・コミットしない）**。
- 公開面接フローの **browser Supabase 直書きを全廃**し、token付き **service-role API** へ移行（service-role は RLS bypass）。各APIは slug/applicant_id/company/interview の整合を再検証：
  - `POST /api/interview/[slug]/applicant` — 応募者作成＋token発行（company_id は slug 由来で確定）
  - `POST /api/interview/[slug]/start` — 面接開始（既存 in_progress を cancelled 化→新規 in_progress 作成）
  - `POST /api/interview/[slug]/end` — 終了確定（interviews=completed/cancelled・ended_at・is_billable＝10分超／**applicants.status を end API 側で確定**：completed→'完了'・cancelled→'途中離脱'＋result='不採用'／他 in_progress を cancelled 化）
  - `POST /api/interview/[slug]/satisfaction` — 満足度（1〜5）保存
  - `POST /api/interview/[slug]/snapshot` — 質問スナップショット保存（in_progress時のみ）
- **interviews.status 運用 = `in_progress` / `completed` / `cancelled`**。applicants/interviews への公開フロー browser 直書きは無し。**公開フロー（/interview・/survey）の browser Supabase 直アクセスはすべて撤去済み**（読み取りも含め service-role API 経由。下記 Phase 2-d-1 / 2-e-1）。
- ※ 既存 `/api/interview/[slug]/{verify-url,answer,end-reason,extend,status}` は createClient(anon)・未使用の旧APIで温存（将来整理）。`questions` は **POST が現行**（下記）・GET は旧スキーマ参照の温存。

### RLS ハードニング進捗（手動実行用SQL: supabase/rls/・migration外）
- **Phase 1（実行済）**: `interview_results` の anon SELECT/INSERT・authenticated true系を遮断、`company_select_interview_results` 維持＋`admin_select_interview_results` 追加。
- **Phase 2-pre（実行済）**: applicants/interviews の不要 `authenticated_insert/update`（qual=true）を削除。
- **Phase 2-c（実行済）**: applicants/interviews の **anon insert/select/update を遮断**、`company_select_*`・`company_update_applicants` 維持、**`admin_select_applicants`/`admin_select_interviews` 追加**（admin/super_admin が全社参照）。公開フロー書き込みは service-role API（RLS bypass）で継続。
- **Phase 2-d（実行済）**: `companies` / `common_questions` の **anon SELECT を遮断**、`company_*` 維持、**`admin_select_companies` 追加**（admin の companies browser SELECT 担保）。`supabase/rls/phase2d_companies_common_questions_anon_lockdown.sql`。
- **Phase 2-d-3（実行済）**: `jobs` / `job_questions` の **anon SELECT を遮断**、company系/authenticated系を温存。`supabase/rls/phase2d3_jobs_job_questions_anon_lockdown.sql`。
- **Phase 2-f（実行済）**: 死蔵5テーブル（`applicant_feedback` / `cooldown_locks` / `interview_re_exam_records` / `otp_locks` / `satisfaction_ratings`）の **public(true) policy を遮断**（RLS有効・policy 0件 or 既存 company系のみ＝service-role のみ到達）。テーブル/データは不変。`supabase/rls/phase2f_dead_tables_anon_lockdown.sql`。
- **anon 遮断済みテーブル**: interview_results / applicants / interviews / companies / common_questions / jobs / job_questions / applicant_feedback / cooldown_locks / interview_re_exam_records / otp_locks / satisfaction_ratings。
- admin判定は `profiles.role IN ('admin','super_admin')`。service-role は全 RLS を bypass。

### Phase 2-d-1: 完了（interview 公開設定 API・companies/jobs の公開読み取りを service-role 化）
- **`GET /api/interview/[slug]/public-config`**（service-role）: companies の**安全列のみ**（id/name/logo_url/interview_slug/is_suspended/is_demo/brand_color/avatar_config）＋当該企業の active jobs（id/title/employment_type）を返す。機微列（email/phone/contact/price/plan/stripe/company_setting_password_hash/auth_user_id 等）は返さない。
- `/interview/[slug]` の page/verify/prepare/form の companies/jobs **browser 直読みを撤去**し本APIへ移行 → Phase 2-d の companies anon 遮断が可能に。
- **`POST /api/interview/[slug]/questions`**（service-role＋capability token）: applicant.job_id 由来で `job_questions` を取得（question_text / sort_order のみ・昇順）。`/interview/[slug]/session` の job_questions browser 直読みを撤去 → Phase 2-d-3 の job_questions anon 遮断が可能に。

### Phase 2-e: 完了（社風アンケート公開フローの service-role API化／culture_* は対応不要）
- **`GET /api/survey/[slug]/public-config`**（service-role）: culture_surveys の安全列（id/department/employment_type/is_active）＋company{id,name}のみ返す。回答/分析データ・会社機微列は返さない。
- **`POST /api/survey/[slug]/response`**（service-role）: 匿名回答（**token不要・slug が回答権限**。回答者識別が無いため capability token は不適）。20問を検証し**サーバ側で5因子スコア計算**→`culture_survey_responses` INSERT→同 survey 全回答を集計し `culture_profiles` を upsert（count≥3 で平均、count<3 は response_count のみ）。
- `/survey/[slug]` の culture_surveys/culture_survey_responses/culture_profiles の **browser 直アクセスを全撤去**（fetchSurvey→public-config、handleSubmit→response API）。
- **Phase 2-e-2（RLS変更不要・完了扱い）**: `culture_surveys` / `culture_survey_responses` / `culture_profiles` の実DBポリシーは `roles={public}` だが**全て `auth.uid()` 経由の company スコープ条件付き**（`USING(true)`/`WITH CHECK(true)` の無条件開放は存在しない）。**anon は `auth.uid()` が null → 条件 false → 実効的に遮断済み**。当初「culture_* 全開放」は `docs/MIGRATION_SQL.md` の古い `USING(true)` 記述に基づく**誤前提**だった（実DBと乖離）。Phase 2-e-1 の service-role API化により匿名回答が正しく保存可能に。

### RLS ハードニング クローズアウト（残課題＝低優先 cleanup / 別タスク）
- **survey の重複回答/スパム対策**（localStorage / cookie / IP rate limit / reCAPTCHA）。匿名・slug ベースのため別タスク。
- **admin/applicants[id] の culture_profiles browser 読み**は admin の `profiles.company_id` が null だと0件になり得る（RLS遮断とは別の既存機能課題。`admin_select_culture_profiles` or admin用 service-role 参照APIを別タスクで検討）。
- **`roles={public}` の relabel cleanup**: culture_* / 多数の company_* policy は `{public}＋auth.uid()条件` で即時漏洩は無いが、`{authenticated}` への明示化は将来の低優先 cleanup 候補（書き間違いで自社アクセスを壊すリスクがあり緊急度は低い）。
- **死蔵テーブル自体の DROP**（satisfaction_ratings 等）/ **死蔵API削除** / **既存lint整理** は別タスク。
- **本番前E2Eチェックリスト**整備（無料確認範囲＋有料API E2E を分離）。
- **有料API系（OpenAI Realtime / Twilio / Cloudflare R2 / Stripe / Resend）＋ EBCA評価 writer** は費用・外部審査が絡むため最後にまとめて導入・E2E確認。

### admin 画面ガード（実行済）
- **`GET /api/admin/me`** 追加（`getAdminUser()` 流用・admin/super_admin のみ 200、他は 401/403）。
- **admin (dashboard) layout で role 検証**→未認可は `signOut()`＋`/admin/login` へ。認可確定まで外枠・サイドバー・children を非描画。logout も `supabase.auth.signOut()` 実装。
- → **company アカウントでは /admin/* に入れない**（API は getAdminUser、画面は layout guard の二重）。

### 公開面接フロー修正（実行済）
- verify：誤コード時に入力欄クリア＋先頭フォーカス＋インラインエラーで即再入力可（認証は現状「1234」モック）。
- ended：`/` や `/client/login` へ遷移しない（応募者向け終了表示）。応募者フローは企業管理画面と分離。

### 応募者ステータス表示仕様（確定）
- DBの **`applicants.status` は CHECK制約で `準備中`/`完了`/`途中離脱` の3値のみ**。「面接中」は**DBに保存しない**。
- 表示は **最新 `interviews.status` から導出**（`lib/applicants/displayStatus.ts`）：`in_progress`→面接中／`completed`→完了／`cancelled`→途中離脱／interview無→準備中。**applicants.status='完了'/'途中離脱' を最優先**。最新は created_at 降順先頭（古い in_progress 孤児に引っ張られない）。
- client/admin の一覧・詳細・dashboard に反映。EBCA・人物概要表示や選考ステータス更新には非影響。

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

### 残課題（Phase 2-c 以降・docs・有料API）
- **RLSハードニングは実質完了**（Phase 1/2-pre/2-a/2-c/2-d/2-d-1/2-d-3/2-f/2-e-1 完了、2-e-2 は対応不要）。公開フローの anon 由来の漏洩/改竄リスクはクローズ。詳細は上記「RLS ハードニング進捗」「Phase 2-d-1」「Phase 2-e」節。
- **docs整合（順次・進行中）**: RLSハードニング完了状況を各設計書へ反映。`CLAUDE.md`（反映済）→ `INFRASTRUCTURE.md`（RLS表＋phase）→ `API_DESIGN.md`（public-config/questions/survey API）→ `REQUIREMENTS.md`（公開フロー書き込み方針・anon SELECT訂正）→ `MIGRATION_SQL.md`（culture_* は注記で訂正）→ `SCREEN_DESIGN.md`（survey 実装注記）。
- **低優先 cleanup（別タスク）**: survey 重複回答/スパム対策（localStorage/cookie/IP rate limit/reCAPTCHA）／admin culture_profiles 参照の是正（admin_select_culture_profiles or service-role API）／`roles={public}`→`{authenticated}` relabel／死蔵テーブル DROP／死蔵API削除／既存lint整理。
- **有料API系は最後にまとめて導入・E2E確認**（費用・外部審査が絡むため）: OpenAI Realtime 音声面接／アバター音声／音声認識／**EBCA評価生成 writer（interview_results）**／録画（R2）／Twilio 実SMS（現状「1234」モック）／Stripe **確定請求 writer（BATCH-001）**／Resend 通知。
- **本番前E2Eチェックリスト**整備（無料で確認できる範囲 ＋ 有料API E2E を分けて一覧化）。
- **デモ用のフォーム入力補助/初期値は本番前に削除・無効化**する（`/interview/[slug]/form` 等）。

### 残課題（料金まわり以降）
- billing 整理状況:
  - **当月見込みは実データ化済み**（admin `/api/admin/billing/summary`・client billing とも companies × interviews(`is_billable`) × price_per_interview のリアルタイム算出。Stripe非依存で動作）
  - **課金フラグ列ドリフトを是正済み**: 実DB列は `interviews.is_billable`（旧 `billable` は不在）・`interviews.ended_at`（旧 `completed_at` は不在）。読み取りカウント側は `.eq('is_billable', true)` に統一。**is_billable の writer は Phase 2-a 以降 `POST /api/interview/[slug]/end`（service-role）で確定**（`is_billable = duration_seconds > 600`）。**課金判定 = 10分超（INT-009）。途中離脱でも10分超なら請求対象**。`/api/interview/[slug]/complete`・`/status` route は実DB列へ是正済みだが**呼び出しゼロの死蔵 endpoint**（削除は今回せず温存）
  - **invoices 参照は billing_records に是正済み**（実DBに invoices テーブルは無い。admin/client billing は billing_records 読み。amount=amount_jpy / tax=tax_jpy / period=billing_month→YYYY-MM / status=payment_status）
  - **確定請求 writer / Stripe月末締めバッチ（BATCH-001 `/api/internal/batch/monthly-billing`）は未実装** → 確定請求履歴・未入金・年間累計・月次グラフは writer 実装まで空状態。Stripe導入（P-10）連動で将来対応
  - `payment_status` の値集合は未確認（billing_records 0件）。writer 実装時に summary の status 正規化を再確認
  - **死蔵エンドポイント**: `GET /api/admin/billing`（非summary）・`GET /api/client/billing` はどの画面からも未呼び出し（admin画面は summary、client画面はブラウザ直クエリを使用）。billing_records 対応済みで schema-valid だが未使用。削除は破壊的なため当面据え置き（将来整理）
- /admin/settings のダミーUI整理（EMAIL_TEMPLATES / API_LOGS 等）
- /admin/security のダミーUI整理（SECURITY_ALERTS。実API /api/admin/security/alerts への接続 or 空状態化）
- 応募者詳細系の DUMMY 実データ化（admin/client の applicants/[id]）は**別途方針決定が必要**（現状は触らない指定）
- 満足度（satisfaction）周辺の整理:
  - `satisfaction_ratings` は**書き込み元のない死蔵テーブル**（実データ保存先は `applicants.satisfaction_rating`）。削除/型整理は別タスク（今回は放置）
  - 満足度送信は **`POST /api/interview/[slug]/satisfaction`（service-role＋token）に移行済み**（Phase 2-a）。`/interview/[slug]/complete` のブラウザ直 update は廃止。保存先は `applicants.satisfaction_rating`
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
