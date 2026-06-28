# phase2h 適用ランブック（companies SELECT 列ホワイトリスト）

P1 #1（`companies.company_setting_password_hash` が authenticated 自己可読）の最終対策として、
`companies` のテーブル全体 SELECT を剥奪し、安全列のみ列 GRANT する（`phase2h_companies_select_column_whitelist.sql`）。

> **重要**
> - これは **MIGRATION ではない**。`supabase/migrations` には置かない（本番自動適用しない）。
> - **手動実行専用**（運用者が Supabase SQL Editor / psql で意図的に流す）。
> - 本番DBへの適用は **承認後**に行う。このランブックの SQL は未適用。
> - **secret 値は扱わない**。

## 前提（コード前段）

コード前段（`d09b3a6`・設定PWハッシュ等の service-role 移行）が **本番 = Preview に反映済み（Vercel デプロイ済み）** であること。
移行済み5経路:
1. `app/api/client/suspension/request/route.ts` — hash 読みを service-role
2. `app/api/client/suspension/emergency/route.ts` — hash 読みを service-role
3. `app/api/client/plan/route.ts` (PATCH) — hash 読みを service-role
4. `app/api/client/plan/route.ts` (GET) — 安全列のみ明示 select（hash 不要）
5. `app/api/client/security/setting-password/route.ts` (`fetchCompanyHash`) — service-role + hash 列のみ

これらが未反映のまま phase2h を適用すると、停止申請 / 緊急停止 / プラン取得・変更 / 設定PW状態取得 が
「列 permission denied」または hash 取得不可で失敗する。

---

## ① 適用前チェック（READ-ONLY・状態を変えない）

```sql
-- (1) authenticated/anon が現状 SELECT 権を持つ companies 列（適用前スナップショット）
SELECT grantee, privilege_type, column_name
FROM information_schema.role_column_grants
WHERE table_schema='public' AND table_name='companies'
  AND grantee IN ('authenticated','anon') AND privilege_type='SELECT'
ORDER BY grantee, column_name;
```

```sql
-- (2) テーブル全体 SELECT 付与の有無（列単体REVOKEが効かない＝全体付与あり、を確認）
SELECT grantee, privilege_type FROM information_schema.role_table_grants
WHERE table_schema='public' AND table_name='companies'
  AND grantee IN ('authenticated','anon') AND privilege_type='SELECT';
```

```sql
-- (3) 機微列が authenticated から見えているか（=穴の確認。適用前は4列が返るはず）
SELECT column_name FROM information_schema.role_column_grants
WHERE table_schema='public' AND table_name='companies'
  AND grantee='authenticated' AND privilege_type='SELECT'
  AND column_name IN ('company_setting_password_hash','auth_user_id',
                      'stripe_customer_id','stripe_subscription_id');
```

**判定**: (3) が `company_setting_password_hash` 等を返す＝穴あり（適用が必要）。(2) で authenticated/anon が全体 SELECT を持つことを確認。

---

## ② 適用SQL本体（1トランザクション）

```sql
BEGIN;

-- 1) anon の全体 SELECT を剥奪（公開フローは service-role API 経由＝anon直読み不要）。anon へ列GRANTは戻さない。
REVOKE SELECT ON public.companies FROM anon;

-- 2) authenticated の全体 SELECT を剥奪（列制限を効かせる前提）。
REVOKE SELECT ON public.companies FROM authenticated;

-- 3) authenticated にブラウザ/cookie-session で実際に読む「安全16列のみ」を列GRANTで戻す。
GRANT SELECT (
  id, name, email, phone, contact_person, contact_email, interview_slug, plan,
  monthly_interview_count, monthly_interview_limit,
  next_month_interview_limit, next_month_limit_effective_month,
  is_suspended, onboarding_completed, price_per_interview, created_at
) ON public.companies TO authenticated;

COMMIT;
```

> 機微列（`company_setting_password_hash` / `auth_user_id` / `stripe_customer_id` / `stripe_subscription_id`）と、
> ブラウザ直読みされない内部列（`culture_analysis_enabled` / `auto_upgrade_enabled` / `billing_cycle_start` 等）は GRANT しない。

---

## ③ 適用後チェック（READ-ONLY）

```sql
-- (A) authenticated の SELECT 可能列が「上記16列のみ」であること
SELECT column_name FROM information_schema.role_column_grants
WHERE table_schema='public' AND table_name='companies'
  AND grantee='authenticated' AND privilege_type='SELECT'
ORDER BY column_name;
-- 期待: 16列のみ。company_setting_password_hash / auth_user_id / stripe_* を含まない。
```

```sql
-- (B) anon が companies に SELECT 権を持たないこと（0行）
SELECT column_name FROM information_schema.role_column_grants
WHERE table_schema='public' AND table_name='companies'
  AND grantee='anon' AND privilege_type='SELECT';
```

```sql
-- (C) 機微列が authenticated から消えたこと（0行＝穴が塞がった）
SELECT column_name FROM information_schema.role_column_grants
WHERE table_schema='public' AND table_name='companies'
  AND grantee='authenticated' AND privilege_type='SELECT'
  AND column_name IN ('company_setting_password_hash','auth_user_id',
                      'stripe_customer_id','stripe_subscription_id');
```

---

## ④ rollback SQL（壊れた / 中止する場合）

```sql
BEGIN;
  REVOKE SELECT ON public.companies FROM authenticated; -- 列GRANTを一旦剥がす
  GRANT  SELECT ON public.companies TO authenticated;    -- 全体SELECT復元
  GRANT  SELECT ON public.companies TO anon;             -- anon 全体SELECT復元
COMMIT;
```

> ロールバックは「列ホワイトリスト前（全列可）」へ戻すだけ。**穴も復活**する点に注意。
> 不足列が原因の失敗なら、rollback せず該当列を `GRANT SELECT (...)` に追記して再適用でもよい。

---

## ⑤ 適用後 E2E 確認手順（アプリ経由）

各画面で「表示/操作が成功」かつ「hash が漏れない」を確認する。

| # | 対象 | 手順 | 期待 |
|---|------|------|------|
| 1 | **client dashboard** | 企業ログイン → ダッシュボード表示 | 当月件数・上限が表示（`monthly_interview_count/limit`）。エラーなし |
| 2 | **client settings** | 設定画面表示 → 会社名/担当者/連絡先/電話/メール 表示 → 1項目変更して保存 | 表示OK（`name/contact_*/phone/email/interview_slug`）。保存成功（非機微列UPDATE） |
| 3 | **client billing** | 請求履歴画面表示 | 当月見込み（`limit`×`price_per_interview`）表示OK |
| 4 | **client plan GET** | プラン画面表示 | 上限・翌月予約・単価が表示（hash不要の安全列）OK |
| 5 | **client plan PATCH** | 翌月上限を変更 → 設定変更用PW入力 → 保存 | 設定PW検証が通り保存成功（hash読みは service-role） |
| 6 | **setting-password GET** | 設定PWの「設定済み/未設定」表示 | `configured` 正常返却（service-role 経由） |
| 7 | **setting-password POST** | 未設定状態で初期設定 | 設定成功（既設定なら CONFLICT） |
| 8 | **setting-password PATCH** | 現PW入力 → 新PWへ変更 | 変更成功（現PW誤りなら FORBIDDEN） |
| 9 | **suspension request** | 一時停止申請 → 設定PW入力 | 申請成功（hash検証 service-role 経由） |
| 10 | **suspension emergency** | 緊急停止 → 設定PW入力 | 受理（hash検証 service-role 経由） |
| 11 | **admin company detail** | 運営ログイン → 企業詳細表示・編集 | 表示/編集OK（admin は service-role API 経由＝非影響） |
| 12 | **負の確認（穴塞ぎ）** | 企業ログインの anon/authenticated key で PostgREST 直叩き：`/rest/v1/companies?select=company_setting_password_hash&id=eq.<自社id>` | **permission denied for column**（hash 取得不可）になること |

- **12 が「permission denied」** になれば P1 #1 の穴が塞がったことの直接証明。
- **1〜11 が全て成功** すれば回帰なし。

---

## ⑥ Supabase SQL Editor 実行順

1. **Preview プロジェクト**で `①(1)(2)(3)` を実行 → 穴と全体付与を確認。
2. `②` 適用SQL（BEGIN…COMMIT）を実行。
3. `③(A)(B)(C)` を実行 → 16列のみ / anon 0行 / 機微列0行 を確認。
4. `⑤` の E2E 1〜12 を Preview で通す。**12 で permission denied、1〜11 成功** を確認。
5. 問題があれば `④` rollback → 原因調査（多くは「安全列に必要列が欠けている」→ 不足列を GRANT 追記して再適用）。
6. Preview で全て緑になったら、**本番プロジェクトで 1→2→3→4 を同手順で繰り返す**。

> **Preview で全工程（①〜⑤）を通してから本番に同手順を適用すること。**
> いきなり本番へ適用しない。本番適用も承認後に行う。

---

## 補足

- `company_select_own` の RLS（行制限）はそのまま。**列権限だけを締める**（自社行は読めるが機微列は読めない）。
- service_role は本権限体系（および RLS）を bypass するため、service-role 経由の admin / 公開フロー / 移行済み client API には影響しない。
- 関連ファイル: `supabase/rls/phase2h_companies_select_column_whitelist.sql`（適用SQL本体・同内容）。
