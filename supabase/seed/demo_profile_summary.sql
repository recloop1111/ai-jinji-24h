-- ============================================================================
-- demo_profile_summary.sql
--
-- 用途: デモ企業「テスト株式会社」(company_id = 7a58cc1b-9f81-4da5-ae2c-fd3abea05c33,
--       companies.is_demo = true) の既存 interview_results 7件の detail_json に、
--       profile_summary（人物概要 / 経歴要約 / 面接官向けメモ）をデモデータとして追加する SEED。
--
-- 【重要】
--   * これは MIGRATION ではない。supabase/migrations には置かない（本番自動適用しない）。
--   * 手動実行専用（運用者が Supabase SQL Editor / psql で意図的に流す）。
--   * デモ企業（is_demo = true）の applicants に紐づく interview_results のみを対象とする。
--     通常企業・本番企業・E2E用「テスト登録株式会社」(is_demo = false) には一切影響しない。
--   * 各 UPDATE は interview_results.id を直接指定し、かつ「デモ企業の応募者」であることを
--     サブクエリで二重に保証する。再実行しても同じ profile_summary を再マージするだけ（冪等に近い）。
--   * detail_json は jsonb のため DBスキーマ変更は不要。
--   * `detail_json || '{...}'::jsonb` の **マージ**で追加するため、既存の recommendation_rank は保持される。
--   * 触らないもの: evaluation_axes / total_score / summary_text / feedback_text /
--     strengths / improvement_points、および applicants / interviews / companies。
--
--   profile_summary スキーマ（client/admin 概要タブが優先表示・無ければ既存DBで代替）:
--     { "profile_summary": { "persona": "...", "career": "...", "interviewer_notes": "..." } }
--   内容は既存 summary_text / feedback_text / strengths / improvement_points /
--   applicants.work_history・industry_experience・education と矛盾しないよう設計。
-- ============================================================================

BEGIN;

-- 1) 高橋 美咲 / A / 88 / バックエンド開発7年(Java,Python)・経験者・大学院卒
UPDATE interview_results
SET detail_json = COALESCE(detail_json, '{}'::jsonb) || '{
  "profile_summary": {
    "persona": "チームに好影響を与えるリーダー型。コミュニケーション力と挑戦意欲が際立ち、周囲を巻き込みながら成果を出すタイプ。",
    "career": "大学院卒業後、バックエンド開発（Java・Python）に7年従事。経験豊富なエンジニアとして即戦力が期待できる。",
    "interviewer_notes": "即戦力として強く推奨。細部への注意力をどう補完するか（レビュー体制や役割分担）を確認するとよい。"
  }
}'::jsonb
WHERE id = 'ec36131b-16c7-4219-b103-0b4803502f10'
  AND applicant_id IN (SELECT a.id FROM applicants a JOIN companies c ON c.id = a.company_id WHERE c.is_demo = true);

-- 2) 佐藤 花子 / B / 82 / 職歴未登録・未経験・大学卒
UPDATE interview_results
SET detail_json = COALESCE(detail_json, '{}'::jsonb) || '{
  "profile_summary": {
    "persona": "丁寧で正確、責任感が強く安定して成果を出すタイプ。主体性の発揮が今後の成長の鍵。",
    "career": "大学卒業。実務は未経験だが、正確性・責任感・継続力を強みとする。",
    "interviewer_notes": "安定型。自発的な提案や変化への対応をどこまで期待できるか、具体的なエピソードを確認したい。"
  }
}'::jsonb
WHERE id = '8a27056d-5dc4-44b8-be29-7fb83390c914'
  AND applicant_id IN (SELECT a.id FROM applicants a JOIN companies c ON c.id = a.company_id WHERE c.is_demo = true);

-- 3) 山本 大輝 / B / 78 / 居酒屋ホール2年・経験者・高校卒
UPDATE interview_results
SET detail_json = COALESCE(detail_json, '{}'::jsonb) || '{
  "profile_summary": {
    "persona": "数値管理と現場改善に強い実行力重視タイプ。即戦力だが、キャリアビジョンの明確化が課題。",
    "career": "高校卒業後、飲食（居酒屋ホール）で2年勤務。店長経験を通じて数値管理・現場改善・スタッフのマネジメントを経験。",
    "interviewer_notes": "即戦力として期待。3〜5年後のキャリア像と、チームワークの具体的エピソードを確認すると判断精度が上がる。"
  }
}'::jsonb
WHERE id = '5c140400-0f0c-410d-8827-892dfca7ce9a'
  AND applicant_id IN (SELECT a.id FROM applicants a JOIN companies c ON c.id = a.company_id WHERE c.is_demo = true);

-- 4) じじ じじ / C / 73 / 職歴未登録・経験者・中学卒（★判断材料不足デモと整合）
UPDATE interview_results
SET detail_json = COALESCE(detail_json, '{}'::jsonb) || '{
  "profile_summary": {
    "persona": "面接での発言が限られ、人物像を十分に判断できる材料が得られなかった。基本的な受け答えは可能。",
    "career": "中学校卒業。職務経歴の登録がなく、経験の詳細は面接からは把握できなかった。",
    "interviewer_notes": "判断材料が不足。次回面接で職務経歴と具体的な行動エピソードを掘り下げる必要がある。"
  }
}'::jsonb
WHERE id = 'e9e390a4-7c4f-4528-8c19-70ce6a8961f4'
  AND applicant_id IN (SELECT a.id FROM applicants a JOIN companies c ON c.id = a.company_id WHERE c.is_demo = true);

-- 5) 田中 太郎 / C / 71 / 職歴未登録・未経験・大学卒
UPDATE interview_results
SET detail_json = COALESCE(detail_json, '{}'::jsonb) || '{
  "profile_summary": {
    "persona": "分析力とリスク管理に強みを持つ慎重型。積極性と柔軟性の向上が課題で、育成次第で戦力化が見込める。",
    "career": "大学卒業。実務は未経験だが、分析・リスク管理の素養がうかがえる。",
    "interviewer_notes": "育成前提で検討。積極性・コミュニケーションの伸びしろを、配属環境とあわせて見極めたい。"
  }
}'::jsonb
WHERE id = '18524b07-10e3-48f2-ad83-7ae1830f4d1c'
  AND applicant_id IN (SELECT a.id FROM applicants a JOIN companies c ON c.id = a.company_id WHERE c.is_demo = true);

-- 6) テスト 太郎 / C / 70 / 職歴未登録・経験者・大学卒（情報少）
UPDATE interview_results
SET detail_json = COALESCE(detail_json, '{}'::jsonb) || '{
  "profile_summary": {
    "persona": "基本的なコミュニケーションは取れるが、面接全体での情報が限られ、評価は平均的にとどまる。",
    "career": "大学卒業。職務経歴の登録がなく、経験の詳細は面接からは把握しきれなかった。",
    "interviewer_notes": "平均的。具体的な実績・志望動機を次回で確認し、評価材料を補う必要がある。"
  }
}'::jsonb
WHERE id = 'f4fab1bd-66a3-4c76-8b53-38d405aa7c9b'
  AND applicant_id IN (SELECT a.id FROM applicants a JOIN companies c ON c.id = a.company_id WHERE c.is_demo = true);

-- 7) 伊藤 健太 / C / 65 / 飲食店接客3年・未経験・専門卒
UPDATE interview_results
SET detail_json = COALESCE(detail_json, '{}'::jsonb) || '{
  "profile_summary": {
    "persona": "ストレス耐性が高く安定して業務を遂行する忍耐型。主体性とチーム内での発信力に課題。",
    "career": "専門学校卒業後、飲食店の接客を3年経験。安定した業務遂行を強みとする。",
    "interviewer_notes": "サポート体制があれば戦力化が見込める。自発的な提案・発信をどう引き出すか、配属とのフィットを確認したい。"
  }
}'::jsonb
WHERE id = '6c478dd1-165b-41db-8494-8cdf0917ac49'
  AND applicant_id IN (SELECT a.id FROM applicants a JOIN companies c ON c.id = a.company_id WHERE c.is_demo = true);

-- 確認用（任意・実行後にコメントアウトを外して目視）:
-- SELECT ir.id, ir.detail_json->>'recommendation_rank' AS rank,
--        ir.detail_json->'profile_summary'->>'persona' AS persona
--   FROM interview_results ir
--   JOIN applicants a ON a.id = ir.applicant_id
--   JOIN companies c ON c.id = a.company_id
--  WHERE c.is_demo = true;

COMMIT;
