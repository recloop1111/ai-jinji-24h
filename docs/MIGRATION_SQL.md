# 応募者フロー Supabase接続用 SQL

## 1. applicants テーブルのカラム追加

```sql
-- age カラムを追加（form/page.tsxで使用）
ALTER TABLE applicants ADD COLUMN IF NOT EXISTS age INTEGER;

-- job_id カラムを追加（job_type_idではなくjob_idを使用）
ALTER TABLE applicants ADD COLUMN IF NOT EXISTS job_id UUID REFERENCES jobs(id);

-- 既存のjob_type_idカラムがある場合は、job_idに移行するか、両方保持

-- status カラムを追加（面接の進行状況: 準備中・完了・途中離脱）
ALTER TABLE applicants ADD COLUMN IF NOT EXISTS status TEXT DEFAULT '準備中'
  CHECK (status IN ('準備中', '完了', '途中離脱'));

-- result カラムを追加（選考結果: 未対応・検討中・二次通過・不採用）
-- selection_status は既存だが、result として新規追加（または selection_status を result にリネーム）
ALTER TABLE applicants ADD COLUMN IF NOT EXISTS result TEXT DEFAULT '未対応'
  CHECK (result IN ('未対応', '検討中', '二次通過', '不採用'));

-- selection_status カラムを追加（運営管理画面用: 未対応・検討中・二次選考・不採用・内定）
ALTER TABLE applicants ADD COLUMN IF NOT EXISTS selection_status TEXT DEFAULT 'pending'
  CHECK (selection_status IN ('pending', 'considering', 'second_pass', 'rejected', 'hired'));

-- selection_memo カラムを追加（運営管理画面用: 選考メモ）
ALTER TABLE applicants ADD COLUMN IF NOT EXISTS selection_memo TEXT;
```

## 2. interviews テーブルのカラム追加

```sql
-- company_id カラムを追加
ALTER TABLE interviews ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id);

-- job_id カラムを追加
ALTER TABLE interviews ADD COLUMN IF NOT EXISTS job_id UUID REFERENCES jobs(id);

-- status カラムを追加（in_progress, completed）
ALTER TABLE interviews ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'in_progress'
  CHECK (status IN ('in_progress', 'completed', 'cancelled'));

-- total_questions カラムを追加（全質問数）
ALTER TABLE interviews ADD COLUMN IF NOT EXISTS total_questions INTEGER;

-- answered_questions カラムを追加（回答済み質問数）
ALTER TABLE interviews ADD COLUMN IF NOT EXISTS answered_questions INTEGER;

-- end_reason カラムのCHECK制約を更新（既存のend_reasonカラムの値に追加）
-- 注意: 既存のCHECK制約を削除してから再作成する必要がある場合があります
ALTER TABLE interviews DROP CONSTRAINT IF EXISTS interviews_end_reason_check;
ALTER TABLE interviews ADD CONSTRAINT interviews_end_reason_check 
  CHECK (end_reason IN (
    'completed', 'user_ended', 'timeout', 'silence',
    'inappropriate', 'disconnected', 'browser_closed',
    '全質問完了', '時間切れ', '自主終了'
  ));
```

## 3. interview_results テーブルの作成

```sql
CREATE TABLE IF NOT EXISTS interview_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  interview_id UUID NOT NULL REFERENCES interviews(id) UNIQUE,
  total_score INTEGER,
  feedback_text TEXT,
  personality_type TEXT,
  strengths JSONB,
  evaluation_axes JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_interview_results_interview_id ON interview_results(interview_id);
```

## 4. 社風分析テーブルの作成

```sql
-- companies テーブルに culture_analysis_enabled カラムを追加
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS culture_analysis_enabled BOOLEAN DEFAULT false;

-- culture_surveys テーブル（社風アンケート管理）
CREATE TABLE IF NOT EXISTS public.culture_surveys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  department TEXT NOT NULL,
  employment_type TEXT NOT NULL,
  survey_url_slug TEXT NOT NULL UNIQUE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_culture_surveys_company_id ON public.culture_surveys(company_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_culture_surveys_slug ON public.culture_surveys(survey_url_slug);

-- culture_survey_responses テーブル（社員のアンケート回答）
CREATE TABLE IF NOT EXISTS public.culture_survey_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  survey_id UUID NOT NULL REFERENCES public.culture_surveys(id) ON DELETE CASCADE,
  openness_score NUMERIC(4,2) NOT NULL CHECK (openness_score BETWEEN 0 AND 10),
  conscientiousness_score NUMERIC(4,2) NOT NULL CHECK (conscientiousness_score BETWEEN 0 AND 10),
  extraversion_score NUMERIC(4,2) NOT NULL CHECK (extraversion_score BETWEEN 0 AND 10),
  agreeableness_score NUMERIC(4,2) NOT NULL CHECK (agreeableness_score BETWEEN 0 AND 10),
  neuroticism_score NUMERIC(4,2) NOT NULL CHECK (neuroticism_score BETWEEN 0 AND 10),
  free_text TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_culture_survey_responses_survey_id ON public.culture_survey_responses(survey_id);

-- culture_profiles テーブル（部署ごとの集約プロファイル）
CREATE TABLE IF NOT EXISTS public.culture_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  department TEXT NOT NULL,
  employment_type TEXT NOT NULL,
  avg_openness NUMERIC(4,2) NOT NULL,
  avg_conscientiousness NUMERIC(4,2) NOT NULL,
  avg_extraversion NUMERIC(4,2) NOT NULL,
  avg_agreeableness NUMERIC(4,2) NOT NULL,
  avg_neuroticism NUMERIC(4,2) NOT NULL,
  response_count INTEGER NOT NULL DEFAULT 0,
  generated_description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_culture_profiles_company_id ON public.culture_profiles(company_id);

-- RLSポリシー
ALTER TABLE public.culture_surveys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.culture_survey_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.culture_profiles ENABLE ROW LEVEL SECURITY;

-- culture_surveys: 全ユーザー読み取り可、認証済みユーザーINSERT/UPDATE可
CREATE POLICY "culture_surveys_select" ON public.culture_surveys FOR SELECT USING (true);
CREATE POLICY "culture_surveys_insert" ON public.culture_surveys FOR INSERT WITH CHECK (true);
CREATE POLICY "culture_surveys_update" ON public.culture_surveys FOR UPDATE USING (true);

-- culture_survey_responses: 全ユーザー読み取り可、全ユーザーINSERT可（アンケート回答用）
CREATE POLICY "culture_survey_responses_select" ON public.culture_survey_responses FOR SELECT USING (true);
CREATE POLICY "culture_survey_responses_insert" ON public.culture_survey_responses FOR INSERT WITH CHECK (true);

-- culture_profiles: 全ユーザー読み取り可、認証済みユーザーINSERT/UPDATE可
CREATE POLICY "culture_profiles_select" ON public.culture_profiles FOR SELECT USING (true);
CREATE POLICY "culture_profiles_insert" ON public.culture_profiles FOR INSERT WITH CHECK (true);
CREATE POLICY "culture_profiles_update" ON public.culture_profiles FOR UPDATE USING (true);
```

## 5. 社風分析デモデータ挿入（テスト株式会社）

```sql
-- テスト株式会社の culture_analysis_enabled を ON
UPDATE public.companies SET culture_analysis_enabled = true WHERE name = 'テスト株式会社';

-- 営業部・正社員のアンケートを作成
INSERT INTO public.culture_surveys (company_id, department, employment_type, survey_url_slug)
SELECT id, '営業部', '正社員', 'test-company-sales-abc123'
FROM public.companies WHERE name = 'テスト株式会社';

-- ダミー回答6件を挿入
INSERT INTO public.culture_survey_responses (survey_id, openness_score, conscientiousness_score, extraversion_score, agreeableness_score, neuroticism_score, free_text)
SELECT s.id, 6.5, 7.0, 5.5, 6.8, 4.2, '活気があって風通しが良い' FROM public.culture_surveys s WHERE s.survey_url_slug = 'test-company-sales-abc123'
UNION ALL SELECT s.id, 7.2, 6.5, 6.0, 7.0, 3.8, 'チームワークを大切にする' FROM public.culture_surveys s WHERE s.survey_url_slug = 'test-company-sales-abc123'
UNION ALL SELECT s.id, 5.8, 7.5, 5.0, 6.2, 4.5, '真面目で落ち着いた雰囲気' FROM public.culture_surveys s WHERE s.survey_url_slug = 'test-company-sales-abc123'
UNION ALL SELECT s.id, 6.0, 6.8, 6.5, 7.2, 3.5, '自由な発想を歓迎する' FROM public.culture_surveys s WHERE s.survey_url_slug = 'test-company-sales-abc123'
UNION ALL SELECT s.id, 7.0, 7.2, 5.8, 6.5, 4.0, '成長意欲が高い' FROM public.culture_surveys s WHERE s.survey_url_slug = 'test-company-sales-abc123'
UNION ALL SELECT s.id, 6.3, 6.0, 7.0, 6.0, 4.8, '明るくオープンな職場' FROM public.culture_surveys s WHERE s.survey_url_slug = 'test-company-sales-abc123';

-- 社風プロファイルを作成（6件の平均値）
INSERT INTO public.culture_profiles (company_id, department, employment_type, avg_openness, avg_conscientiousness, avg_extraversion, avg_agreeableness, avg_neuroticism, response_count, generated_description)
SELECT c.id, '営業部', '正社員', 6.5, 6.8, 6.0, 6.6, 4.1, 6, '営業部は外向性と協調性がバランスよく高く、チームワークを重視しながらも新しいアイデアに対してオープンな社風です。情緒安定性も高く、プレッシャーの中でも冷静に業務を遂行できる環境が整っています。'
FROM public.companies c WHERE c.name = 'テスト株式会社';
```

## 6. interview_resultsデモデータ挿入（AI評価・カルチャーフィット）

```sql
-- interview_resultsにbig_five_scores, culture_fit_detailカラムを追加（存在しない場合）
ALTER TABLE public.interview_results ADD COLUMN IF NOT EXISTS big_five_scores JSONB;
ALTER TABLE public.interview_results ADD COLUMN IF NOT EXISTS culture_fit_detail JSONB;

-- 完了済み応募者のinterview_resultsにスコアと推薦度を設定
-- ※ recommendation_rank は detail_json 内に格納
UPDATE public.interview_results ir
SET 
  total_score = CASE 
    WHEN a.last_name = '山本' THEN 78
    WHEN a.last_name = '佐藤' THEN 82
    WHEN a.last_name = '田中' THEN 71
    WHEN a.last_name = '高橋' THEN 88
    WHEN a.last_name = '伊藤' THEN 65
    WHEN a.last_name = 'じじ' AND a.first_name = 'じじ' AND a.status = '完了' THEN 73
    ELSE 70
  END,
  detail_json = COALESCE(ir.detail_json, '{}'::jsonb) || CASE 
    WHEN a.last_name = '山本' THEN '{"recommendation_rank": "B"}'::jsonb
    WHEN a.last_name = '佐藤' THEN '{"recommendation_rank": "B"}'::jsonb
    WHEN a.last_name = '田中' THEN '{"recommendation_rank": "C"}'::jsonb
    WHEN a.last_name = '高橋' THEN '{"recommendation_rank": "A"}'::jsonb
    WHEN a.last_name = '伊藤' THEN '{"recommendation_rank": "C"}'::jsonb
    WHEN a.last_name = 'じじ' AND a.first_name = 'じじ' AND a.status = '完了' THEN '{"recommendation_rank": "C"}'::jsonb
    ELSE '{"recommendation_rank": "C"}'::jsonb
  END,
  culture_fit_score = CASE 
    WHEN a.last_name = '山本' THEN 85
    WHEN a.last_name = '佐藤' THEN 72
    WHEN a.last_name = '田中' THEN 45
    WHEN a.last_name = '高橋' THEN 91
    WHEN a.last_name = '伊藤' THEN 58
    WHEN a.last_name = 'じじ' AND a.first_name = 'じじ' AND a.status = '完了' THEN 67
    ELSE NULL
  END
FROM public.applicants a
WHERE ir.applicant_id = a.id AND a.status = '完了';

-- 完了済み応募者のBIG FIVEスコアとカルチャーフィット詳細を設定
UPDATE public.interview_results ir
SET 
  big_five_scores = CASE 
    WHEN a.last_name = '山本' THEN '{"openness": 7.2, "conscientiousness": 6.8, "extraversion": 5.5, "agreeableness": 7.0, "neuroticism": 6.0}'::jsonb
    WHEN a.last_name = '佐藤' THEN '{"openness": 6.0, "conscientiousness": 7.5, "extraversion": 6.2, "agreeableness": 6.8, "neuroticism": 5.5}'::jsonb
    WHEN a.last_name = '田中' THEN '{"openness": 5.0, "conscientiousness": 5.5, "extraversion": 4.8, "agreeableness": 5.2, "neuroticism": 6.5}'::jsonb
    WHEN a.last_name = '高橋' THEN '{"openness": 8.0, "conscientiousness": 7.8, "extraversion": 7.5, "agreeableness": 7.2, "neuroticism": 3.5}'::jsonb
    WHEN a.last_name = '伊藤' THEN '{"openness": 6.5, "conscientiousness": 6.0, "extraversion": 5.8, "agreeableness": 5.5, "neuroticism": 5.0}'::jsonb
    ELSE NULL
  END,
  culture_fit_detail = CASE 
    WHEN a.last_name = '山本' THEN '{"summary": "応募者は企業の社風と高い親和性を示しています。特に協調性と情緒安定性が企業平均を上回っており、チームワークを重視する営業部の環境に適応しやすいと考えられます。"}'::jsonb
    WHEN a.last_name = '佐藤' THEN '{"summary": "誠実性が高く、計画的に業務を遂行する姿勢が企業文化と合致しています。外向性はやや平均的ですが、堅実な働きぶりが期待できます。"}'::jsonb
    WHEN a.last_name = '田中' THEN '{"summary": "全体的に企業平均をやや下回る傾向があり、特に開放性と外向性の面で社風との乖離が見られます。慎重な性格が裏目に出る可能性があります。"}'::jsonb
    WHEN a.last_name = '高橋' THEN '{"summary": "すべての因子で企業平均を上回っており、非常に高いカルチャーフィットを示しています。リーダーシップと協調性を兼ね備え、組織に好影響を与える人材です。"}'::jsonb
    WHEN a.last_name = '伊藤' THEN '{"summary": "中程度のマッチングです。協調性がやや低めですが、情緒安定性は十分で、ストレス耐性のある環境では力を発揮できる可能性があります。"}'::jsonb
    ELSE NULL
  END
FROM public.applicants a
WHERE ir.applicant_id = a.id AND a.status = '完了';
```
