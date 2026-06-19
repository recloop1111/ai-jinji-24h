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

> **方針**：以下は**開発・営業デモ中は必要**なので「今すぐ」は消さない。**本番カットオーバー直前に必ず一括対応**する（実施順序は下記 3-5）。実コードの該当ファイル/行を明記。現状 console に token/secret/key 出力は無し（確認済み・回帰させないこと）。
> **「今すぐ対応」と「本番直前対応」の区別**：本節は**すべて「本番直前対応」**（開発・無料E2E・営業デモで現役のため、今は残す）。「今すぐ対応」に該当する disable 項目は**現時点で無し**。

### 3-1. 認証バイパス（最重要・本番に残すと危険）
- [ ] **SMS 1234 モック**：`app/interview/[slug]/verify/page.tsx` L106-107（`if (codeString === '1234')`）。固定コードで認証通過＝**認証バイパス**。→ **Twilio Verify（実SMS）へ切替**（有料APIフェーズ）。本番に絶対残さない
- [ ] **client デモバイパス**：`lib/hooks/useCompanyId.ts` L6・L32-44（`?demo=true` もしくは sessionStorage `client_demo_mode` → 未ログインでも `DEMO_COMPANY_ID = 7a58cc1b-…` に解決）。伝播元 = `app/client/components/ClientLayout.tsx` L31/111・`app/client/(dashboard)/plan/page.tsx` L49/170。**未ログインでデモ企業IDに解決できる**ため、**本番前に必ず塞ぐ**（demo 経路と DEMO_COMPANY_ID を削除）

### 3-2. デモ入力補助 / ダミーデータ
- [ ] **応募フォーム デモ初期値**：`app/interview/[slug]/form/page.tsx` L46/92 `isDemo` state ＋ L94-108 `if (company.is_demo)` 分岐（テスト/太郎・`09012345678`・`debug@test.com`・東京都・university の自動入力）。本番前に削除。※ **残 unused-vars の `isDemo`（form L46）はこのデモ補助撤去タスクに合流**（lint 単独では触らない）
- [ ] **client 応募者詳細 DUMMY**：`app/client/(dashboard)/applicants/[id]/page.tsx` L12+ `const DUMMY = { name:'山田 太郎', email:'yamada@example.com', phone:'090-1234-5678', … }`（TODO「Phase 4 実データに差替え」）。本番前に**実データ化または削除**
- [ ] **prepare dummyCompany フォールバック**：`app/interview/[slug]/prepare/page.tsx` L8-14 `dummyCompany`（「株式会社サンプル」）＋ L124/129/167 のフォールバック表示。**本番で表示されてよいか要判断**（無効URL時の表示方針）

### 3-3. demo企業 / seed（DB・本番分離）
- [ ] **demo企業**：「テスト株式会社」（`DEMO_COMPANY_ID = 7a58cc1b-9f81-4da5-ae2c-fd3abea05c33`・`interview_slug = test`・`is_demo = true`）を**本番DBに混ぜない／本番では明確に分離**
- [ ] **デモ seed**：`supabase/seed/demo_ebca_evaluation_axes.sql` / `supabase/seed/demo_profile_summary.sql`（手動・テスト株式会社用）を**本番に適用しない**（手動なので自動適用はされないが、誤適用に注意）

### 3-4. 本番 env（コミット禁止・本番値で設定）
コード参照の `process.env`（**insecure な `|| 'デフォルト'` fallback は皆無＝良好**）。本番環境変数に本番値で設定：
- [ ] `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`（クライアント）
- [ ] `SUPABASE_SERVICE_ROLE_KEY`（サーバ専用・非公開・NEXT_PUBLIC 不可）
- [ ] `INTERVIEW_TOKEN_SECRET`（公開フロー capability token・**本番強度のランダム値**・コミット禁止）
- [ ] `INTERNAL_BATCH_SECRET`（`/api/internal/batch/*` の cron 認証）
- [ ] Twilio / Stripe / Cloudflare R2 / Resend / OpenAI の各キー → **導入時に設定**（現状コード未参照）
- [ ] **secret/token をログに出さない**（回帰チェック）

### 3-5. 本番直前の実施順序（推奨）
1. **client デモバイパス削除**（3-1：useCompanyId の `?demo=true`/DEMO_COMPANY_ID 経路＋ClientLayout/plan の伝播）→ 未ログイン解決を塞ぐ
2. **応募フォーム デモ初期値＋`isDemo` 削除**（3-2：form の is_demo 分岐・unused-vars 解消も同時）
3. **1234 → Twilio Verify 切替**（3-1：有料APIフェーズとセット）
4. **client 応募者詳細 DUMMY の実データ化/削除**（3-2）
5. **demo企業/seed の本番分離**（3-3）＋ **本番 env 設定確認**（3-4）

---

## 4. 死蔵API棚卸し（削除はまだしない・一覧化のみ）

現行フローから実 fetch されていない死蔵API。**第1〜3弾は削除済み**。現行の公開面接フロー = `applicant` / `start` / `end` / `satisfaction` / `snapshot` / `public-config` / `POST questions`。

### 死蔵API削除（実施済み）
| 弾 | 削除した API | コミット |
|---|---|---|
| 第1弾 | interview 旧6本（`verify-url` / `answer` / `end-reason` / `extend` / `status` / `complete`）＋ `GET /api/interview/[slug]/questions`（旧スキーマ・GET のみ。POST は現行で温存） | `afde6b3` |
| 第2弾 | billing 2本（`GET /api/admin/billing`〔非summary〕/ `GET /api/client/billing`）。`/summary` は現行で温存 | `dd62380` |
| 第3弾 | 旧 admin 質問CRUD 3本（`questions` / `questions/reorder` / `questions/[question_id]`・旧スキーマ）＋ `companies/[id]/route.ts` の question_banks 死蔵サブクエリ除去（D-1/D-2） | `333fedc` |

### 未実行 DROP 草案（手動・SQL未実行）
| 草案 | 対象 | 実行 |
|---|---|---|
| `supabase/rls/phase_c4_drop_culture_feature.sql` | culture_* 3テーブル＋companies/interview_results の culture 列 | 未実行（要バックアップ・低負荷時） |
| `supabase/rls/phase_d3_drop_legacy_question_schema.sql` | 旧質問スキーマ `questions` / `question_banks` | 未実行（依存FK確認・バックアップ・低負荷時・実行後E2E） |

- 旧質問スキーマ（question_banks/questions）は**コード参照ゼロ**（D-1/D-2 で撤去）。現行質問は新スキーマ `common_questions` / `job_questions`（QuestionEditor・INT-017）。

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
