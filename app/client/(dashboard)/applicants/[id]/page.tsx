'use client'

import { useState, useRef, useEffect } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { ChevronLeft as ChevronLeftIcon, ChevronDown as ChevronDownIcon, Play as PlayIcon, Download, Mail, LinkIcon, Copy, Check } from 'lucide-react'
import { RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, Legend, ResponsiveContainer } from 'recharts'

// TODO: Phase 4 実データに差替え
// TODO: Phase 4 - 面接完了時にステータスを自動で「未対応」に設定
const DUMMY = {
  name: '山田 太郎',
  email: 'yamada@example.com',
  phone: '090-1234-5678',
  furigana: 'やまだ たろう',
  jobType: '店舗マネージャー',
  appliedAt: '2025-02-14 10:00',
  status: 'second_pass',
  memo: '',
  // 概要タブ: AIサマリー
  aiSummary: {
    profile: '飲食業界で5年の店長経験を持つ、数値管理と現場改善に強い実行力重視の人材。',
    career:
      '大学卒業後、大手飲食チェーンに入社し、入社2年目で副店長、3年目で店長に昇進。担当店舗では月間売上を前年比115%に改善し、人手不足の状況下で3ヶ月間に5名の新規採用を実現した。8名のスタッフのシフト管理・教育にも携わり、現場マネジメントの実務経験が豊富。',
    impression:
      '質問の意図を正確に汲み取り、具体的な数値を交えて簡潔に回答する傾向がある。特に過去の実績に関する質問では、課題→施策→結果の構造で論理的に語れており、説得力が高い。一方で、想定外の質問にはやや回答に時間がかかる場面が見られた。',
    strengthsAndConcerns:
      '最大の強みは、現場で培った問題解決力と数値に基づく説明力。即戦力としてマネジメント業務への適性が高い。懸念点は、3〜5年後のキャリアビジョンが漠然としており、長期定着への確信が持ちにくい点。また、チームワークに関する具体的なエピソードが少なく、協調性の実態は面接だけでは判断しきれない。',
  },
  recommendGrade: 'B',
  recommendReason:
    '実務経験とコミュニケーションが高く即戦力として期待できる。キャリアビジョンの明確化が課題。',
  totalScore: 78,
  averageScore: 72,
  // 概要タブ: レーダーチャート（6軸）
  // 軸配置（時計回り）: 上→右上→右下→下→左下→左上
  radarAxis: [
    { label: 'コミュニケーション', value: 78, comment: '質問意図の理解力が高く、簡潔で的確な回答ができている' }, // 上（-90度）
    { label: '論理的思考', value: 65, comment: '結論→理由→具体例の構成は概ねできているが、仮説構築にやや弱さがある' }, // 右上（-30度）
    { label: '仕事意欲', value: 85, comment: '自発的にプロジェクトを推進した経験を複数語っており、意欲が高い' }, // 右下（30度）
    { label: 'ストレス耐性・柔軟性', value: 80, comment: '想定外の質問にも落ち着いて対応しており、柔軟性がある' }, // 下（90度）
    { label: '誠実性・一貫性', value: 58, comment: '発言に一貫性があるが、深掘りされた際にやや曖昧な回答があった' }, // 左下（150度）
    { label: '主体性・行動力', value: 70, comment: '自ら動いた経験はあるが、自己認識の深さにやや欠ける' }, // 左上（210度）
  ],
  // 概要タブ: 性格タイプ・強み・弱み（旧レポートタブから統合）
  personalityType: '実行型リーダー',
  personalityDesc:
    '目標達成に向けて計画的に行動し、チームを率いる力がある。決断力が高い反面、他者の意見を取り入れる柔軟性にやや欠ける場面がある。組織内ではプロジェクト推進役として機能しやすい。',
  personalityForCompany:
    '管理職やリーダーポジションに適性あり。ただし、チーム内の合意形成プロセスに課題が出る可能性がある。',
  strengths: [
    { title: '数値に基づく説明力', desc: '売上やスタッフ数など具体的な数値を交えて実績を説明する力がある' },
    { title: '課題解決への主体性', desc: '問題に対して自ら解決策を考え実行した経験を複数持つ' },
    { title: 'マネジメント経験', desc: '5名以上のチームを管理した実績があり、リーダーシップがある' },
  ],
  weaknesses: [
    { title: 'キャリアビジョンの不明確さ', desc: '3〜5年後の目標について具体性が薄く、長期定着に不安がある' },
    { title: 'チームワークの具体性不足', desc: '協調性をアピールしているが、具体的なエピソードが少ない' },
  ],
  // 詳細評価タブ: 各軸スコア＋関連Q&A
  // TODO: Phase 4 - 企業が設定した質問数に合わせて動的に生成
  axisDetails: [
    {
      label: 'コミュニケーション',
      score: 78,
      max: 100,
      comment: '質問意図の理解力が高く、簡潔で的確な回答ができている',
      questions: [
        {
          grade: 'A',
          questionSummary: 'これまでのご経歴を簡単に教えてください',
          answerSummary: '大学卒業後、飲食チェーンに入社し5年間勤務。入社2年目で副店長、3年目で店長に昇進。担当店舗の月間売上を15%向上させた実績がある。スタッフ8名のシフト管理・教育も担当。',
          evalPoint: '具体的な数値と時系列が明確で、経歴の全体像が掴みやすい回答。',
        },
      ],
    },
    {
      label: '論理的思考',
      score: 65,
      max: 100,
      comment: '結論→理由→具体例の構成は概ねできているが、仮説構築にやや弱さがある',
      questions: [
        {
          grade: 'A',
          questionSummary: '最も成果を上げた経験を教えてください',
          answerSummary: '人手不足で売上が低迷していた店舗に配属された際、採用プロセスを見直し3ヶ月で5名の採用に成功。同時にオペレーションを効率化し、売上を前年比115%に改善した。',
          evalPoint: '課題→施策→結果の構造で語れており、再現性のある成果として評価できる。',
        },
      ],
    },
    {
      label: 'ストレス耐性・柔軟性',
      score: 80,
      max: 100,
      comment: '想定外の質問にも落ち着いて対応しており、柔軟性がある',
      questions: [
        {
          grade: 'B',
          questionSummary: 'なぜ当社に応募されたのですか',
          answerSummary: '現職での店舗運営経験を活かし、より大きな組織でマネジメントに関わりたいと考えた。御社の急成長フェーズに惹かれ、自分の経験が貢献できると感じた。',
          evalPoint: '意欲は伝わるが、当社固有の魅力への言及が薄く、汎用的な志望動機の印象。',
        },
      ],
    },
    {
      label: '仕事意欲',
      score: 85,
      max: 100,
      comment: '自発的にプロジェクトを推進した経験を複数語っており、意欲が高い',
      questions: [
        {
          grade: 'A',
          questionSummary: '最も成果を上げた経験を教えてください',
          answerSummary: '人手不足で売上が低迷していた店舗に配属された際、採用プロセスを見直し3ヶ月で5名の採用に成功。同時にオペレーションを効率化し、売上を前年比115%に改善した。',
          evalPoint: '自発的に課題を見つけ、主体的に行動した経験として高く評価できる。',
        },
        {
          grade: 'B',
          questionSummary: 'なぜ当社に応募されたのですか',
          answerSummary: '現職での店舗運営経験を活かし、より大きな組織でマネジメントに関わりたいと考えた。御社の急成長フェーズに惹かれ、自分の経験が貢献できると感じた。',
          evalPoint: '成長意欲は感じられるが、もう一段具体的な動機があるとなお良い。',
        },
      ],
    },
    {
      label: '課題対応力',
      score: 58,
      max: 100,
      comment: '困難な状況の質問でやや回答に詰まる場面があった',
      questions: [
        {
          grade: 'C',
          questionSummary: '仕事で最も困難だった経験とどう乗り越えたかを教えてください',
          answerSummary: 'スタッフ間の人間関係のトラブルが発生し、退職者が出かけた。個別面談を実施して解決を図った。',
          evalPoint: 'エピソードはあるが具体的な行動と結果の説明が不足しており、深掘りが必要な回答。',
        },
      ],
    },
    {
      label: '成長可能性',
      score: 70,
      max: 100,
      comment: '過去経験からの学びはあるが、自己認識の深さにやや欠ける',
      questions: [
        {
          grade: 'C',
          questionSummary: '3〜5年後のキャリアプランを教えてください',
          answerSummary: 'マネジメントのスキルをさらに磨き、将来的にはエリアマネージャーのような立場で複数店舗を統括したい。',
          evalPoint: '方向性は示しているが、具体的なステップや数値目標がなく、ビジョンの解像度が低い。',
        },
      ],
    },
  ],
  // TODO: Phase 4 - Supabaseから会話ログを取得
  // TODO: Phase 4 - 企業が設定した質問数に合わせて動的に生成
  conversationLog: [
    {
      number: 1,
      question: 'これまでのご経歴を簡単に教えてください。',
      answer: '大学卒業後、大手飲食チェーンの株式会社フードワークスに入社し、5年間勤務しております。入社2年目で副店長、3年目で店長に昇進しました。現在は担当店舗の月間売上を前年比115%に改善し、人手不足の状況下で3ヶ月間に5名の新規採用を実現しました。スタッフ8名のシフト管理・教育にも携わっています。',
      answerDuration: '2分30秒',
      axisLabels: ['コミュニケーション', '論理的思考'],
      aiMemo: '具体例が豊富で説得力がある',
      followUp: null,
    },
    {
      number: 2,
      question: 'なぜ当社に応募されたのですか。',
      answer: '現職での店舗運営経験を活かし、より大きな組織でマネジメントに関わりたいと考えました。御社の急成長フェーズに惹かれ、自分の経験が貢献できると感じたためです。また、御社が掲げる「従業員の成長を第一に」という理念に共感し、ここでなら長期的に自分も成長できると確信しました。',
      answerDuration: '1分45秒',
      axisLabels: ['カルチャーフィット', '仕事への意欲'],
      aiMemo: '意欲は伝わるが当社固有の魅力への言及がやや薄い',
      followUp: {
        question: '当社の理念に共感されたとのことですが、具体的にどのような点に最も共感されましたか？',
        answer: '「従業員の成長を第一に」という点です。現職でもスタッフ育成に力を入れており、個別面談を月1回実施して成長計画を一緒に考えるなど、人の成長に寄り添う仕事にやりがいを感じています。御社ではそれが全社的な文化として根付いている点に強く共感しました。',
        answerDuration: '1分20秒',
      },
    },
    {
      number: 3,
      question: '最も成果を上げた経験を教えてください。',
      answer: '人手不足で売上が低迷していた店舗に配属された際の経験です。まず現場のオペレーションを分析し、ボトルネックを特定しました。次に採用プロセスを見直し、求人媒体の選定から面接フローの改善まで主導した結果、3ヶ月で5名の採用に成功しました。同時にシフト最適化とマニュアル整備を進め、売上を前年比115%に改善することができました。',
      answerDuration: '2分15秒',
      axisLabels: ['論理的思考', '仕事への意欲'],
      aiMemo: '課題→施策→結果の構造で語れており再現性が高い',
      followUp: null,
    },
    {
      number: 4,
      question: '仕事で最も困難だった経験と、どう乗り越えたかを教えてください。',
      answer: 'スタッフ間の人間関係のトラブルが発生し、退職者が出かけたことがありました。個別面談を実施して各自の不満を把握し、解決を図りました。',
      answerDuration: '1分10秒',
      axisLabels: ['課題対応力'],
      aiMemo: 'エピソードはあるが行動と結果の説明が不足している',
      followUp: {
        question: '個別面談ではどのような点をヒアリングし、最終的にどのように解決に至りましたか？',
        answer: '各スタッフに「現状で困っていること」「理想の職場環境」をヒアリングしました。結果、シフトの偏りと業務分担の不公平感が主因と判明したため、シフト作成基準を透明化し、業務チェックリストを作成しました。その後、退職希望者も翻意し、3ヶ月後にはチーム満足度が改善しました。',
        answerDuration: '1分50秒',
      },
    },
    {
      number: 5,
      question: '3〜5年後のキャリアプランを教えてください。',
      answer: 'マネジメントのスキルをさらに磨き、将来的にはエリアマネージャーのような立場で複数店舗を統括したいと考えています。現場で培った経験を活かしつつ、より広い視野で組織運営に携わりたいです。',
      answerDuration: '1分30秒',
      axisLabels: ['成長可能性'],
      aiMemo: '方向性は示しているが具体的なステップが不足',
      followUp: null,
    },
  ],
  // 録画再生タブ
  recordingDuration: '25:30',
  recordingAt: '2025-02-14 14:30',
  // TODO: Phase 4 AIハイライトは面接分析APIから自動生成
  highlights: [
    { time: '03:12', label: '売上改善の実績を具体的な数値で説明', timestamp: '14:33:12' },
    { time: '08:45', label: '採用プロセス改善の成功体験を詳述', timestamp: '14:38:45' },
    { time: '18:20', label: '困難な状況への対応で回答に詰まる場面', timestamp: '14:48:20' },
  ],
}

const STATUS_OPTIONS = [
  { value: 'pending', label: '未対応' },
  { value: 'considering', label: '検討中' },
  { value: 'second_pass', label: '二次通過' },
  { value: 'rejected', label: '不採用' },
]

const RECOMMEND_LEGEND = [
  { grade: 'A', label: '強く推奨', desc: '即戦力として高く評価' },
  { grade: 'B', label: '推奨', desc: '基本的な要件を満たし活躍が期待できる' },
  { grade: 'C', label: '条件付き推奨', desc: '一部課題があるが育成次第で可能性あり' },
  { grade: 'D', label: '非推奨', desc: '現時点では要件を満たしていない' },
] as const

type TabKey = 'summary' | 'detail' | 'conversation' | 'recording' | 'share' | 'resume'

// 画面で参照する実DBカラムに合わせた最小型（supabase の戻り値を受ける。全面型生成はしない）
type ApplicantRow = {
  last_name?: string | null
  first_name?: string | null
  last_name_kana?: string | null
  first_name_kana?: string | null
  email?: string | null
  phone_number?: string | null
  age?: number | null
  education?: string | null
  employment_type?: string | null
  gender?: string | null
  industry_experience?: string | null
  prefecture?: string | null
  qualifications?: string | null
  status?: string | null
  work_history?: string | null
  company_id?: string | null
  result?: string | null
  jobs?: { title?: string } | null
}

type InterviewRow = {
  started_at?: string | null
  ended_at?: string | null
  recording_url?: string | null
  total_questions?: number | null
  answered_questions?: number | null
}

type InterviewResultRow = {
  total_score?: number | null
  detail_json?: {
    recommendation_rank?: string
    // P-10 OpenAI writer が面接全体から生成（無ければ既存DB項目で代替表示）
    profile_summary?: {
      persona?: string | null
      career?: string | null
      interviewer_notes?: string | null
    } | null
  } | null
  summary_text?: string | null
  feedback_text?: string | null
  personality_type?: string | null
  personality_description?: string | null
  strengths?: string[] | null
  improvement_points?: string[] | null
  // 文化分析ブロックは optional chaining なしでアクセスするため非optional（実行時は既存ガードで存在前提）
  big_five_scores: { openness: number; conscientiousness: number; extraversion: number; agreeableness: number; neuroticism: number; [key: string]: number }
  culture_fit_score?: number | null
  culture_fit_detail?: { summary?: string } | null
  evaluation_axes?: unknown
}

type CultureProfileRow = {
  department?: string | null
  employment_type?: string | null
  // optional chaining なしでアクセスするため非optional
  avg_openness: number
  avg_conscientiousness: number
  avg_extraversion: number
  avg_agreeableness: number
  avg_neuroticism: number
}

// カルチャーフィット詳細分析は v5 では MVP対象外（将来復活時に true に）。
// boolean 型にすることで TS が後続のガード（interviewResult 等の非null絞り込み）を到達可能として扱う。
const SHOW_CULTURE_ANALYSIS: boolean = false

// EBCA（Evidence-based Competency Analysis）の1軸。score=null は「判断材料不足」。
type EvalAxis = {
  label: string
  score: number | null
  rank: string | null
  evidence: string[]
  confidence: 'high' | 'medium' | 'low' | null
  insufficientReason: string | null
}

const CONFIDENCE_LABELS: Record<'high' | 'medium' | 'low', string> = { high: '高', medium: '中', low: '低' }

// 経歴要約の表示用ラベル（不明な値は生値をそのまま表示）
const EDUCATION_LABELS: Record<string, string> = {
  junior_high: '中学校卒業', high_school: '高校卒業', vocational: '専門学校卒業',
  junior_college: '短期大学卒業', university: '大学卒業', graduate: '大学院卒業', other: 'その他',
}
const INDUSTRY_EXP_LABELS: Record<string, string> = { experienced: '経験あり', inexperienced: '未経験' }

// 6評価軸キー → 日本語ラベル（evaluation_axes が label を持たない場合のフォールバック）
const AXIS_LABELS: Record<string, string> = {
  communication: 'コミュニケーション',
  logical_thinking: '論理的思考',
  initiative: '主体性・行動力',
  desire: '仕事意欲',
  stress_tolerance: 'ストレス耐性・柔軟性',
  integrity: '誠実性・一貫性',
}

// interview_results.evaluation_axes を安全に正規化（EBCA形式）。
// 配列 [{axis,label,score,rank,evidence[],confidence,insufficient_reason}] が主。
// 旧形式 [{label,value}] / オブジェクト {key:number} にも最低限対応。
// 重要: score=null（判断材料不足）は 0 に変換せず null のまま保持する。想定外/空/null は [] を返す（DUMMY補完なし）。
function normalizeEvaluationAxes(raw: unknown): EvalAxis[] {
  if (!raw || typeof raw !== 'object') return []
  const toAxis = (
    label: string, scoreRaw: unknown, rankRaw: unknown,
    evidenceRaw: unknown, confRaw: unknown, insuffRaw: unknown,
  ): EvalAxis => {
    const score = typeof scoreRaw === 'number' && Number.isFinite(scoreRaw) ? scoreRaw : null
    const rank = typeof rankRaw === 'string' && rankRaw ? rankRaw : null
    const evidence = Array.isArray(evidenceRaw)
      ? evidenceRaw.filter((e): e is string => typeof e === 'string' && e.length > 0)
      : []
    const confidence = confRaw === 'high' || confRaw === 'medium' || confRaw === 'low' ? confRaw : null
    const insufficientReason = typeof insuffRaw === 'string' && insuffRaw ? insuffRaw : null
    return { label, score, rank, evidence, confidence, insufficientReason }
  }
  const out: EvalAxis[] = []
  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (!item || typeof item !== 'object') continue
      const obj = item as Record<string, unknown>
      const keyStr = typeof obj.axis === 'string' ? obj.axis : typeof obj.key === 'string' ? obj.key : ''
      const labelRaw = obj.label ?? obj.name
      const label = typeof labelRaw === 'string' && labelRaw ? labelRaw : AXIS_LABELS[keyStr] ?? (keyStr || '評価軸')
      out.push(toAxis(label, obj.score ?? obj.value, obj.rank, obj.evidence, obj.confidence, obj.insufficient_reason))
    }
  } else {
    for (const [key, val] of Object.entries(raw as Record<string, unknown>)) {
      out.push(toAxis(AXIS_LABELS[key] ?? key, val, undefined, undefined, undefined, undefined))
    }
  }
  return out
}

const GRADE_STYLES: Record<string, string> = {
  A: 'bg-emerald-500 text-white shadow-md shadow-emerald-500/25',
  B: 'bg-sky-500 text-white shadow-md shadow-sky-500/25',
  C: 'bg-amber-500 text-white shadow-md shadow-amber-500/25',
  D: 'bg-rose-500 text-white shadow-md shadow-rose-500/25',
}

function RecommendLegend() {
  return (
    <div className="mt-5 rounded-2xl bg-slate-50 border border-slate-200/90 px-5 py-4 shadow-sm">
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">採用推奨度の目安</p>
      <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {RECOMMEND_LEGEND.map(({ grade, label, desc }) => (
          <div key={grade} className="flex items-start gap-3 rounded-xl bg-white/80 px-3 py-2.5 border border-slate-100">
            <span className={`mt-0.5 inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold shrink-0 ${GRADE_STYLES[grade]}`}>
              {grade}
            </span>
            <div className="min-w-0">
              <dt className="text-xs font-semibold text-slate-700">{label}</dt>
              <dd className="text-xs text-slate-500 mt-0.5 leading-snug">{desc}</dd>
            </div>
          </div>
        ))}
      </dl>
    </div>
  )
}


export default function ApplicantDetailPage() {
  const params = useParams()
  const id = params.id as string
  const supabase = createClient()
  
  
  const [activeTab, setActiveTab] = useState<TabKey>('summary')
  const [selectedStatus, setSelectedStatus] = useState<string | null>(null)
  const [statusDropdownOpen, setStatusDropdownOpen] = useState(false)
  const statusDropdownRef = useRef<HTMLDivElement>(null)
  const [statusToast, setStatusToast] = useState(false)
  const [applicant, setApplicant] = useState<ApplicantRow | null>(null)
  const [interview, setInterview] = useState<InterviewRow | null>(null)
  const [interviewResult, setInterviewResult] = useState<InterviewResultRow | null>(null)
  const [cultureProfile, setCultureProfile] = useState<CultureProfileRow | null>(null)
  const [cultureAnalysisEnabled, setCultureAnalysisEnabled] = useState<boolean>(false)
  const [loading, setLoading] = useState(true)

  // Supabaseから応募者データと面接データを取得
  useEffect(() => {
    async function fetchApplicant() {
      if (!id) {
        setLoading(false)
        return
      }
      
      setLoading(true)
      
      try {
        // 応募者データを取得
        const { data: applicantData, error: applicantError } = await supabase
          .from('applicants')
          .select('*, jobs(title)')
          .eq('id', id)
          .single()


        if (applicantError) {
          setApplicant(null)
        } else if (applicantData) {
          setApplicant(applicantData)
          setSelectedStatus(applicantData.result === '未対応' ? null : applicantData.result === '検討中' ? 'considering' : applicantData.result === '二次通過' ? 'second_pass' : applicantData.result === '不採用' ? 'rejected' : null)

          // interview_resultsを取得
          const { data: irData } = await supabase
            .from('interview_results')
            .select('*')
            .eq('applicant_id', id)
            .maybeSingle()
          if (irData) {
            setInterviewResult(irData)
          }

          // companiesからculture_analysis_enabledを取得
          if (applicantData.company_id) {
            const { data: companyData } = await supabase
              .from('companies')
              .select('culture_analysis_enabled')
              .eq('id', applicantData.company_id)
              .maybeSingle()
            if (companyData) {
              setCultureAnalysisEnabled(companyData.culture_analysis_enabled === true)
            }
          }

          // culture_profilesを取得（企業の営業部・正社員のプロファイル）
          // TODO: applicantのjob_type/departmentと連携して取得
          if (applicantData.company_id) {
            const { data: profileData } = await supabase
              .from('culture_profiles')
              .select('*')
              .eq('company_id', applicantData.company_id)
              .limit(1)
              .maybeSingle()
            if (profileData) {
              setCultureProfile(profileData)
            }
          }

          // 面接データを取得（最新の1件）
          const { data: interviewData, error: interviewError } = await supabase
            .from('interviews')
            .select('*')
            .eq('applicant_id', id)
            .order('started_at', { ascending: false })
            .limit(1)
            .maybeSingle()

          if (!interviewError && interviewData) {
            setInterview(interviewData)
          } else {
            setInterview(null)
          }
        } else {
          setApplicant(null)
        }
      } catch {
        setApplicant(null)
      }
      setLoading(false)
    }
    fetchApplicant()
  }, [id, supabase])

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (statusDropdownRef.current && !statusDropdownRef.current.contains(e.target as Node)) {
        setStatusDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])
  const [selectionMemo, setSelectionMemo] = useState('')
  const [toast, setToast] = useState('')
  // 録画再生タブ用
  const [playbackSpeed, setPlaybackSpeed] = useState('1x')
  const [subtitleEnabled, setSubtitleEnabled] = useState(true)
  // 共有タブ用
  const [shareEmail, setShareEmail] = useState('')
  const [shareMessage, setShareMessage] = useState('')
  const [linkCopied, setLinkCopied] = useState(false)

  const tabs: { key: TabKey; label: string }[] = [
    { key: 'summary', label: '概要' },
    { key: 'resume', label: '履歴書' },
    { key: 'detail', label: '詳細評価' },
    { key: 'conversation', label: '会話ログ' },
    { key: 'recording', label: '録画再生' },
    { key: 'share', label: '共有' },
  ]

  // 基本情報は applicants の実データのみ（取得できない場合は空状態）
  const displayName = applicant ? `${applicant.last_name || ''} ${applicant.first_name || ''}`.trim() || '名前未設定' : '—'
  const displayEmail = applicant?.email || '—'
  const displayPhone = applicant?.phone_number || '—'

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[320px]">
        <span className="inline-block w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-w-0 max-w-[100vw] pb-10 sm:pb-12">
      <div className="rounded-2xl bg-slate-50/70 sm:bg-slate-50/50 border border-slate-200/60 p-4 sm:p-6 shadow-inner min-h-[200px]">
        <div className="space-y-6 sm:space-y-8">
          {/* ヘッダー */}
          <div>
            <Link
              href="/client/applicants"
              className="inline-flex items-center gap-2 text-sm text-slate-600 hover:text-blue-600 font-medium mb-4 transition-colors rounded-lg hover:bg-white/60 px-2 py-1 -mx-2 -my-1"
            >
              <ChevronLeftIcon className="w-4 h-4 shrink-0" />
              応募者一覧に戻る
            </Link>
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-5">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2.5 sm:gap-3">
                  <h1 className="text-xl sm:text-2xl font-bold text-slate-900 truncate tracking-tight">{displayName}</h1>
                  <div ref={statusDropdownRef} className="relative inline-block">
                    <button
                      type="button"
                      onClick={() => setStatusDropdownOpen(!statusDropdownOpen)}
                      className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold cursor-pointer hover:opacity-90 transition-opacity ${
                        selectedStatus == null || selectedStatus === 'pending' ? 'bg-gray-100 text-gray-600' :
                        selectedStatus === 'considering' ? 'bg-amber-50 text-amber-700 border border-amber-200/80' :
                        selectedStatus === 'second_pass' ? 'bg-sky-50 text-sky-700 border border-sky-200/80' :
                        'bg-rose-50 text-rose-700 border border-rose-200/80'
                      }`}
                    >
                      {selectedStatus == null || selectedStatus === 'pending' ? '未対応' : selectedStatus === 'considering' ? '検討中' : selectedStatus === 'second_pass' ? '二次通過' : '不採用'}
                      <ChevronDownIcon className="w-3.5 h-3.5" />
                    </button>
                    {statusDropdownOpen && (
                      <div className="absolute left-0 top-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg z-50 min-w-[120px] py-1">
                        <button
                          type="button"
                          onClick={() => {
                            // TODO: Phase 4 - Supabaseでステータス更新
                            setSelectedStatus(null)
                            setStatusDropdownOpen(false)
                            setStatusToast(true)
                            setTimeout(() => setStatusToast(false), 2000)
                          }}
                          className="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                        >
                          未対応
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            // TODO: Phase 4 - Supabaseでステータス更新
                            setSelectedStatus('considering')
                            setStatusDropdownOpen(false)
                            setStatusToast(true)
                            setTimeout(() => setStatusToast(false), 2000)
                          }}
                          className="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                        >
                          検討中
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            // TODO: Phase 4 - Supabaseでステータス更新
                            setSelectedStatus('second_pass')
                            setStatusDropdownOpen(false)
                            setStatusToast(true)
                            setTimeout(() => setStatusToast(false), 2000)
                          }}
                          className="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                        >
                          二次通過
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            // TODO: Phase 4 - Supabaseでステータス更新
                            setSelectedStatus('rejected')
                            setStatusDropdownOpen(false)
                            setStatusToast(true)
                            setTimeout(() => setStatusToast(false), 2000)
                          }}
                          className="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                        >
                          不採用
                        </button>
                      </div>
                    )}
                  </div>
                </div>
                <dl className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 text-sm text-slate-600">
                  <div className="flex gap-2 min-w-0">
                    <dt className="text-slate-500 shrink-0">メール</dt>
                    <dd className="truncate">{displayEmail}</dd>
                  </div>
                  <div className="flex gap-2">
                    <dt className="text-slate-500 shrink-0">電話</dt>
                    <dd>{displayPhone}</dd>
                  </div>
                </dl>
              </div>
              {/* 選考ステータス（常時表示） */}
              <div className="w-full sm:w-72 shrink-0 bg-white rounded-2xl border border-slate-200/80 p-5 shadow-md shadow-slate-200/50">
                <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">選考結果</h3>
                <div className="space-y-3">
                  <select
                    value={selectedStatus ?? 'pending'}
                    onChange={(e) => setSelectedStatus(e.target.value === 'pending' ? null : e.target.value)}
                    className="w-full px-3 py-2.5 border border-slate-200 bg-slate-50/50 text-slate-800 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition-all"
                  >
                    {STATUS_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                  <textarea
                    value={selectionMemo}
                    onChange={(e) => setSelectionMemo(e.target.value)}
                    rows={3}
                    className="w-full px-3 py-2.5 border border-slate-200 bg-slate-50/50 text-slate-800 placeholder-slate-400 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition-all resize-none"
                    placeholder="選考メモを入力..."
                  />
                  <button
                    type="button"
                    onClick={() => {
                      // TODO: Phase 4 Supabase API 実装時に差替え
                      setToast('保存しました')
                      setTimeout(() => setToast(''), 2500)
                    }}
                    className="w-full px-4 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-all shadow-md shadow-blue-500/20"
                  >
                    保存
                  </button>
                </div>
              </div>
            </div>
          </div>

          {statusToast && (
            <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[60] px-6 py-3 bg-gray-900 text-white text-sm font-medium rounded-xl shadow-lg">
              結果を更新しました
            </div>
          )}

          {/* ステータス別バナー */}
          {applicant?.status === '途中離脱' && (
            <div className="rounded-2xl bg-red-50 border-l-4 border-red-500 p-6 shadow-md shadow-red-200/50 border border-red-100">
              <div className="flex items-start gap-3">
                <div className="shrink-0">
                  <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
                    <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <h2 className="text-lg font-bold text-red-900 mb-2">この応募者は面接を途中で離脱しました</h2>
                  <p className="text-sm text-red-800 mb-4">面接が完了していないため、AI分析レポートは生成されていません。</p>
                  
                  {/* 離脱情報 */}
                  {interview && (
                    <div className="bg-white/60 rounded-xl p-4 space-y-3 border border-red-100">
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
                        <div>
                          <dt className="text-red-600 font-semibold mb-1">離脱日時</dt>
                          <dd className="text-slate-700">
                            {interview.ended_at ? new Date(interview.ended_at).toLocaleString('ja-JP', {
                              year: 'numeric',
                              month: '2-digit',
                              day: '2-digit',
                              hour: '2-digit',
                              minute: '2-digit'
                            }) : '-'}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-red-600 font-semibold mb-1">回答済み質問数</dt>
                          <dd className="text-slate-700">
                            {interview.answered_questions ?? 0} / {interview.total_questions ?? 0}問
                          </dd>
                        </div>
                        <div>
                          <dt className="text-red-600 font-semibold mb-1">面接経過時間</dt>
                          <dd className="text-slate-700">
                            {interview.started_at && interview.ended_at ? (() => {
                              const start = new Date(interview.started_at)
                              const end = new Date(interview.ended_at)
                              const diffMs = end.getTime() - start.getTime()
                              const minutes = Math.floor(diffMs / 60000)
                              const seconds = Math.floor((diffMs % 60000) / 1000)
                              return `${minutes}分${seconds}秒`
                            })() : '-'}
                          </dd>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {applicant?.status === '準備中' && (
            <div className="rounded-2xl bg-gray-50 border-l-4 border-gray-400 p-6 shadow-md shadow-gray-200/50 border border-gray-100">
              <div className="flex items-start gap-3">
                <div className="shrink-0">
                  <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center">
                    <svg className="w-6 h-6 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <h2 className="text-lg font-bold text-gray-900 mb-2">この応募者はまだ面接を開始していません</h2>
                  <p className="text-sm text-gray-700">面接が開始され次第、レポートが生成されます。</p>
                </div>
              </div>
            </div>
          )}

          {/* タブバー */}
          <div className="rounded-2xl bg-white/80 border border-slate-200/80 p-1.5 shadow-sm overflow-x-auto">
            <nav className="flex gap-1 min-w-max" role="tablist">
              {tabs.map((tab) => (
                <button
                  key={tab.key}
                  role="tab"
                  aria-selected={activeTab === tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`px-4 py-2.5 rounded-xl text-sm font-medium whitespace-nowrap transition-all ${
                    activeTab === tab.key
                      ? 'bg-blue-600 text-white shadow-md shadow-blue-500/25'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </nav>
          </div>

      {/* 履歴書タブ */}
      {activeTab === 'resume' && (
        <div className="space-y-6">
          <div className="bg-white rounded-2xl shadow-md shadow-slate-200/50 border border-slate-200/80 p-6 sm:p-7">
            <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-6">履歴書情報</h2>
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-5">
              <div>
                <dt className="text-xs font-medium text-slate-500 mb-1">氏名</dt>
                <dd className="text-sm text-slate-900">{applicant?.last_name || applicant?.first_name ? `${applicant.last_name || ''} ${applicant.first_name || ''}`.trim() : '未入力'}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-slate-500 mb-1">フリガナ</dt>
                <dd className="text-sm text-slate-900">{applicant?.last_name_kana || applicant?.first_name_kana ? `${applicant.last_name_kana || ''} ${applicant.first_name_kana || ''}`.trim() : '未入力'}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-slate-500 mb-1">年齢</dt>
                <dd className="text-sm text-slate-900">{applicant?.age != null ? `${applicant.age}歳` : '未入力'}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-slate-500 mb-1">性別</dt>
                <dd className="text-sm text-slate-900">{applicant?.gender || '未入力'}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-slate-500 mb-1">電話番号</dt>
                <dd className="text-sm text-slate-900">{applicant?.phone_number || '未入力'}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-slate-500 mb-1">メールアドレス</dt>
                <dd className="text-sm text-slate-900">{applicant?.email || '未入力'}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-slate-500 mb-1">居住都道府県</dt>
                <dd className="text-sm text-slate-900">{applicant?.prefecture || '未入力'}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-slate-500 mb-1">最終学歴</dt>
                <dd className="text-sm text-slate-900">{applicant?.education || '未入力'}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-slate-500 mb-1">応募職種</dt>
                <dd className="text-sm text-slate-900">{applicant?.jobs?.title || '未入力'}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-slate-500 mb-1">就業形態</dt>
                <dd className="text-sm text-slate-900">{applicant?.employment_type || '未入力'}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-slate-500 mb-1">業界経験</dt>
                <dd className="text-sm text-slate-900">{applicant?.industry_experience || '未入力'}</dd>
              </div>
            </dl>
            <div className="mt-6 space-y-5">
              <div>
                <dt className="text-xs font-medium text-slate-500 mb-1">職歴・業種</dt>
                <dd className="text-sm text-slate-900 bg-slate-50 rounded-xl p-4 border border-slate-200/80 whitespace-pre-wrap">{applicant?.work_history || '未入力'}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-slate-500 mb-1">保有資格</dt>
                <dd className="text-sm text-slate-900 bg-slate-50 rounded-xl p-4 border border-slate-200/80 whitespace-pre-wrap">{applicant?.qualifications || '未入力'}</dd>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* タブ1: 概要 */}
      {activeTab === 'summary' && (
        <div className="space-y-8">
          {(applicant?.status === '途中離脱' || applicant?.status === '準備中') ? (
            <div className="rounded-2xl bg-white border border-slate-200/80 p-8 shadow-sm text-center">
              <p className="text-slate-600 font-medium">面接が完了していないため、AI分析レポートは生成されていません</p>
            </div>
          ) : !interviewResult ? (
            <div className="rounded-2xl bg-white border border-slate-200/80 p-8 shadow-sm text-center">
              <p className="text-slate-600 font-medium">AI評価レポートはまだ生成されていません</p>
            </div>
          ) : (
            <>
              {/* 人物概要（profile_summary.persona 優先 / 無ければ既存DB項目で代替） */}
              <div className="rounded-2xl bg-blue-50/90 border-l-4 border-blue-500 p-6 sm:p-7 shadow-md shadow-slate-200/50 border border-blue-100/50">
                <h2 className="text-xs font-semibold text-blue-600 uppercase tracking-wider mb-5">人物概要</h2>
                <div className="space-y-5 text-sm sm:text-base text-slate-700 leading-relaxed">
                  {interviewResult.detail_json?.profile_summary?.persona ? (
                    <section>
                      <p className="font-bold text-slate-800 whitespace-pre-wrap">{interviewResult.detail_json.profile_summary.persona}</p>
                    </section>
                  ) : (
                    interviewResult.summary_text && (
                      <section>
                        <p className="font-semibold text-gray-700 mb-1">人物像・サマリー</p>
                        <p className="font-bold text-slate-800">{interviewResult.summary_text}</p>
                      </section>
                    )
                  )}
                  {interviewResult.feedback_text && (
                    <section>
                      <p className="font-semibold text-gray-700 mb-1.5">講評</p>
                      <p>{interviewResult.feedback_text}</p>
                    </section>
                  )}
                  {!interviewResult.detail_json?.profile_summary?.persona && !interviewResult.summary_text && !interviewResult.feedback_text && (
                    <p className="text-sm text-slate-500">人物概要データはまだありません。</p>
                  )}
                </div>
              </div>

              {/* 経歴要約（profile_summary.career 優先 / 無ければ応募者の職歴・業界経験・学歴で代替） */}
              <div className="bg-white rounded-2xl shadow-md shadow-slate-200/50 border border-slate-200/80 p-6 sm:p-7">
                <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4">経歴要約</h2>
                {interviewResult.detail_json?.profile_summary?.career ? (
                  <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{interviewResult.detail_json.profile_summary.career}</p>
                ) : (applicant?.work_history || applicant?.industry_experience || applicant?.education) ? (
                  <dl className="space-y-3">
                    {applicant?.work_history && (
                      <div>
                        <dt className="text-xs font-medium text-slate-500 mb-1">職務経歴</dt>
                        <dd className="text-sm text-slate-800 whitespace-pre-wrap">{applicant.work_history}</dd>
                      </div>
                    )}
                    {applicant?.industry_experience && (
                      <div>
                        <dt className="text-xs font-medium text-slate-500 mb-1">業界経験</dt>
                        <dd className="text-sm text-slate-800">{INDUSTRY_EXP_LABELS[applicant.industry_experience] ?? applicant.industry_experience}</dd>
                      </div>
                    )}
                    {applicant?.education && (
                      <div>
                        <dt className="text-xs font-medium text-slate-500 mb-1">最終学歴</dt>
                        <dd className="text-sm text-slate-800">{EDUCATION_LABELS[applicant.education] ?? applicant.education}</dd>
                      </div>
                    )}
                  </dl>
                ) : (
                  <p className="text-sm text-slate-500">経歴情報はまだありません。</p>
                )}
              </div>

              {/* 推薦度バッジ */}
              <div>
                <div className="flex flex-col sm:flex-row sm:items-start gap-6 p-5 rounded-2xl bg-white border border-slate-200/80 shadow-md shadow-slate-200/50">
                  <span
                    className={`inline-flex items-center justify-center w-16 h-16 sm:w-20 sm:h-20 rounded-2xl text-4xl font-bold shrink-0 ${GRADE_STYLES[interviewResult.detail_json?.recommendation_rank || ''] || 'bg-slate-100 text-slate-500'}`}
                  >
                    {interviewResult.detail_json?.recommendation_rank || '—'}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900">推奨</p>
                    {interviewResult.feedback_text && (
                      <p className="text-sm text-slate-600 mt-1 max-w-xl leading-relaxed">{interviewResult.feedback_text}</p>
                    )}
                    {/* AI面接スコアとカルチャーフィット */}
                    {interviewResult?.total_score != null && (
                      <div className="mt-4 pt-4 border-t border-slate-100">
                        <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-6">
                          <div>
                            <span className="text-sm text-gray-500">AI面接スコア: </span>
                            <span className="text-lg font-semibold text-gray-800">{interviewResult.total_score}</span>
                            <span className="text-sm text-gray-500"> / 100</span>
                          </div>
                          {/* v5: カルチャーフィット表示はMVP対象外（将来復活時にコメントを外す） */}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                <RecommendLegend />
              </div>

              {/* 総合スコア */}
              {interviewResult.total_score != null && (
                <div className="bg-white rounded-2xl shadow-md shadow-slate-200/50 border border-slate-200/80 p-5">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-semibold text-slate-900">総合スコア</span>
                    <span className="text-2xl font-extrabold text-blue-600 tabular-nums">{interviewResult.total_score}<span className="text-sm font-normal text-slate-400"> / 100</span></span>
                  </div>
                  <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full bg-blue-500" style={{ width: `${interviewResult.total_score}%` }} />
                  </div>
                </div>
              )}

              {/* 評価軸スコア（EBCA: Evidence-based Competency Analysis）。score=null は「判断材料不足」。DUMMY補完なし */}
              <div className="bg-white rounded-2xl shadow-md shadow-slate-200/50 border border-slate-200/80 p-6 sm:p-7">
                <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4">評価軸スコア</h2>
                {(() => {
                  const evalAxes = normalizeEvaluationAxes(interviewResult.evaluation_axes)
                  if (evalAxes.length === 0) {
                    return <p className="text-sm text-slate-500">評価軸データはまだありません。</p>
                  }
                  return (
                    <div className="space-y-4">
                      {evalAxes.map((d, i) => (
                        <div key={i} className="rounded-xl border border-slate-200/80 bg-slate-50/60 p-4">
                          <div className="flex justify-between items-baseline gap-3 mb-1.5">
                            <span className="text-sm font-medium text-slate-800">{d.label}</span>
                            {d.score != null ? (
                              <span className="text-sm font-bold text-slate-900 tabular-nums whitespace-nowrap">
                                {d.score}<span className="text-xs font-normal text-slate-400"> / 20</span>
                                {d.rank && <span className="ml-2 text-xs font-semibold text-blue-600">{d.rank}</span>}
                              </span>
                            ) : (
                              <span className="text-xs font-semibold text-amber-600 whitespace-nowrap">判断材料不足</span>
                            )}
                          </div>
                          {d.score != null && (
                            <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden mb-1.5">
                              <div className="h-full rounded-full bg-blue-500" style={{ width: `${(Math.max(0, Math.min(20, d.score)) / 20) * 100}%` }} />
                            </div>
                          )}
                          {d.confidence && (
                            <p className="text-xs text-slate-500 mb-1">信頼度: {CONFIDENCE_LABELS[d.confidence]}</p>
                          )}
                          {d.score == null && d.insufficientReason && (
                            <p className="text-xs text-amber-700/80 mb-1">{d.insufficientReason}</p>
                          )}
                          {d.evidence.length > 0 && (
                            <ul className="mt-1.5 space-y-1">
                              {d.evidence.map((e, j) => (
                                <li key={j} className="text-xs text-slate-500 leading-relaxed border-l-2 border-slate-300 pl-2.5">{e}</li>
                              ))}
                            </ul>
                          )}
                        </div>
                      ))}
                    </div>
                  )
                })()}
              </div>

              {/* パーソナリティタイプ（旧レポートタブから統合） */}
              <div className="bg-white rounded-2xl shadow-md shadow-slate-200/50 border border-slate-200/80 p-6 sm:p-7">
                <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">パーソナリティタイプ</h2>
                {interviewResult.personality_type && <p className="text-lg font-bold text-slate-900 mb-3 tracking-tight">{interviewResult.personality_type}</p>}
                {interviewResult.personality_description && <p className="text-sm text-slate-600 leading-relaxed">{interviewResult.personality_description}</p>}
                {!interviewResult.personality_type && !interviewResult.personality_description && (
                  <p className="text-sm text-slate-500">パーソナリティデータはまだありません。</p>
                )}
              </div>

              {/* 強み */}
              <div className="bg-white rounded-2xl shadow-md shadow-slate-200/50 border border-slate-200/80 p-6 sm:p-7">
                <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4">強み</h2>
                <ul className="space-y-5">
                  {(Array.isArray(interviewResult.strengths) ? interviewResult.strengths : []).map((s: string, i: number) => (
                    <li key={i} className="pl-4 border-l-2 border-emerald-200">
                      <p className="text-sm text-slate-700 leading-relaxed">{s}</p>
                    </li>
                  ))}
                  {(!Array.isArray(interviewResult.strengths) || interviewResult.strengths.length === 0) && (
                    <li className="text-sm text-slate-500">強みデータはまだありません。</li>
                  )}
                </ul>
              </div>

              {/* 懸念点・追加確認ポイント（改善点 ＋ EBCAの判断材料不足軸を統合） */}
              <div className="bg-white rounded-2xl shadow-md shadow-slate-200/50 border border-slate-200/80 p-6 sm:p-7">
                <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">懸念点・追加確認ポイント</h2>
                <p className="text-xs text-slate-500 mb-4">応募者には見せない企業専用の情報</p>
                <ul className="space-y-5">
                  {(Array.isArray(interviewResult.improvement_points) ? interviewResult.improvement_points : []).map((w: string, i: number) => (
                    <li key={i} className="pl-4 border-l-2 border-amber-200">
                      <p className="text-sm text-slate-700 leading-relaxed">{w}</p>
                    </li>
                  ))}
                </ul>
                {(() => {
                  // EBCA で判断材料不足（score=null）の軸を「次回面接で確認すべき点」として提示
                  const insufficient = normalizeEvaluationAxes(interviewResult.evaluation_axes).filter((a) => a.score == null)
                  if (insufficient.length === 0) return null
                  return (
                    <div className="mt-5 pt-4 border-t border-slate-100">
                      <p className="text-xs font-semibold text-amber-700 mb-2">判断材料不足・次回確認ポイント</p>
                      <ul className="space-y-2">
                        {insufficient.map((a, i) => (
                          <li key={i} className="pl-4 border-l-2 border-amber-300">
                            <p className="text-sm text-slate-700 leading-relaxed">
                              <span className="font-medium">{a.label}</span>
                              {a.insufficientReason ? `：${a.insufficientReason}` : '：判断材料が不足しています'}
                            </p>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )
                })()}
                {(!Array.isArray(interviewResult.improvement_points) || interviewResult.improvement_points.length === 0) &&
                  normalizeEvaluationAxes(interviewResult.evaluation_axes).filter((a) => a.score == null).length === 0 && (
                    <p className="text-sm text-slate-500">懸念点・追加確認データはまだありません。</p>
                  )}
              </div>

              {/* 面接官向けメモ（profile_summary.interviewer_notes があれば表示） */}
              {interviewResult.detail_json?.profile_summary?.interviewer_notes && (
                <div className="bg-white rounded-2xl shadow-md shadow-slate-200/50 border border-slate-200/80 p-6 sm:p-7">
                  <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">面接官向けメモ</h2>
                  <p className="text-xs text-slate-500 mb-4">採用判断で特に見るべきポイント</p>
                  <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{interviewResult.detail_json.profile_summary.interviewer_notes}</p>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* タブ2: 詳細評価 */}
      {activeTab === 'detail' && (
        <div className="space-y-6">
          {(applicant?.status === '途中離脱' || applicant?.status === '準備中') ? (
            <div className="rounded-2xl bg-white border border-slate-200/80 p-8 shadow-sm text-center">
              <p className="text-slate-600 font-medium">面接が完了していないため、詳細評価は生成されていません</p>
            </div>
          ) : (
            <>
              {/* セクション1: AI面接評価 */}
              <div className="bg-white rounded-2xl shadow-md shadow-slate-200/50 border border-slate-200/80 overflow-hidden">
                <div className="p-6 sm:p-7">
                  <h3 className="text-base font-bold text-slate-900 mb-6">AI面接評価</h3>
                  
                  {/* 総合スコア */}
                  {interviewResult?.total_score != null && (
                    <div className="mb-6">
                      <p className="text-sm text-slate-500 mb-1">総合スコア</p>
                      <p className="text-3xl font-bold text-slate-900">
                        {interviewResult.total_score}<span className="text-lg font-normal text-slate-400"> / 100</span>
                      </p>
                    </div>
                  )}

                  {/* 推薦度 */}
                  {interviewResult?.detail_json?.recommendation_rank && (
                    <div className="mb-6">
                      <p className="text-sm text-slate-500 mb-1">推薦度</p>
                      <p className="text-lg font-semibold text-slate-900">
                        {interviewResult.detail_json.recommendation_rank}
                      </p>
                    </div>
                  )}

                  {/* 性格タイプ */}
                  {interviewResult?.personality_type && (
                    <div className="mb-6">
                      <p className="text-sm text-slate-500 mb-2">性格タイプ</p>
                      <span className="inline-block px-3 py-1.5 text-sm font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-full">
                        {interviewResult.personality_type}
                      </span>
                    </div>
                  )}

                  {/* 性格説明 */}
                  {interviewResult?.personality_description && (
                    <div className="mb-6">
                      <p className="text-sm text-slate-500 mb-1">性格説明</p>
                      <p className="text-sm text-gray-600 leading-relaxed">
                        {interviewResult.personality_description}
                      </p>
                    </div>
                  )}

                  {/* 強み */}
                  {interviewResult?.strengths && Array.isArray(interviewResult.strengths) && interviewResult.strengths.length > 0 && (
                    <div className="mb-6">
                      <p className="text-sm text-slate-500 mb-2">強み</p>
                      <ul className="list-disc list-inside space-y-1">
                        {interviewResult.strengths.map((s: string, idx: number) => (
                          <li key={idx} className="text-sm text-slate-700">{s}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* 改善点 */}
                  {interviewResult?.improvement_points && Array.isArray(interviewResult.improvement_points) && interviewResult.improvement_points.length > 0 && (
                    <div className="mb-6">
                      <p className="text-sm text-slate-500 mb-2">改善点</p>
                      <ul className="list-disc list-inside space-y-1">
                        {interviewResult.improvement_points.map((p: string, idx: number) => (
                          <li key={idx} className="text-sm text-slate-700">{p}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* 総合所見 */}
                  {interviewResult?.summary_text && (
                    <div className="mb-6">
                      <p className="text-sm text-slate-500 mb-2">総合所見</p>
                      <div className="bg-slate-50 rounded-lg p-4 border border-slate-100">
                        <p className="text-sm text-slate-700 leading-relaxed">{interviewResult.summary_text}</p>
                      </div>
                    </div>
                  )}

                  {/* フィードバック */}
                  {interviewResult?.feedback_text && (
                    <div>
                      <p className="text-sm text-slate-500 mb-2">フィードバック</p>
                      <p className="text-sm text-slate-700 leading-relaxed">{interviewResult.feedback_text}</p>
                    </div>
                  )}

                  {/* データがない場合のフォールバック */}
                  {!interviewResult?.total_score && !interviewResult?.detail_json?.recommendation_rank && !interviewResult?.personality_type && (
                    <p className="text-sm text-slate-400">AI面接評価データがありません</p>
                  )}
                </div>
              </div>

              {/* セクション区切り */}
              <hr className="my-8 border-gray-200" />

              {/* セクション2: カルチャーフィット詳細分析セクション（v5: MVP対象外。将来復活時に末尾の && false を削除する） */}
              {cultureAnalysisEnabled && interviewResult != null && interviewResult.culture_fit_score != null && interviewResult.big_five_scores != null && cultureProfile != null && applicant?.status === '完了' && SHOW_CULTURE_ANALYSIS && (
                <div className="bg-white rounded-2xl shadow-md shadow-slate-200/50 border border-slate-200/80 overflow-hidden">
                  <div className="p-6 sm:p-7">
                    {/* ① セクションタイトル */}
                    <h3 className="text-base font-bold text-slate-900 mb-1">カルチャーフィット詳細分析</h3>
                    <p className="text-xs text-slate-500 mb-6">
                      BIG FIVE性格特性理論（Goldberg, 1990）およびPerson-Organization Fit理論（Chatman, 1989）に基づく分析
                    </p>
                    
                    {/* ② マッチング度の大きな表示 */}
                    <div className="mb-8">
                      <p className="text-3xl font-bold text-slate-900 mb-2">
                        {interviewResult.culture_fit_score}%
                      </p>
                      <div className="relative">
                        <div className="h-3 bg-gray-200 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all bg-gradient-to-r ${
                              interviewResult.culture_fit_score >= 80 ? 'from-green-400 to-green-500' :
                              interviewResult.culture_fit_score >= 70 ? 'from-blue-400 to-blue-500' :
                              interviewResult.culture_fit_score >= 50 ? 'from-yellow-400 to-yellow-500' :
                              'from-red-400 to-red-500'
                            }`}
                            style={{ width: `${interviewResult.culture_fit_score}%` }}
                          />
                        </div>
                        {/* 閾値マーカー */}
                        <div className="absolute top-0 left-[50%] h-3 w-px bg-gray-400" />
                        <div className="absolute top-0 left-[70%] h-3 w-px bg-gray-400" />
                        <div className="absolute top-0 left-[80%] h-3 w-px bg-gray-400" />
                        <div className="flex justify-between text-[10px] text-gray-400 mt-1 px-0.5">
                          <span>0%</span>
                          <span style={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)' }}>50%</span>
                          <span style={{ position: 'absolute', left: '70%', transform: 'translateX(-50%)' }}>70%</span>
                          <span style={{ position: 'absolute', left: '80%', transform: 'translateX(-50%)' }}>80%</span>
                          <span>100%</span>
                        </div>
                      </div>
                      <p className="text-sm text-slate-600 mt-3">
                        {interviewResult.culture_fit_score >= 80 ? '非常に高いマッチング' :
                         interviewResult.culture_fit_score >= 70 ? '良好なマッチング' :
                         interviewResult.culture_fit_score >= 50 ? '中程度のマッチング' : 'マッチングに課題あり'}
                      </p>
                    </div>

                    {/* ③ BIG FIVE 比較レーダーチャート */}
                    <div className="mb-8">
                      <div className="h-72">
                        <ResponsiveContainer width="100%" height="100%">
                          <RadarChart data={[
                            { subject: '開放性', applicant: interviewResult.big_five_scores.openness, company: cultureProfile.avg_openness },
                            { subject: '誠実性', applicant: interviewResult.big_five_scores.conscientiousness, company: cultureProfile.avg_conscientiousness },
                            { subject: '外向性', applicant: interviewResult.big_five_scores.extraversion, company: cultureProfile.avg_extraversion },
                            { subject: '協調性', applicant: interviewResult.big_five_scores.agreeableness, company: cultureProfile.avg_agreeableness },
                            { subject: '情緒安定性', applicant: 10 - interviewResult.big_five_scores.neuroticism, company: 10 - cultureProfile.avg_neuroticism },
                          ]}>
                            <PolarGrid stroke="#e2e8f0" />
                            <PolarAngleAxis dataKey="subject" tick={{ fill: '#64748b', fontSize: 12 }} />
                            <PolarRadiusAxis angle={90} domain={[0, 10]} tick={{ fill: '#94a3b8', fontSize: 10 }} />
                            <Radar name="応募者" dataKey="applicant" stroke="#2563eb" fill="#2563eb" fillOpacity={0.15} strokeWidth={2} />
                            <Radar name={`企業平均（${cultureProfile.department || '全社'}/${cultureProfile.employment_type || '全職種'}）`} dataKey="company" stroke="#6B7280" fill="#6B7280" fillOpacity={0.05} strokeDasharray="5 5" strokeWidth={2} />
                            <Legend wrapperStyle={{ fontSize: 11 }} />
                          </RadarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>

                    {/* ④ 因子別詳細テーブル */}
                    <div className="mb-8">
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm border border-slate-200 rounded-lg overflow-hidden">
                          <thead>
                            <tr className="bg-slate-50 border-b border-slate-200">
                              <th className="py-2.5 px-4 text-left font-medium text-slate-600">因子名</th>
                              <th className="py-2.5 px-4 text-center font-medium text-slate-600">応募者</th>
                              <th className="py-2.5 px-4 text-center font-medium text-slate-600">企業平均</th>
                              <th className="py-2.5 px-4 text-center font-medium text-slate-600">差異</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {[
                              { label: '開放性', key: 'openness', avgKey: 'avg_openness' },
                              { label: '誠実性', key: 'conscientiousness', avgKey: 'avg_conscientiousness' },
                              { label: '外向性', key: 'extraversion', avgKey: 'avg_extraversion' },
                              { label: '協調性', key: 'agreeableness', avgKey: 'avg_agreeableness' },
                              { label: '情緒安定性', key: 'neuroticism', avgKey: 'avg_neuroticism', invert: true },
                            ].map((factor) => {
                              const applicantValue = factor.invert 
                                ? (10 - interviewResult.big_five_scores[factor.key]).toFixed(1)
                                : interviewResult.big_five_scores[factor.key].toFixed(1)
                              const avgValue = (cultureProfile as unknown as Record<string, number>)[factor.avgKey]
                              const companyValue = factor.invert
                                ? (10 - avgValue).toFixed(1)
                                : avgValue.toFixed(1)
                              const diff = (Number(applicantValue) - Number(companyValue)).toFixed(1)
                              const diffNum = Number(diff)
                              const absDiff = Math.abs(diffNum)
                              const diffStyle = absDiff >= 1.0 ? 'text-red-600 font-bold' :
                                                absDiff >= 0.5 ? 'text-yellow-600 font-medium' : 'text-gray-700'
                              return (
                                <tr key={factor.key}>
                                  <td className="py-2.5 px-4 text-slate-700">{factor.label}</td>
                                  <td className="py-2.5 px-4 text-center text-slate-900">{applicantValue}</td>
                                  <td className="py-2.5 px-4 text-center text-slate-500">{companyValue}</td>
                                  <td className={`py-2.5 px-4 text-center ${diffStyle}`}>
                                    {diffNum > 0 ? '+' : ''}{diffNum === 0 ? '±0.0' : diff}
                                  </td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {/* ⑤ 総合所見 */}
                    {interviewResult.culture_fit_detail?.summary && (
                      <div className="mb-6">
                        <p className="text-sm text-slate-700 leading-relaxed bg-slate-50 rounded-lg p-4 border border-slate-100">
                          {interviewResult.culture_fit_detail.summary}
                        </p>
                      </div>
                    )}

                    {/* ⑥ 注記 */}
                    <p className="text-xs text-slate-400">
                      ※ 本分析はBIG FIVE性格特性理論（Goldberg, 1990）およびPerson-Organization Fit理論（Chatman, 1989）に基づく参考指標です。最終的な採用判断は面接内容と合わせて総合的にご判断ください。
                    </p>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* タブ3: 会話ログ */}
      {activeTab === 'conversation' && (
        <div className="space-y-6">
          {applicant?.status === '準備中' ? (
            // 準備中時はメッセージ表示
            <div className="rounded-2xl bg-white border border-slate-200/80 p-8 shadow-sm text-center">
              <p className="text-slate-600">回答ログはありません</p>
              <p className="text-sm text-slate-500 mt-2">面接が開始され次第、回答ログが表示されます。</p>
            </div>
          ) : (
            <>
              {/* 会話ログ（質問・回答のトランスクリプト）は現状データ源が無いため空状態。
                  interview_logs は0件・transcript列なし。AI面接ログ生成（P-10/OpenAI）が前提 */}
              <div className="rounded-2xl bg-white border border-slate-200/80 p-8 shadow-sm text-center">
                <p className="text-slate-600">回答ログはありません</p>
                <p className="text-sm text-slate-500 mt-2">
                  {applicant?.status === '途中離脱'
                    ? '面接が途中で終了したため、回答ログが記録されていません。'
                    : '会話ログ（質問・回答のトランスクリプト）は現状記録されていません。'}
                </p>
              </div>
            </>
          )}
        </div>
      )}

      {/* タブ4: 録画再生 */}
      {activeTab === 'recording' && (
        <div className="space-y-6">
          {applicant?.status === '準備中' ? (
            // 準備中時はメッセージ表示
            <div className="rounded-2xl bg-white border border-slate-200/80 p-8 shadow-sm text-center">
              <p className="text-slate-600">録画データはありません</p>
              <p className="text-sm text-slate-500 mt-2">面接が開始され次第、録画データが表示されます。</p>
            </div>
          ) : (
            <>
              {/* TODO: Phase 4 Cloudflare R2 から動画URLを取得して再生 */}
              {/* 途中離脱の場合でもデータがあればプレーヤー表示、データがなければメッセージ表示 */}
              {/* 現時点ではダミーデータを使用（将来的には interview.recording_url などを確認） */}
              {interview?.recording_url || false ? ( // 将来的には recording_url の有無で判定（現時点では常にfalse）
                <>
                  {/* 動画プレイヤー */}
                  <div className="bg-white rounded-2xl shadow-md shadow-slate-200/50 border border-slate-200/80 overflow-hidden">
                    <div className="aspect-video bg-slate-900 flex items-center justify-center relative">
                      {/* メイン映像エリア: 応募者の映像（ダミー） */}
                      <div className="absolute inset-0 flex items-center justify-center">
                        {/* TODO: Phase 4 Cloudflare R2 から動画URLを取得して再生 */}
                        <button
                          type="button"
                          className="w-20 h-20 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center text-white transition-all focus:outline-none focus:ring-2 focus:ring-white/50 focus:ring-offset-2 focus:ring-offset-slate-900"
                          aria-label="再生"
                        >
                          <PlayIcon className="w-10 h-10 ml-1" />
                        </button>
                      </div>
                  
                      {/* 左上の小窓: AI面接官アバター */}
                      <div className="absolute top-4 left-4 z-10 w-40 h-30 rounded-lg border border-white/20 overflow-hidden bg-slate-800">
                        <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-slate-700 to-slate-600">
                          <svg
                            viewBox="0 0 100 100"
                            className="w-full h-full"
                            preserveAspectRatio="xMidYMid meet"
                          >
                            {/* 頭部 */}
                            <circle cx="50" cy="35" r="22" fill="#E8D5B7" />
                            {/* 胴体 */}
                            <ellipse cx="50" cy="75" rx="30" ry="25" fill="#334155" />
                            {/* 左目 */}
                            <circle cx="42" cy="32" r="2.5" fill="#1E293B" />
                            {/* 右目 */}
                            <circle cx="58" cy="32" r="2.5" fill="#1E293B" />
                            {/* 口（微笑み曲線） */}
                            <path
                              d="M 40 42 Q 50 48 60 42"
                              stroke="#1E293B"
                              strokeWidth="1.5"
                              fill="none"
                              strokeLinecap="round"
                            />
                          </svg>
                        </div>
                      </div>
                      
                      {subtitleEnabled && (
                        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-black/70 text-white text-sm px-4 py-2 rounded-lg max-w-[80%] text-center z-20">
                          これまでのご経歴を簡単に教えてください。
                        </div>
                      )}
                    </div>
                    {/* コントロールバー */}
                    <div className="p-4 sm:p-5 border-t border-slate-200/80">
                      <div className="flex flex-wrap items-center gap-3 sm:gap-4">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs text-slate-500 shrink-0">速度:</span>
                          {['0.5x', '1x', '1.5x', '2x', '3x'].map((speed) => (
                            <button
                              key={speed}
                              type="button"
                              onClick={() => setPlaybackSpeed(speed)}
                              className={`px-2.5 py-1 text-xs font-medium rounded-lg transition-colors ${
                                playbackSpeed === speed
                                  ? 'bg-blue-600 text-white'
                                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                              }`}
                            >
                              {speed}
                            </button>
                          ))}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-slate-500">字幕:</span>
                          <button
                            type="button"
                            role="switch"
                            aria-checked={subtitleEnabled}
                            onClick={() => setSubtitleEnabled(!subtitleEnabled)}
                            className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full transition-colors ${
                              subtitleEnabled ? 'bg-blue-600' : 'bg-slate-300'
                            }`}
                          >
                            <span
                              className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform mt-[3px] ${
                                subtitleEnabled ? 'translate-x-[18px]' : 'translate-x-[3px]'
                              }`}
                            />
                          </button>
                          <span className="text-xs text-slate-500">{subtitleEnabled ? 'ON' : 'OFF'}</span>
                        </div>
                        <div className="ml-auto text-xs text-slate-500">
                          <span>{DUMMY.recordingDuration}</span>
                          <span className="mx-1.5 text-slate-300">|</span>
                          <span>{DUMMY.recordingAt}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* AIハイライトマーカー */}
                  <div className="bg-white rounded-2xl shadow-md shadow-slate-200/50 border border-slate-200/80 p-6 sm:p-7">
                    <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4">AI ハイライト</h2>
                    <p className="text-xs text-slate-400 mb-4">AIが自動検出した注目ポイント</p>
                    <div className="space-y-3">
                      {/* TODO: Phase 4 面接分析APIから自動生成 */}
                      {DUMMY.highlights.map((hl, i) => (
                        <button
                          key={i}
                          type="button"
                          className="w-full flex items-start gap-4 p-4 rounded-xl bg-slate-50 border border-slate-200/80 hover:bg-blue-50 hover:border-blue-200 transition-colors text-left group"
                        >
                          <span className="shrink-0 inline-flex items-center justify-center w-14 h-8 rounded-lg bg-blue-100 text-blue-700 text-xs font-bold tabular-nums group-hover:bg-blue-200 transition-colors">
                            {hl.time}
                          </span>
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-slate-800 group-hover:text-blue-700 transition-colors">{hl.label}</p>
                            <p className="text-xs text-slate-400 mt-0.5 tabular-nums">{hl.timestamp}</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              ) : (
                // データがない場合（途中離脱でデータがない場合も含む）
                <div className="rounded-2xl bg-white border border-slate-200/80 p-8 shadow-sm text-center">
                  <p className="text-slate-600">録画データはありません</p>
                  <p className="text-sm text-slate-500 mt-2">
                    {applicant?.status === '途中離脱'
                      ? '面接が途中で終了したため、録画データが保存されていません。'
                      : '録画データが保存されていません。'}
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* タブ5: 共有 */}
      {activeTab === 'share' && (
        <div className="space-y-6">
          {/* レポートPDFダウンロード */}
          <div className="bg-white rounded-2xl shadow-md shadow-slate-200/50 border border-slate-200/80 p-6 sm:p-7">
            <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">レポートPDFダウンロード</h2>
            <p className="text-sm text-slate-600 mb-5 leading-relaxed">
              応募者の面接結果レポートをPDF形式でダウンロードできます。社内共有や印刷用にご利用ください。
            </p>
            <button
              type="button"
              onClick={() => {
                // TODO: Phase 4 PDFダウンロード機能を実装
                setToast('PDF生成機能は今後実装予定です')
                setTimeout(() => setToast(''), 2500)
              }}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 transition-colors shadow-md shadow-blue-500/20"
            >
              <Download className="w-4 h-4" />
              PDFをダウンロード
            </button>
          </div>

          {/* メール送信フォーム */}
          <div className="bg-white rounded-2xl shadow-md shadow-slate-200/50 border border-slate-200/80 p-6 sm:p-7">
            <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">メールで共有</h2>
            <p className="text-sm text-slate-600 mb-5 leading-relaxed">
              面接レポートのサマリーを指定のメールアドレスに送信します。
            </p>
            <div className="space-y-4 max-w-lg">
              <div>
                <label htmlFor="share-email" className="block text-sm font-medium text-slate-700 mb-1">送信先メールアドレス</label>
                <input
                  id="share-email"
                  type="email"
                  value={shareEmail}
                  onChange={(e) => setShareEmail(e.target.value)}
                  placeholder="example@company.com"
                  className="w-full px-4 py-2.5 border border-slate-200 bg-slate-50/50 text-slate-800 placeholder-slate-400 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition-all"
                />
              </div>
              <div>
                <label htmlFor="share-message" className="block text-sm font-medium text-slate-700 mb-1">メッセージ（任意）</label>
                <textarea
                  id="share-message"
                  value={shareMessage}
                  onChange={(e) => setShareMessage(e.target.value)}
                  rows={3}
                  placeholder="補足メッセージを入力..."
                  className="w-full px-4 py-2.5 border border-slate-200 bg-slate-50/50 text-slate-800 placeholder-slate-400 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition-all resize-none"
                />
              </div>
              <button
                type="button"
                onClick={() => {
                  // TODO: Phase 4 Resend APIでメール送信を実装
                  setToast('メール送信機能は今後実装予定です')
                  setTimeout(() => setToast(''), 2500)
                }}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 transition-colors shadow-md shadow-blue-500/20"
              >
                <Mail className="w-4 h-4" />
                送信する
              </button>
            </div>
          </div>

          {/* 共有リンク生成 */}
          <div className="bg-white rounded-2xl shadow-md shadow-slate-200/50 border border-slate-200/80 p-6 sm:p-7">
            <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">共有リンク</h2>
            <p className="text-sm text-slate-600 mb-5 leading-relaxed">
              閲覧専用の共有リンクを生成します。リンクは7日間有効です。
            </p>
            <div className="flex flex-col sm:flex-row gap-3 max-w-lg">
              <div className="flex-1 flex items-center gap-2 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-500 overflow-hidden">
                <LinkIcon className="w-4 h-4 shrink-0 text-slate-400" />
                <span className="truncate">https://ai-jinji-24h.vercel.app/share/report/{id}</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  // TODO: Phase 4 共有リンク生成APIを実装
                  navigator.clipboard.writeText(`https://ai-jinji-24h.vercel.app/share/report/${id}`)
                  setLinkCopied(true)
                  setTimeout(() => setLinkCopied(false), 2000)
                  setToast('リンクをコピーしました')
                  setTimeout(() => setToast(''), 2500)
                }}
                className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-slate-800 text-white text-sm font-semibold rounded-xl hover:bg-slate-900 transition-colors shrink-0"
              >
                {linkCopied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                {linkCopied ? 'コピー済み' : 'リンクをコピー'}
              </button>
            </div>
          </div>
        </div>
      )}
        </div>
      </div>
      {toast && (
        <div className="fixed bottom-6 right-6 bg-emerald-600 text-white px-5 py-3 rounded-xl shadow-lg text-sm font-medium z-50 animate-fade-in">
          {toast}
        </div>
      )}
    </div>
  )
}
