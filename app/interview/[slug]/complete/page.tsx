'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

// TODO: AIの分析結果からタイプを判定
const PERSONALITY_TYPE = {
  name: 'ライオン型リーダー',
  catchphrase: '決断力と行動力でチームを導くカリスマ',
  description:
    'あなたは外向的で主導型のタイプ。自ら先頭に立ってチームを引っ張り、周囲を巻き込む力があります。決断のスピードが強みで、困難な状況でも冷静に判断できるリーダー。プレッシャーに強く、大きな目標に向かって突き進むことにやりがいを感じます。',
}

// TODO: 実際のデータに差替え
const SUMMARY = {
  minutes: 25,
  questions: 6,
  avgResponseSeconds: 42,
  totalSpeakingTime: '8:30',
  speakingRate: 65,
}

// TODO: AIの分析結果から生成（新6軸に合わせた内容）
const STRENGTHS = [
  {
    title: 'コミュニケーション',
    description: '自身の経験や考えを、具体的なエピソードを交えながら分かりやすく伝えることができています。',
  },
  {
    title: '仕事への意欲',
    description: '質問の意図を正確に把握し、積極的に回答する姿勢が見られます。',
  },
  {
    title: '課題対応力',
    description: '困難な状況でも冷静に判断し、適切に対応する力があります。',
  },
]

const EVALUATION_AXES = ['コミュニケーション', '論理的思考', 'カルチャーフィット', '仕事意欲', '課題対応力', '成長可能性']
const EVALUATION_AXES_SHORT = ['コミュ力', '論理思考', '文化適性', '意欲', '課題力', '成長性']
const RADAR_DATA = [
  { label: 'コミュニケーション', value: 85 },
  { label: '論理的思考', value: 75 },
  { label: 'カルチャーフィット', value: 90 },
  { label: '仕事意欲', value: 95 },
  { label: '課題対応力', value: 88 },
  { label: '成長可能性', value: 80 },
]

function LightbulbIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 18h6M10 22h4M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0 0 18 8 6 6 0 0 0 6 8c0 1 .23 2.23 1.5 3.5A4.61 4.61 0 0 1 8.91 14" />
    </svg>
  )
}

function ClockIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <path d="M12 6v6l4 2" />
    </svg>
  )
}

function BarChartIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20V10M18 20V4M6 20v-4" />
    </svg>
  )
}

function MicIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" y1="19" x2="12" y2="23" />
      <line x1="8" y1="23" x2="16" y2="23" />
    </svg>
  )
}

function StarIcon({ className, filled }: { className?: string; filled?: boolean }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={filled ? 0 : 1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
    </svg>
  )
}

export default function CompletePage() {
  const params = useParams()
  const router = useRouter()
  const slug = params.slug as string
  const supabase = createClient()

  const [rating, setRating] = useState(0)
  const [hoverRating, setHoverRating] = useState(0)
  const [submitted, setSubmitted] = useState(false)
  const [interviewId, setInterviewId] = useState<string | null>(null)

  useEffect(() => {
    // sessionStorageからinterview_idを取得、なければinterviewsテーブルから最新のものを取得
    async function initialize() {
      const storedInterviewId = sessionStorage.getItem(`interview_${slug}_interview_id`)
      if (storedInterviewId) {
        setInterviewId(storedInterviewId)
        return storedInterviewId
      } else {
        // sessionStorageにない場合、applicant_idから最新のinterviewを取得
        const applicantId = sessionStorage.getItem(`interview_${slug}_applicant_id`)
        if (applicantId) {
          const { data, error } = await supabase
            .from('interviews')
            .select('id')
            .eq('applicant_id', applicantId)
            .order('created_at', { ascending: false })
            .limit(1)
            .single()

          if (!error && data) {
            setInterviewId(data.id)
            sessionStorage.setItem(`interview_${slug}_interview_id`, data.id)
            return data.id
          }
        }
      }
      return null
    }

    initialize().then((resolvedInterviewId) => {
      if (resolvedInterviewId) {
        // 面接結果をinterview_resultsテーブルに保存
        saveInterviewResults(resolvedInterviewId)
      }
    })
  }, [slug])

  async function saveInterviewResults(currentInterviewId: string) {
    try {
      // TODO: OpenAI GPT-4oでレポート生成
      // 現在はダミーデータを使用
      const { error } = await supabase
        .from('interview_results')
        .upsert({
          interview_id: currentInterviewId,
          total_score: 85, // ダミー値
          feedback_text: STRENGTHS.map((s) => `${s.title}: ${s.description}`).join('\n'),
          personality_type: PERSONALITY_TYPE.name,
          strengths: STRENGTHS,
          evaluation_axes: RADAR_DATA,
        }, {
          onConflict: 'interview_id',
        })

      if (error) {
      }
    } catch (error) {
    }
  }

  async function handleSubmitRating() {
    if (rating === 0) return
    const applicantId = sessionStorage.getItem(`interview_${slug}_applicant_id`)
    if (!applicantId) return
    try {
      const { error } = await supabase
        .from('applicants')
        .update({ satisfaction_rating: rating })
        .eq('id', applicantId)

      if (error) {
        return
      }

      setSubmitted(true)
    } catch (error) {
    }
  }

  const cx = 100
  const cy = 100
  const maxR = 72
  const getPoint = (i: number, r: number) => {
    const angle = (-90 + i * 60) * (Math.PI / 180) // 6軸なので60度ずつ
    return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) }
  }
  const dataPoints = RADAR_DATA.map((d, i) => getPoint(i, (d.value / 100) * maxR)) // 100点満点
  const dataPath = dataPoints.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ') + ' Z'

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 flex flex-col">
      <div className="flex-1 flex flex-col max-w-5xl mx-auto w-full px-4 sm:px-6 py-6 sm:py-8">
        {/* ヘッダー */}
        <header className="flex items-center justify-between shrink-0 mb-6">
          <span className="text-sm font-bold tracking-wide text-blue-600">AI人事24h</span>
          <h1 className="text-lg sm:text-xl font-semibold text-gray-900 tracking-tight">面接完了レポート</h1>
        </header>

        {/* メイン: 2×2 グリッド */}
        <main className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 min-h-0 overflow-y-auto">
          {/* 性格タイプカード */}
          <div className="rounded-xl bg-white shadow-sm border border-gray-200 p-4 sm:p-6 flex flex-col">
            <div className="flex items-center gap-2 mb-3">
              <div className="p-2 rounded-lg bg-orange-100">
                <LightbulbIcon className="w-5 h-5 text-orange-600" />
              </div>
              <span className="text-xs font-medium text-gray-700 uppercase tracking-wider">性格タイプ診断</span>
            </div>
            <p className="text-xl sm:text-2xl font-bold text-gray-900 mb-2 leading-tight">
              あなたは「{PERSONALITY_TYPE.name}」タイプ
            </p>
            <p className="text-sm sm:text-base text-gray-600 mb-3 leading-snug">{PERSONALITY_TYPE.catchphrase}</p>
            {/* TODO: AIの分析結果から生成 */}
            <p className="text-xs sm:text-sm text-gray-600 leading-relaxed flex-1 line-clamp-4 sm:line-clamp-5 mb-4">
              {PERSONALITY_TYPE.description}
            </p>
            <button
              onClick={() => router.push(`/interview/${slug}/diagnosis`)}
              className="mt-auto w-full px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white text-sm font-semibold rounded-lg transition-colors shadow-sm"
            >
              詳しい診断結果を見る
            </button>
          </div>

          {/* 面接サマリーカード */}
          <div className="rounded-xl bg-white shadow-sm border border-gray-200 p-4 sm:p-6 flex flex-col">
            <div className="flex items-center gap-2 mb-4">
              <ClockIcon className="w-5 h-5 text-blue-600 shrink-0" />
              <h3 className="text-xs font-bold text-gray-900 uppercase tracking-wider">面接サマリー</h3>
            </div>
            <div className="flex gap-6 mb-4">
              <div>
                <p className="text-3xl sm:text-4xl font-bold text-gray-900 tabular-nums">{SUMMARY.minutes}</p>
                <p className="text-xs text-gray-600 mt-1">分</p>
              </div>
              <div>
                <p className="text-3xl sm:text-4xl font-bold text-gray-900 tabular-nums">{SUMMARY.questions}</p>
                <p className="text-xs text-gray-600 mt-1">問</p>
              </div>
            </div>
            <div className="space-y-2 text-xs text-gray-600">
              <div className="flex items-center gap-2">
                <ClockIcon className="w-4 h-4 text-gray-400 shrink-0" />
                <span>平均応答 {SUMMARY.avgResponseSeconds}秒</span>
              </div>
              <div className="flex items-center gap-2">
                <MicIcon className="w-4 h-4 text-gray-400 shrink-0" />
                <span>総発話 {SUMMARY.totalSpeakingTime}</span>
              </div>
              <div className="flex items-center gap-2">
                <BarChartIcon className="w-4 h-4 text-gray-400 shrink-0" />
                <span>発話率 {SUMMARY.speakingRate}%</span>
              </div>
            </div>
          </div>

          {/* 能力プロファイルカード */}
          <div className="rounded-xl bg-white shadow-sm border border-gray-200 p-4 sm:p-6 flex flex-col min-h-0">
            <div className="flex items-center gap-2 mb-3">
              <BarChartIcon className="w-5 h-5 text-purple-600 shrink-0" />
              <h3 className="text-xs font-bold text-gray-900 uppercase tracking-wider">能力プロファイル</h3>
            </div>
            <div className="flex-1 min-h-[200px] flex items-center justify-center">
              <svg viewBox="0 0 200 200" className="w-[200px] h-[200px] mx-auto">
                <defs>
                  <linearGradient id="radarGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#FFD89B" stopOpacity="0.6" />
                    <stop offset="50%" stopColor="#FFA500" stopOpacity="0.7" />
                    <stop offset="100%" stopColor="#FFD89B" stopOpacity="0.6" />
                  </linearGradient>
                </defs>
                {/* グリッド */}
                {[1, 2, 3, 4, 5].map((l) => {
                  const r = (l / 5) * maxR
                  const pts = [0, 1, 2, 3, 4, 5].map((i) => getPoint(i, r))
                  const path = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ') + ' Z'
                  return <path key={l} d={path} fill="none" stroke="#D1D5DB" strokeWidth="1" />
                })}
                {/* 軸線 */}
                {[0, 1, 2, 3, 4, 5].map((i) => {
                  const p = getPoint(i, maxR)
                  return <line key={i} x1={cx} y1={cy} x2={p.x} y2={p.y} stroke="#D1D5DB" strokeWidth="1" />
                })}
                {/* データエリア */}
                <path
                  d={dataPath}
                  fill="url(#radarGrad)"
                  stroke="#FF8C42"
                  strokeWidth="2"
                />
                {/* データポイント */}
                {dataPoints.map((p, i) => (
                  <circle key={i} cx={p.x} cy={p.y} r="4" fill="#FF8C42" />
                ))}
                {/* 軸ラベルとスコア */}
                {EVALUATION_AXES_SHORT.map((axis, i) => {
                  const p = getPoint(i, maxR + 16)
                  return (
                    <g key={i}>
                      <text x={p.x} y={p.y} textAnchor="middle" fill="#333" fontSize="10" fontWeight="500">
                        {axis}
                      </text>
                      <text x={p.x} y={p.y + 12} textAnchor="middle" fill="#333" fontSize="9" fontWeight="bold">
                        {RADAR_DATA[i].value}
                      </text>
                    </g>
                  )
                })}
              </svg>
            </div>
            <div className="flex flex-wrap gap-x-3 gap-y-1 justify-center text-xs text-gray-600 mt-2">
              {RADAR_DATA.map((d, i) => (
                <span key={i}>{d.label}: {d.value}点</span>
              ))}
            </div>
          </div>

          {/* あなたの強みカード */}
          <div className="rounded-xl bg-white shadow-sm border border-gray-200 p-4 sm:p-6 flex flex-col min-h-0 overflow-hidden">
            <div className="flex items-center gap-2 mb-3">
              <StarIcon className="w-5 h-5 text-amber-500 shrink-0" filled />
              <h3 className="text-xs font-bold text-gray-900 uppercase tracking-wider">あなたの強み</h3>
            </div>
            {/* TODO: AIの分析結果から生成 */}
            <ul className="space-y-3 flex-1 min-h-0 overflow-y-auto">
              {STRENGTHS.map((s, i) => (
                <li key={i} className="flex gap-3">
                  <span className="mt-1.5 w-2 h-2 rounded-full bg-amber-500 shrink-0" />
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{s.title}</p>
                    <p className="text-xs text-gray-600 leading-relaxed mt-1">{s.description}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </main>

        {/* フッター */}
        <footer className="shrink-0 mt-6 pt-6 border-t border-gray-200">
          {!submitted ? (
            <div className="flex flex-col items-center gap-3">
              <p className="text-sm font-medium text-gray-700">面接の体験はいかがでしたか？</p>
              <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setRating(s)}
                    onMouseEnter={() => setHoverRating(s)}
                    onMouseLeave={() => setHoverRating(0)}
                    className="p-1 rounded-lg transition-all duration-200 hover:scale-110 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <StarIcon
                      className={`w-6 h-6 transition-colors ${
                        s <= (hoverRating || rating) ? 'text-amber-500' : 'text-gray-300'
                      }`}
                      filled={s <= (hoverRating || rating)}
                    />
                  </button>
                ))}
              </div>
              <button
                onClick={handleSubmitRating}
                disabled={rating === 0}
                className={`px-6 py-2 rounded-lg text-sm font-semibold transition-all ${
                  rating > 0
                    ? 'bg-blue-600 text-white hover:bg-blue-700 shadow-sm'
                    : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                }`}
              >
                送信する
              </button>
            </div>
          ) : (
            <p className="text-center text-gray-600 text-sm">ご協力ありがとうございます</p>
          )}
          <p className="text-center text-xs text-gray-400 mt-4">Powered by AI人事24h</p>
        </footer>
      </div>
      {/* TODO: Phase 4 - 実際の面接結果からスコア・タイプを算出 */}
    </div>
  )
}
