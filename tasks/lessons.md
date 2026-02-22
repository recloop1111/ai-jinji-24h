# Lessons Learned
- Supabase `.or()` にユーザー入力を直接渡すとSQLインジェクションリスクがある → sanitizeSearch() を使う
- UUID/日付のバリデーションを省略するとDBエラーが漏れる → 共通バリデーション関数を使う
- console.log は本番に残さない → 最初から入れない
