# デジタル履歴書 v1 — Phase A 設計書（監査＋最終設計）

> 本書は **設計のみ**。migration/DB変更/フォーム実装/PDF実装は含まない（Phase B 以降）。
> 監査対象コミット: main `aaeffe0`。branch `feature/digital-resume-v1`。

---

## 0. 現状監査サマリー（重要な発見）

| 項目 | 現状 | 示唆 |
|---|---|---|
| applicants schema | 実列は snake_case（下記）。`birth_date DATE` / `age INTEGER`（後付 migration）あり | 住所は `prefecture` のみ。city/town/postal/address/building 無し |
| 学歴/職歴/資格 | `education` / `work_history` / `qualifications` の **単一 TEXT** | 構造化は子テーブル新設が必要。legacy TEXT は残す |
| 応募者フォーム | `app/interview/[slug]/form/page.tsx`（618行・**単一ページ**・Turnstile captcha・`/applicant` POST） | 6 sub-step 化＋draft＋postal＋DOB は本体書き換え |
| applicant 作成 API | `POST /api/interview/[slug]/applicant`（service-role・Turnstile・slug→company・server が company_id/status/flags 確定・capability token 発行） | 公開 write 境界は堅牢。ここへ resume payload を拡張 |
| RLS | `company_select_applicants`（自社）/`admin_select_applicants`（全社）/anon insert・select は撤去（公開 write は service-role API のみ） | 子テーブルも同型で設計 |
| Supabase Storage | **bucket 使用箇所ゼロ**（コード上に storage 参照なし） | 証明写真は新 private bucket が必要 |
| **PDF** | **`pdfkit ^0.19.1` 導入済み**。`lib/billing/invoice-pdf.ts` が `font:''`＋**日本語 TTF 埋め込み**で A4 日本語 PDF を生成。`/api/client/billing/[id]/invoice` が Node ランタイム・tenant check・`Content-Disposition: attachment`・`Cache-Control: no-store` で配信 | **履歴書 PDF は同パターンを流用（新規依存ゼロ）** |
| 日本語フォント | `assets/fonts/IPAexGothic.ttf`（IPA ライセンス・再配布可・商用可）を既に同梱・invoice で使用。`next.config.ts` の `outputFileTracingIncludes` で各 PDF ルートに同梱 | 履歴書ルートも同エントリ追加で解決 |
| Next / React | Next `^15.1.9` / React `^19.2.4` / **Node runtime**（`export const runtime='nodejs'`） | pdfkit・fs・crypto OK。Edge 不使用 |
| 企業側 履歴書タブ | `app/client/(dashboard)/applicants/[id]/page.tsx` に `resume` タブ（既存 applicant 列で 氏名/フリガナ/年齢/性別/最終学歴/職歴/資格 等を表示） | ここを本物の履歴書表示へ |

**結論**: PDF・日本語フォント・PDF セキュリティ・公開 write 境界・RLS 型・Node ランタイムは **既存の実証済みパターンで賄える**。新規リスクは (a) 子テーブル追加＋atomic 保存、(b) 住所 API、(c) 証明写真 storage、(d) フォーム UX 大改修 の4点に集約。

---

## 4. 現行 applicant schema（実列）

```
applicants(
  id uuid pk, company_id uuid fk,
  last_name, first_name, last_name_kana, first_name_kana  -- 氏名
  birth_date date, age integer,                            -- 生年月日/年齢（age は後付）
  gender text check(male|female|other|no_answer),
  phone_number text, email text,
  prefecture text,                                         -- 住所は都道府県のみ
  education text, work_history text, qualifications text,   -- 単一 TEXT（非構造）
  employment_type check(new_graduate|mid_career),
  industry_experience check(experienced|inexperienced),
  job_id uuid,                                             -- 応募求人（jobs）
  selection_status, status('準備中'…), result('未対応'…),
  duplicate_flag, inappropriate_flag,
  satisfaction_rating int,
  created_at, updated_at )
```

## 5. 既存 fields で再利用するもの（重複保存しない）
`last_name/first_name/last_name_kana/first_name_kana` ・ `birth_date` ・ `gender` ・ `phone_number` ・ `email` ・ `prefecture` ・ `employment_type` ・ `industry_experience` ・ `job_id`。
- `age`：**列は残すが SoT にしない**。表示/PDF では `birth_date` から都度計算（手入力させない）。互換のため書き込みは継続してよいが、無ければ birth_date から導出。
- `education/work_history/qualifications`（TEXT）：**legacy 互換で残す**。新 UI は子テーブルに書くが、旧データ（子行なし）は詳細/PDF でこの TEXT にフォールバック表示。

## 6. applicants へ追加する fields（additive・NULL 許容）
```
ALTER TABLE applicants ADD COLUMN IF NOT EXISTS
  postal_code   text,      -- 7桁（ハイフンなし正規化保存）
  city          text,      -- 市区町村
  town          text,      -- 町域
  address_line  text,      -- 番地
  building      text,      -- 建物名・部屋番号
  motivation    text,      -- 志望動機
  self_pr       text,      -- 自己PR
  personal_requests text,  -- 本人希望欄
  resume_photo_path text,  -- 証明写真の storage パス（private・public URL 化しない）
  resume_updated_at timestamptz;
```
`prefecture` は既存を継続使用（都道府県）。→ 住所 = `postal_code + prefecture + city + town + address_line + building`。

## 7. 新規子テーブル（すべて additive・legacy 非破壊）
```
applicant_educations(
  id uuid pk default gen_random_uuid(), applicant_id uuid fk not null,
  sort_order int not null default 0,
  school_type text check(junior_high|high_school|vocational|junior_college|university|graduate_school|other),
  school_name text, faculty_department text,
  entered_year_month text,   -- 'YYYY-MM'（<input type=month> 互換・DATE にしない=年月のみ）
  graduated_year_month text, -- 'YYYY-MM'
  graduation_status text check(graduated|expected|withdrawn|enrolled),
  created_at, updated_at )

applicant_work_experiences(
  id uuid pk, applicant_id uuid fk not null, sort_order int not null default 0,
  company_name text, department text, position text,
  employment_type text,               -- 自由/選択（正社員/契約/派遣/パート等・CHECK は緩め or なし）
  joined_year_month text, left_year_month text, is_current boolean not null default false,
  description text, created_at, updated_at )

applicant_licenses(
  id uuid pk, applicant_id uuid fk not null, sort_order int not null default 0,
  name text, acquired_year_month text, created_at, updated_at )
```
- 年月は `text 'YYYY-MM'`（`<input type="month">` と 1:1・DB での日付演算不要・年月のみで十分）。
- v1 で並び替え UI 無し → 追加順を `sort_order` に保持。削除可。

## 8. table relation
`companies 1—* applicants 1—* {educations, work_experiences, licenses}`。子は `applicant_id` FK（`ON DELETE CASCADE` 推奨）。`resume_photo_path` は applicants 列（1:1 任意）。

## 9. RLS 設計（子3テーブル共通・applicants と同型）
- **company（authenticated）SELECT のみ**：`applicant_id IN (SELECT a.id FROM applicants a WHERE a.company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid()))`（既存 `company_select_interview_transcripts` と同じ join パターン）。
- **admin/super_admin SELECT 全社**：`admin_select_*`（profiles.role in admin/super_admin）。
- **anon / authenticated の INSERT/UPDATE/DELETE ポリシーは付与しない** → 公開フローの書き込みは **service-role API（RLS bypass）経由のみ**。company は read-only（自社）。
- 手動 SQL（`supabase/rls/…`）で作成、**Production 適用は承認後**（migration 自動適用しない方針を踏襲）。

## 10. public applicant write 方式
既存 `POST /api/interview/[slug]/applicant`（Turnstile＋service-role＋slug→company 確定＋capability token 発行）を**拡張**：
- body に resume 構造（address 各項目 / educations[] / work_experiences[] / licenses[] / motivation / self_pr / personal_requests）を受ける。
- server が **applicant 本体＋子行を一括保存**（company_id/status/flags は従来どおり server 確定・client 値信用しない）。
- browser から Supabase 直 write は禁止（現状も service-role API のみ・維持）。

## 11. atomic save 方式（部分保存防止）
子テーブルが増えるため「applicant だけ作成・子が欠落」を防ぐ。比較：
| 案 | 内容 | 評価 |
|---|---|---|
| A. route 内で順次 insert＋失敗時 rollback | applicant insert → 子 insert 失敗時に applicant を delete で巻き戻す | 実装容易だが「巻き戻し自体の失敗」余地・非原子 |
| B. **Postgres RPC（plpgsql 関数）で1トランザクション insert** | `create_applicant_with_resume(jsonb) returns uuid`。関数内で applicant＋子を1 tx。service-role が呼ぶ | **推奨**。真の原子性。SECURITY は **INVOKER**（service-role 実行＝RLS bypass の既存境界と一致・危険な DEFINER を新設しない） |
| C. Edge Function | 過剰 | 不採用 |
→ **B を推奨**（RPC を supabase/rls 手動 SQL で定義・Prod 適用は承認後）。関数は「company_id を引数で受けず、slug 検証済みの server が渡した company_id を使う」形にし、client 値を権威にしない。関数内 CHECK 違反は tx rollback。

## 12. 住所 API 採用案
- **方式**: **server route proxy `/api/postal/lookup?zip=NNNNNNN`（Node runtime）**。client は自 API のみ叩く＝外部 API キー/エンドポイントを client に出さない。7桁 normalize（ハイフン有無両対応）は route 側。
- **データソース比較**:
  | source | 無料 | key | 商用 | 形式 | 備考 |
  |---|---|---|---|---|---|
  | **日本郵便 公式「郵便番号・デジタルアドレス API」** | 無料（標準用途） | **要登録**（client_id/secret→token） | 可 | JSON | 公式・信頼性高。**登録 env が必要**。rate/仕様は登録時規約で確認 |
  | **zipcloud**（zipcloud.ibsnet.co.jp/api/search） | 無料 | 不要 | 可（利用規約範囲） | JSON（prefecture/city/town） | 非公式・3rd party・keyレスで即使える。rate 明記弱め |
  | KEN_ALL 静的同梱 | 無料 | 不要 | 可（公共データ） | 自前 index | 外部依存ゼロだが ~12MB・bundle 負荷大 |
- **provider は Phase C で確定（未確定）**: 「公式日本郵便 API → zipcloud 自動 fallback」は **候補であって正式実装決定ではない**。Phase B では外部 API を呼ばず、`normalizePostalCode` と postal lookup の **response contract** のみ用意。実 provider・env・接続は Phase C で改めてユーザー確認のうえ決定（有料契約はしない）。proxy route は env で source 差し替え可能な形にする方針は維持。
- **失敗時**: route は 404/空を返し、フォームは **block せず手入力可**（「住所を自動取得できませんでした。手入力してください」）。都道府県/市区町村/町域は自動入力後も手修正可。
- ※ 公式 API の現行正式仕様・rate・商用条件は**登録前にユーザー確認が必要**（本 Phase では登録・契約しない）。

## 13. 住所 API 費用/key/rate
- 費用: **0円**（公式・zipcloud とも無料）。
- key: 公式=要（env・server のみ）。zipcloud=不要。
- rate: 公式=登録規約準拠（Phase B で確認）。zipcloud=明示弱め→ **route で短期キャッシュ**（同一 zip の連続要求を抑制）＋失敗時手入力で緩和。
- キャッシュ: `Cache-Control` で route レスポンスを短時間キャッシュ可（住所は不変性高い）。PII ではない（郵便番号→地名のみ）。

## 14. DOB/age 設計
- 入力: `birth_date`（`<input type="date">` or 年/月/日 select）。**age は手入力させない**。
- 表示/PDF: `age = 満年齢(birth_date, today)` を pure helper `computeAge(birthDate, now)` で算出（`lib/resume/age.ts`）。境界（誕生日前後）を単体テスト。
- 保存: `birth_date` を SoT に。`age` 列は互換で birth_date 由来値を書いてよい（表示は常に birth_date 計算を優先）。

## 15. education UI / data model
- UI: **カード型**（1学歴=1カード）。「＋学歴を追加」で増加・各カード削除可。
- `school_type` セレクトで **不要項目を出し分け**（例: junior_high/high_school → `faculty_department` 非表示、university/graduate_school/vocational/junior_college → 表示）。
- 年月 = `<input type="month">`（`YYYY-MM`）。`graduation_status`（graduated/expected/withdrawn/enrolled）セレクト。
- 表示判定は pure helper `educationFieldVisibility(school_type)` に集約（テスト可能）。
- data: `applicant_educations`（上記）。

## 16. work experience UI / data model
- UI: カード型・「＋職歴を追加」・削除可。`company_name/department/position/employment_type/joined_year_month/left_year_month/is_current/description`。
- `is_current=true` → `left_year_month` を disable/hide（pure helper `workRequiresLeftDate(is_current)`）。
- description は任意・長文強要しない。
- data: `applicant_work_experiences`。

## 17. licenses UI / data model
- UI: カード型・「＋免許・資格を追加」・削除可。`name`（自由入力）＋`acquired_year_month`。
- `<datalist>` で一般候補補助（普通自動車第一種運転免許 / TOEIC / 日商簿記 …）＝選択強制しない。
- data: `applicant_licenses`。

## 18. sessionStorage draft 設計
- キー: `interview_{slug}_resume_draft`（**sessionStorage のみ**・localStorage へ長期 PII 保存しない）。
- 保存対象: **履歴書フォーム入力のみ**（他画面状態は含めない）。入力変更時に debounce 保存。
- 復元: reload 時に読み込み「入力途中の内容を復元しました」を小さく表示。
- クリア: **応募成功後**（/applicant 200）＝draft削除。**キャンセル時**も削除。
- pure helper `lib/interview/resume-draft.ts`（serialize/parse/clamp・PII を返り値以外に残さない）＋テスト。

## 19. validation 設計
- タイミング: **step 移動時＋最終 submit 時**（初期に赤エラー大量表示しない）。
- 必須/任意を各項目で明示（性別・description 等は「任意」）。必須は最小限（既存 API 必須: last_name/first_name/phone/email）。
- エラー時: 最初のエラー項目へ **scroll＋focus**（`ref` + `scrollIntoView`）。
- pure helper `validateResumeStep(step, data)` に集約（step 毎の必須判定・テスト可能）。API 側も従来どおり server validation を維持（client を信用しない）。

## 20. mobile UX 設計
- **390 / 430px 最優先**。1カラム・大きめタップ領域・カード積み上げ。年月 UI は native `<input type=month/date>`（モバイルで扱いやすい）。
- PC は `max-width`（例 ~640px）維持・横長入力欄にしない。既存 `StepIndicator` を流用（大フローの見た目一貫）。
- 住所 UI: 郵便番号→自動 3 行→番地→建物 の縦積み。

## 21. photo storage 設計（v1 任意・最後に実装）
- **新 private bucket `resume-photos`**（public 無効）。パス `{{company_id}}/{{applicant_id}}/{{uuid}}.{{ext}}`。
- 受入: JPEG/PNG/WebP・サイズ上限（例 5MB）・**server 側 MIME/magic-byte 検証**（client MIME を信用しない）。client は縦長 crop preview＋任意で圧縮。
- 参照: **signed URL（短期）** を server が発行（public 固定 URL 化しない）。企業表示/PDF 埋め込みは server が signed で取得。
- RLS/権限: bucket policy で company scope（applicant→company）を担保。write は capability token 付き server API 経由。
- **未登録でも応募/PDF 可**（写真枠は空で成立）。→ v1 は **写真を最終サブフェーズ**にし、コア（テキスト履歴書＋PDF）を先に完成。

## 22. company resume tab 設計
- `app/client/(dashboard)/applicants/[id]/page.tsx` の `resume` タブを **本物の履歴書表示**へ：
  基本情報（氏名/フリガナ/生年月日/**年齢=birth_date算出**/性別[入力時のみ]）／住所（postal+都道府県+city+town+番地+建物）／電話・メール／応募職種／**学歴（子テーブル）**／**職歴（子テーブル）**／**免許・資格（子テーブル）**／志望動機／自己PR／本人希望。
- タブ上部に **「PDF履歴書を出力」** ボタン（下記 route を GET）。
- browser Supabase 読取は既存 RLS（company_select）で子テーブルも取得（tenant 安全）。
- **DUMMY 禁止**。データ取得は pure helper で整形。

## 23. legacy applicant compatibility
- 旧応募者（子行なし・住所 city/town なし・PR なし）でも **crash しない**。
- フォールバック: 学歴=`education`(TEXT)、職歴=`work_history`(TEXT)、資格=`qualifications`(TEXT)、住所=`prefecture` のみ、年齢=`age`列 or birth_date。無い項目は **「未入力」/「—」**。
- 子テーブル取得 0 件 → TEXT フォールバック表示（`resolveResumeView(applicant, educations, works, licenses)` pure helper で分岐）。

## 24. PDF 生成方式 比較
| 方式 | 日本語 | font 埋込 | Vercel serverless | bundle | runtime | 外部費用 | ライセンス | 難易度 | 評価 |
|---|---|---|---|---|---|---|---|---|---|
| **pdfkit（既存）** | ✅（TTF 埋込） | ✅ | ✅（既に invoice で稼働） | 小（導入済） | Node | 0 | MIT | 低（既存流用） | **推奨** |
| @react-pdf/renderer | ✅ | ✅ | ✅ | 中 | Node | 0 | MIT | 中（JSX・別体系） | 新規依存・不要 |
| pdf-lib | △（font 手動） | ✅ | ✅ | 小 | Node/Edge | 0 | MIT | 中（低レベル） | 既存 pdfkit で足りる |
| HTML→PDF（puppeteer/playwright） | ✅ | ✅ | ⚠ 重い/Chromium 同梱・serverless で不安定 | 大 | Node | 0 | — | 高 | Vercel で不安定・不採用 |
| browser print | ✅ | — | — | 0 | client | 0 | — | 低 | **file download 要件を満たさない**・不採用 |

## 25. 推薦 PDF 技術
**pdfkit（既存 `lib/billing/invoice-pdf.ts` と同パターン）**。理由: 既に Vercel Node ランタイムで日本語 A4 PDF を安定生成・font 埋込・tenant secure 配信の実績。新規依存ゼロ・bundle 増ほぼ無し・テスト可能（builder を pure 関数化）。
- 新規: `lib/resume/resume-pdf.ts`（`buildResumePdf(input): Promise<Buffer>`・pdfkit・`font:''`＋IPAexGothic）＋ route `GET /api/client/applicants/[id]/resume.pdf`。

## 26. 日本語 font 方式
`assets/fonts/IPAexGothic.ttf`（**既存・IPA ライセンス＝無料/商用可/再配布可**）を再利用。`next.config.ts` の `outputFileTracingIncludes` に
`'/api/client/applicants/[id]/resume.pdf': ['./assets/fonts/IPAexGothic.ttf']` を追加（serverless 同梱）。新規 font 追加・ライセンス不明 font は入れない。

## 27. PDF security（履歴書は PII の塊）
- route: **`getClientUser` 必須**・`applicant.company_id === user.companyId` を service-role read で検証（他社 applicant は FORBIDDEN）。service-role は **server のみ**。
- headers: `Content-Type: application/pdf`・`Content-Disposition: attachment; filename="履歴書_{{姓}}_{{名}}_{{YYYYMMDD}}.pdf"`（**filename sanitize**・RFC5987 `filename*` も付与）・`Cache-Control: no-store`・`Pragma: no-cache`。
- **public URL 化しない**・CDN/browser キャッシュしない（no-store）。PII（氏名/住所/生年月日/本文）を **server log に出さない**（汎用 code のみ）。
- PDF に **AI評価/スコア/Transcript/billing/面接中断情報を入れない**（履歴書項目のみ）。
- 写真埋込は signed URL 経由 server 取得（public 化しない）。

## 28. 必要 dependencies
- **新規なし**（pdfkit・@types/pdfkit・IPAexGothic 同梱済み）。住所は fetch（標準）。
- 追加検討のみ: 画像圧縮を client でやる場合の軽量 lib（任意・写真フェーズ時に判断。過剰実装しない）。

## 29. 必要 env
- コア（テキスト履歴書＋PDF＋zipcloud 住所）: **env 追加ゼロ**で動作。
- 任意アップグレード: 公式日本郵便 API 採用時のみ `JAPANPOST_API_CLIENT_ID` / `JAPANPOST_API_SECRET`（server 専用・登録後）。写真採用時は Supabase Storage は既存 env（`SUPABASE_SERVICE_ROLE_KEY` 等）で足りる想定。**本 Phase では env 変更しない**。

## 30. migration 予定（Phase B で作成・Prod 適用は承認後）
- `applicants` additive 列（§6）。
- 子3テーブル（§7）＋ FK/CASCADE＋`sort_order`。
- RLS（§9）＋ RPC `create_applicant_with_resume`（§11）。
- Storage bucket `resume-photos`＋policy（写真フェーズ）。
- すべて **additive・可逆（ROLLBACK 付）**・`supabase/rls|migrations` に置き、**Production 自動適用しない**（手動・承認後）。

## 31. tests 予定
住所（zip normalize / lookup success / failure→手入力）・DOB→age（境界）・education（add/delete/field visibility/optional/sort）・work（add/delete/is_current→left disable）・license（add/delete）・draft（save/restore/submit clear/cancel clear）・validation（step/first-error focus）・security（resume API 他社拒否・applicant save company mismatch 拒否・service-role 非露出）・legacy（子行なし resume tab / PDF）・PDF（own-company 成功・他社 forbidden・日本語・filename・AI/billing 非混入・写真任意/無し成功）・**既存 applicant flow regression**（同意/SMS/Turnstile/環境確認/practice/interview/completion/demo 1234/demo mock/非demo mock 禁止/billing/途中離脱/Transcript/EBCA/Avatar）。

## 32. 既存 flow への影響
- 追加は **additive**（列/テーブル/API 拡張/新 route）。既存カラム・既存 API 契約・既存 RLS を破壊しない。
- フォーム本体は書き換えるが **/applicant API 契約は後方互換**（新フィールドは任意・旧 body でも成立）を維持。
- SMS/Turnstile/環境確認/面接/課金/mock 方針（demo のみ mock）には触れない。

## 33. リスク
1. **atomic save**（子テーブル）→ RPC で軽減（§11）。
2. **住所 API の信頼性**（zipcloud 非公式 rate）→ proxy＋キャッシュ＋手入力フォールバック＋公式 API への env 切替で軽減。
3. **写真の PII/storage**（signed URL・bucket policy）→ 最終サブフェーズ・任意化で本体リスクを切り離し。
4. **PDF の serverless font 同梱**→ 既存 invoice で実証済（`outputFileTracingIncludes`）＝低リスク。
5. **フォーム UX 大改修の regression**→ sub-step/draft/validation を pure helper 化＋テスト＋既存 StepIndicator 流用で軽減。
6. **公式住所 API 規約未確認**→ Phase B で登録前にユーザー確認（本 Phase では契約しない）。

## 34. Phase B 以降 実装順
- **B**: migration/RLS/RPC/domain（§6,7,9,11）＋pure helpers（age/draft/validation/field-visibility/resolveResumeView）＋テスト。**Prod 適用は承認後**。
- **C**: applicant resume form（6 sub-step・draft・postal proxy route・DOB・card 型 education/work/license・confirm preview・mobile）。
- **D**: company resume tab（本物の履歴書表示・legacy fallback）。
- **E**: PDF（`resume-pdf.ts`＋`resume.pdf` route＋`outputFileTracingIncludes`＋security/headers）。
- **F**（任意・最後）: 証明写真（bucket/signed URL/validation/preview）。
- **G**: tests / QA（Preview）・既存 flow regression 確認。
- 各サブフェーズでユーザー確認を挟む（特に B の migration 適用と E の PDF、F の写真）。

---

## Phase B 実装結果（2026-08・main `aaeffe0` 基点・branch feature/digital-resume-v1）

**実装物**（実装のみ・Production 未適用）:
- SQL: `supabase/rls/p9_applicant_resume.sql`（+ `_ROLLBACK.sql`）— additive 列 + 子3テーブル + index + CHECK + RLS + atomic RPC。**Production 未適用（承認後手動）**。
- 統合テスト: `supabase/local/p9_applicant_resume_test.sql`（素の postgres:16-alpine で TEST1–8 全 PASS を確認）。
- domain/helpers: `lib/resume/types.ts`・`normalize.ts`・`validate.ts` + `resume.test.ts`（vitest 30）。

**確定 RPC signature**:
```
public.create_applicant_with_resume(
  p_company_id uuid,            -- server が slug から解決した権威 company_id（request body の値ではない）
  p_applicant jsonb,            -- normalizer 通過後の applicant フィールド
  p_educations jsonb = '[]',    -- 配列
  p_work_experiences jsonb = '[]',
  p_licenses jsonb = '[]'
) RETURNS uuid   -- 生成された applicant id
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public
-- EXECUTE は service_role のみ（anon/authenticated から REVOKE）
```
- **company authority**: RPC は `p_company_id` を権威に使い、`p_applicant->>'id'`（client applicant_id）は無視して DB 生成。`job_id` は `p_company_id` 所属の求人のみ許可（別会社 job を弾く）。子行の applicant_id は内部生成 id を使用。sort_order は配列 ordinality で 0..N-1 に再採番。
- **security mode**: **SECURITY INVOKER**（`prosecdef=false` を local 実証）。service_role が呼ぶ＝RLS/権限 bypass で atomic insert 成立。**SECURITY DEFINER は不使用**。

**validation 上限（server domain＝SoT・DB varchar にしない）**: 氏名/フリガナ各50・学校名/学部/会社名/部署/役職/資格名/番地/建物 各100・市区町村50・町域100・雇用形態50・郵便7桁・年月`YYYY-MM`・description/motivation/self_pr 各2000・personal_requests 1000・配列上限 education20/work30/license30（`RESUME_LIMITS`）。

**DB constraints/index**:
- CHECK: `school_type`/`graduation_status` enum、年月 `^\d{4}-(0[1-9]|1[0-2])$`、`work_current_no_left`（is_current なら left_year_month NULL）。joined>left・entered>graduated の逆転は **domain validation** 側（`validate.ts`）。
- index: 各子テーブル `(applicant_id, sort_order)`。
- FK: `applicant_id → applicants(id) ON DELETE CASCADE`。

**RLS**: 子3テーブル ENABLE。`company_select_*`（自社 applicant の子のみ・既存 transcript と同型 join）+ `admin_select_*`。**write ポリシー無し**＝公開 write は service-role のみ。

**local 統合テスト結果（TEST1–9 全 PASS）**: ①RPC atomic 作成+生成id+sort再採番+gender省略→no_answer ②不正子→full rollback（orphan なし）③別会社 job 拒否 ④RLS tenant（自社可・他社不可視）⑤admin 全社可 ⑥anon/authenticated の insert 不可・RPC 実行不可 ⑦cascade 削除・is_current+left CHECK・年月 CHECK ⑧SECURITY INVOKER 確認 ⑨rollback preflight meta 記録（新規列のみ）。加えて **rollback collision scenario**（既存 `city` 列＋データがある DB に forward→rollback しても既存列・データを温存し、本 script が新規追加した列/テーブル/RPC のみ除去）を素の postgres で実証。

**Codex review 対応（Phase C ゲート・4件修正済み）**:
- **P1 gender**: gender 任意入力。RPC で未入力時に `COALESCE(NULLIF(...,''),'no_answer')` へマップ（既存 `NOT NULL` CHECK でアトミック失敗させない）。
- **P1 GRANT**: 子3テーブルに **REVOKE ALL + 明示 GRANT**（`authenticated`=SELECT のみ / `service_role`=DML）を forward script 内に追加（Supabase default privilege 非依存＝既存 `interview_transcripts` と同型）。local test の masking GRANT は撤去し、forward の GRANT が実効することを TEST6 で検証。
- **P2 partial card**: 「必須のみ空・他は入力済み」のカードを空扱いで黙って捨てず、**全フィールド空のときだけ除外**（`validate.ts`）＋必須未入力エラーを返す。vitest 追加。
- **P2 rollback**: forward で `_p9_resume_migration_meta` に**新規追加列のみ**（preexisted=false）を記録し、rollback は記録された列だけを DROP＝既存同名列・データを温存。

**Phase B の非対象（据え置き）**: applicant form UI / 外部 postal API 実接続（provider 未確定）/ company resume tab / PDF / photo storage bucket（列 `resume_photo_path` のみ・bucket は Phase F）/ 既存 `/applicant` API の RPC 移行（Phase C で結線）/ Production DB 適用（承認後）。

---

## Phase C 実装結果（2026-08・branch feature/digital-resume-v1）

**応募フォームを 6 サブステップ化**（外枠フロー 同意→情報入力→SMS→環境確認→面接 は不変。「情報入力」内を分割）:
1. 基本情報（氏名/フリガナ/生年月日/性別(任意)/連絡先/応募職種）— **年齢の手入力を撤去**し `birth_date`（native date）から `computeAge` を表示。送信も age は client 値を使わず server が `birth_date` から算出。
2. 住所（〒→都道府県/市区町村/町名を自動入力・複数候補は選択 UI・番地/建物は手入力・手動フォールバック可）
3. 学歴（card 式・学校区分で学部学科の出し分け・native month・追加/削除）
4. 職歴（card 式・在職中で退職年月 disable・「職歴なし」明示・追加/削除）
5. 資格・自己PR（資格 card＋datalist 補助・志望動機/自己PR/本人希望欄 textarea＋文字カウンタ）
6. 確認（read-only プレビュー＋各セクション「修正」＋CTA「この内容で応募する」）

- **下書き**: `interview_{slug}_resume_draft`（sessionStorage・debounce 保存・復元トースト・localStorage 不使用・成功/キャンセルで破棄）。
- **企業ロゴ撤去**: applicant-facing 画面から企業ロゴ描画を削除（会社名テキストのみ）。
- client-side validation は `lib/resume/validate.ts`（server と同一 SoT）を再利用。step 移動時のみ検証、最終送信で `normalizeResumeInput` 再検証。

**API 結線**: `POST /api/interview/[slug]/applicant` を拡張。`body.resume` がある場合のみ RPC 経路：
- `normalizeResumeInput` → errors あれば 4xx（`{ fields }`）。age は `computeAge(birth_date)` で server 計算。gender 空は RPC 側で `no_answer`。
- `supabase.rpc('create_applicant_with_resume', { p_company_id(server解決), p_applicant, p_educations, p_work_experiences, p_licenses })`。atomic＝失敗時 orphan なし・honest error。
- **legacy 互換**: `resume` 無しの従来 payload は従来の直接 insert 経路を維持（既存テスト/Demo/SMS を壊さない）。Turnstile/slug-company 権威/job 検証/capability token は不変。
- `resume_updated_at` は RPC(DB)側で `now()`。

**郵便番号 API（正式方針＝日本郵便「郵便番号・デジタルアドレスAPI」を SoT）**:
- `GET /api/postal/lookup?zip=`（Node runtime）。client は日本郵便を直接叩かない。
- 認証情報は **server env のみ**（`JAPANPOST_API_CLIENT_ID` / `JAPANPOST_API_CLIENT_SECRET` / 任意 `JAPANPOST_API_BASE_URL`）。**未設定なら外部へ出ず `{available:false, reason:'unconfigured'}` を 200 で返す**（500 にしない・フォームは手動入力継続）。zipcloud 等の本番フォールバックは**使わない**。
- OAuth トークンは有効期限つき server-side キャッシュ（instance 単位＝唯一の真実にしない・miss/期限切れで再取得）。認証情報/トークンはログ・応答に出さない。
- 純ロジック `lib/postal/japanpost.ts`（parse/normalize）＋ HTTP `lib/postal/client.ts`。テストは fetch mock（実外部呼び出し 0・トークン漏洩なしを検証）。

**Production DB 適用（P9 migration）= 本 phase では未適用**: 実行環境に DB 直結情報（`SUPABASE_DB_URL`/service-role/CLI/linked project）が無く、DDL を適用できないため未実施。`supabase/rls/p9_applicant_resume.sql` を **Supabase Dashboard SQL Editor（project `shbqbsropivbivklxuek`）で手動適用**が必要（適用まで resume 経路は 500 系 honest error になる）。

**テスト/品質**: vitest 1070 all pass（resume 32 / postal 11 / form guard 更新）・tsc 0・build OK・変更ファイル lint clean。docker postgres で TEST1–9＋rollback collision PASS。

**本 phase 非対象**: company resume tab 本実装 / PDF 出力 / 証明写真アップロード。
