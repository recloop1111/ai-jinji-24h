# AIMEN24 — Pre-Redesign Human QA Master Checklist

大規模UIリデザイン開始前に、Production Preview（PR #79）で人間が確認するチェックリスト。
1操作ずつ「どこを押して・何を見るか」を記載。Realtime Video/API は対象外。

前提:
- Preview URL（PR #79 の Vercel Preview）でログイン。
- テスト用に OWNER / ADMIN / RECRUITER / VIEWER の各企業アカウントを1つずつ用意（同一企業）。
- 別企業アカウントを1つ用意（テナント分離確認用）。

> **手動 SQL の Production 適用状況（2026-09 inspection で確定）**
> - `supabase/rls/e5_2_role_aware_write.sql` — **Production 適用済み**（applicants/internal_memos/jobs/job_questions の `*_rbac_write_*` policy が存在）。再適用不要。
> - `supabase/rls/phase_e_admin_company_resources.sql` — **Production 適用済み**（`admin_all_jobs/job_questions/common_questions` が存在・運営admin 2件は company_id=null）。再適用不要。
> - `supabase/rls/e5_4b_jobs_questions_write_lockdown.sql` — **Production 未適用（意図どおり）＝post-deploy migration**。現行 Production(main) は PR #79 の jobs/questions server route 化が未 deploy で browser 直書きを使うため、**今 適用すると企業ユーザーの求人・質問編集を破壊する**。適用は「PR #79（最終完成版）が Production へ deploy され、jobs/questions が server route 経由になったのを確認した直後」。
> - B-6.2 の請求先名是正 SQL（`docs` 外・前フェーズ報告参照。「テスト株式会社 請求先」表示時のみ）。
> QA はアプリ層（RBAC/監査）で担保。VIEWER の browser 直書き迂回は既に e5_2（適用済み）で DB 遮断。e5_4b は server route deploy 後に jobs/questions の直書きを admin のみへ締める追加防御。

---

## A. メンバー管理（設定 > メンバー管理／OWNER・ADMIN のみタブ表示）

1. OWNER でログイン → 設定 → 「メンバー管理」タブが表示される。
2. 「招待」→ メール＋権限（管理者/採用担当/閲覧者）を指定 → 招待リンクが表示される（メール送信はしない）。リンクをコピー。
3. 別ブラウザ（シークレット）で招待リンクを開く → 氏名＋パスワード設定 → 参加完了 → メンバー一覧に active で表示。
4. 同じ招待リンクを再度開く → 使用済み/無効で拒否される（replay 不可）。
5. 一覧で対象メンバーの「権限」を 採用担当→閲覧者 に変更 → 確認モーダル → 成功トースト → 表示が更新。
6. 「利用停止」→ 確認 → status が「停止中」。停止したユーザーでログイン → client 画面に入れない（403 相当）。
7. 「再有効化」→ status「有効」に戻る。
8. 「メンバーから削除」→ 確認 → 一覧から除外（または削除済み表示）。削除済みユーザーはログイン不可。
9. OWNER 行・自分自身の行に「危険操作（権限変更/停止/削除）」ボタンが出ない（owner保護・self保護）。
10. RECRUITER / VIEWER でログイン → 設定に「メンバー管理」タブが出ない。

## B. 権限制御（RBAC）

11. VIEWER でログイン → 応募者一覧は閲覧できる。履歴書PDF/総合レポートPDF/CSVのDLボタンが無い or 実行不可。
12. VIEWER → 求人管理・質問設定で新規作成/編集/削除の操作ができない（ボタン非表示 or 実行不可）。
13. RECRUITER → 求人作成/編集/削除・質問保存ができる。請求（billing）タブは出ない。メンバー管理タブも出ない。
14. ADMIN → 請求閲覧・請求書DL・操作ログ・ログイン履歴・メンバー管理が可能。billing の「支払変更」等 OWNER専用操作は不可。
15. OWNER → 全操作可能。

## C. 操作ログ（設定 > 操作ログ／OWNER・ADMIN）

各操作の直後に「操作ログ」タブを開き、日時・操作者・権限・操作内容が1行増えることを確認:
16. 応募者の履歴書PDF DL → 「応募者「〇〇」の履歴書PDFをダウンロード」。
17. 応募者CSV DL → 「応募者CSVをダウンロード（N件）」。
18. 選考結果を変更 → 「選考結果を〜から〜に変更」。選考メモ更新 → 「選考メモを更新」（本文は出ない）。
19. メンバー権限変更/停止/再有効化/削除 → 対応する文が記録。
20. 招待リンク発行/再発行/取消 → 対応する文が記録。
21. 求人 作成/更新/削除 → 「求人を作成/更新/削除」。
22. 面接質問 保存（クロージング・評価・アイスブレイク）→ 「面接質問を更新」。
23. 企業情報（会社名/連絡先）保存 → 「企業情報を変更」（値は記録されない）。
24. 請求書PDF DL → 「YYYY年M月分の請求書PDFをダウンロード」（金額は出ない）。
25. ログには氏名以外のPII（メール本文/電話/面接本文/金額）が出ないことを確認。

## D. ログイン履歴（設定 > セキュリティ > ログイン履歴／OWNER・ADMIN）

26. OWNER/ADMIN で設定 → セキュリティ → 下部「ログイン履歴」に、日時・ユーザー・権限・結果・IP が表示。
27. わざと誤ったパスワードでログイン失敗 → 履歴に「失敗（認証失敗）」が増える。
28. 正しくログイン → 「成功」が増える。
29. 「次へ/前へ」でページ送りできる（21件以上ある場合）。
30. RECRUITER/VIEWER には「ログイン履歴」セクションが出ない。
31. 他社メンバーのログインが自社の履歴に混ざらない（別企業アカウントで確認）。

## E. 請求（billing）

32. OWNER/ADMIN → 「請求」タブが見える。RECRUITER/VIEWER → 見えない・URL直打ちも 403。
33. 請求履歴があれば請求書PDFを DL → AIMEN24 Navy デザイン・1ページ・会社名「〇〇 御中」・金額一致。
34. 请求書 DL 後、操作ログに記録される（C-24）。
35. （運営）月次請求バッチ: Vercel Cron 設定後、毎月1日に自動生成される想定。手動確認は
    `POST /api/internal/batch/monthly-billing?dryRun=1`（Authorization: Bearer INTERNAL_BATCH_SECRET）で
    dry-run し、demo 企業が除外・0件企業が作られない・既存は skip_existing を確認。

## F. jobs / questions / settings の server mutation

36. 求人作成 → 一覧に「下書き（非公開）」で追加。編集 → 反映。「募集再開/停止」トグル → バッジ変化。削除 → 消える。
37. 質問設定で 評価質問/アイスブレイク/クロージング を保存 → 再読込しても保持。上限超過はエラー表示。
38. 設定 > 一般 で 会社名/担当者/連絡先メール/電話 を保存 → 成功トースト → 再読込しても保持。
39. （テナント分離）別企業の求人ID/質問を自社セッションから操作できない（devtools で他社 job_id を投げても 404）。
40. （RLS 適用時）VIEWER のブラウザ devtools から jobs/common_questions/job_questions への直 insert/update/delete が
    RLS で拒否される（server route は既に 403）。

## G. 主要応募者フロー（回帰）

41. 応募者一覧 → 詳細 → 各タブ（基本情報/EBCA評価/会話ログ 等）が表示され、未接続領域はダミーでなく空状態表示。
42. 履歴書PDF / 総合レポートPDF が生成でき、文字化けなし。
43. 選考結果・選考メモの保存が永続化（再読込で保持）。
44. デモ企業（テスト株式会社）: 利用状況は表示されるが、運営売上/確定請求一覧には含まれない。

---

### 完了後
- 上記で重大な不具合が無ければ、必要な手動 SQL（RLS lockdown / B-6.2 是正）を適用のうえ、
  大規模UIリデザインへ進む。
