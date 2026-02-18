'use client'

import { useState, useMemo, useRef, useEffect } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useTemplates, type Template } from '../../contexts/TemplatesContext'
import { ChevronRight as ChevronRightIcon, ChevronDown as ChevronDownIcon, Phone as PhoneIcon, Mail as MailIcon } from 'lucide-react'


function scoreToGrade(score: number): string {
  if (score >= 85) return 'A'
  if (score >= 70) return 'B'
  if (score >= 55) return 'C'
  return 'D'
}


type ApplicantStatus = 'considering' | 'second_pass' | 'rejected' | null

type DashboardApplicant = {
  id: string
  name: string
  email: string
  phone: string
  date: string
  currentStatus: string
  status: ApplicantStatus
  score: number | null
}

export default function ClientDashboardPage() {
  const CURRENT_COMPANY_ID = '7a58cc1b-9f81-4da5-ae2c-fd3abea05c33' // TODO: 認証実装後に動的取得
  const supabase = createClient()

  const [kpis, setKpis] = useState({ interviews: 0, avgDuration: 0, applicants: 0, used: 0, limit: 0 })
  const [recentApplicants, setRecentApplicants] = useState<DashboardApplicant[]>([])
  const [dataLoading, setDataLoading] = useState(true)

  useEffect(() => {
    async function fetchDashboardData() {
      setDataLoading(true)
      try {
        // 企業情報取得（面接枠）
        const { data: company } = await supabase
          .from('companies')
          .select('monthly_interview_count, monthly_interview_limit')
          .eq('id', CURRENT_COMPANY_ID)
          .single()

        // 今月の応募者数取得
        const now = new Date()
        const firstDayOfMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
        const { data: monthlyApplicants, count: applicantCount } = await supabase
          .from('applicants')
          .select('id', { count: 'exact', head: true })
          .eq('company_id', CURRENT_COMPANY_ID)
          .gte('created_at', firstDayOfMonth)

        // 直近の応募者5件取得
        const { data: recent } = await supabase
          .from('applicants')
          .select('id, last_name, first_name, email, phone_number, created_at, selection_status, interview_score')
          .eq('company_id', CURRENT_COMPANY_ID)
          .order('created_at', { ascending: false })
          .limit(5)

        setKpis({
          interviews: company?.monthly_interview_count || 0,
          avgDuration: 22, // TODO: 面接実装後に実データから算出
          applicants: applicantCount || 0,
          used: company?.monthly_interview_count || 0,
          limit: company?.monthly_interview_limit || 0,
        })

        if (recent && recent.length > 0) {
          const mappedApplicants = recent.map((a: any) => ({
            id: a.id,
            name: `${a.last_name || ''} ${a.first_name || ''}`.trim() || '名前未設定',
            email: a.email || '',
            phone: a.phone_number || '',
            date: a.created_at ? new Date(a.created_at).toLocaleString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '',
            currentStatus: a.selection_status === 'pending' ? 'preparing' : 'completed',
            status: a.selection_status === 'considering' ? 'considering' as const
              : a.selection_status === 'second_pass' ? 'second_pass' as const
              : a.selection_status === 'rejected' ? 'rejected' as const
              : null,
            score: a.interview_score || null,
          }))
          setRecentApplicants(mappedApplicants)
          setApplicants(mappedApplicants)
        } else {
          // デモ用サンプルデータ（実際の応募者が登録されると自動的に実データに切り替わります）
          const demoApplicants = [
            { id: 'demo-1', name: '山田 太郎', date: '2025-02-15', job: '営業職', status: null, duration: '15:32' },
            { id: 'demo-2', name: '佐藤 美咲', date: '2025-02-14', job: 'エンジニア', status: 'passed', duration: '18:45' },
            { id: 'demo-3', name: '鈴木 健一', date: '2025-02-13', job: '事務職', status: 'failed', duration: '12:20' },
            { id: 'demo-4', name: '田中 あかり', date: '2025-02-12', job: 'マーケティング', status: null, duration: '20:10' },
            { id: 'demo-5', name: '高橋 翔太', date: '2025-02-11', job: 'カスタマーサポート', status: 'passed', duration: '16:55' },
          ]
          const mappedDemoApplicants = demoApplicants.map((demo) => ({
            id: demo.id,
            name: demo.name,
            email: `${demo.name.toLowerCase().replace(/\s+/g, '.')}@example.com`,
            phone: '090-0000-0000',
            date: demo.date,
            currentStatus: 'completed',
            status: demo.status === 'passed' ? 'second_pass' as const : demo.status === 'failed' ? 'rejected' as const : null,
            score: demo.status === 'passed' ? 85 : demo.status === 'failed' ? 55 : null,
          }))
          setRecentApplicants(mappedDemoApplicants)
          setApplicants(mappedDemoApplicants)
        }
      } catch (err) {
        console.error('ダッシュボードデータ取得エラー:', err)
      }
      setDataLoading(false)
    }
    fetchDashboardData()
  }, [])

  const { templates } = useTemplates()
  const [applicants, setApplicants] = useState<DashboardApplicant[]>([])
  const [mailModalOpen, setMailModalOpen] = useState(false)
  const [statusDropdownApplicantId, setStatusDropdownApplicantId] = useState<string | null>(null)
  const [statusToast, setStatusToast] = useState(false)
  const [mailSelectedIds, setMailSelectedIds] = useState<Set<string>>(new Set())
  const [mailTemplateId, setMailTemplateId] = useState('')
  const [mailBody, setMailBody] = useState('')
  const [mailToast, setMailToast] = useState(false)
  const sendListRef = useRef<HTMLDivElement>(null)
  const [sendListShowFade, setSendListShowFade] = useState(false)

  useEffect(() => {
    if (!mailModalOpen) return
    const run = () => {
      const el = sendListRef.current
      if (!el) return
      const hasOverflow = el.scrollHeight > el.clientHeight
      const isAtBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 2
      setSendListShowFade(hasOverflow && !isAtBottom)
    }
    const t = setTimeout(run, 50)
    return () => clearTimeout(t)
  }, [mailModalOpen, mailSelectedIds])

  const openMailModal = (ids: Set<string>) => {
    setMailSelectedIds(ids)
    setMailModalOpen(true)
    setMailTemplateId(templates[0]?.id ?? '')
    const tmpl = templates[0]
    if (tmpl) setMailBody(tmpl.body)
    else setMailBody('')
  }

  const closeMailModal = () => {
    setMailModalOpen(false)
    setMailSelectedIds(new Set())
    setMailTemplateId('')
  }

  const handleMailTemplateChange = (id: string) => {
    setMailTemplateId(id)
    const tmpl = templates.find((t: Template) => t.id === id)
    if (tmpl) setMailBody(tmpl.body)
  }

  const handleMailSend = () => {
    // TODO: Resend APIでメール送信を実装
    setMailToast(true)
    setTimeout(() => setMailToast(false), 2000)
    closeMailModal()
  }

  const mailSelectedApplicants = useMemo(() => {
    return applicants.filter((a) => mailSelectedIds.has(a.id))
  }, [mailSelectedIds, applicants])

  const handleStatusUpdate = async (applicantId: string, newStatus: ApplicantStatus) => {
    console.log('handleStatusUpdate called:', { applicantId, newStatus })
    const dbStatus = newStatus === null ? 'pending' : newStatus
    
    // デモデータの場合はSupabase更新をスキップ
    if (!applicantId.startsWith('demo-')) {
      try {
        await supabase
          .from('applicants')
          .update({ selection_status: dbStatus, updated_at: new Date().toISOString() })
          .eq('id', applicantId)
      } catch (err) {
        console.error('ステータス更新エラー:', err)
      }
    }
    
    // applicantsとrecentApplicantsの両方を更新
    setApplicants((prev) => {
      const updated = prev.map((a) => (a.id === applicantId ? { ...a, status: newStatus } : a))
      console.log('applicants updated:', updated)
      return updated
    })
    
    setRecentApplicants((prev) => {
      const updated = prev.map((a) => (a.id === applicantId ? { ...a, status: newStatus } : a))
      console.log('recentApplicants updated:', updated)
      return updated
    })
    
    setStatusDropdownApplicantId(null)
    setStatusToast(true)
    setTimeout(() => setStatusToast(false), 2000)
  }

  const selectedTemplate = templates.find((t: Template) => t.id === mailTemplateId)

  const checkSendListFade = () => {
    const el = sendListRef.current
    if (!el) return
    const hasOverflow = el.scrollHeight > el.clientHeight
    const isAtBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 2
    setSendListShowFade(hasOverflow && !isAtBottom)
  }

  return (
    <div className="space-y-6">
        <div>
          <h1 className="text-xl font-bold text-slate-900">ダッシュボード</h1>
          <p className="text-sm text-slate-500 mt-0.5">採用活動の概要を確認できます</p>
        </div>

        {/* KPIカード */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm hover:shadow-md transition-shadow">
            <p className="text-xs font-medium text-slate-500 mb-1">今月の面接数</p>
            <p className="text-2xl font-bold text-slate-900">
              {dataLoading ? '...' : kpis.interviews}<span className="text-base font-normal text-slate-500 ml-1">件</span>
            </p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm hover:shadow-md transition-shadow">
            <p className="text-xs font-medium text-slate-500 mb-1">平均面接時間</p>
            <p className="text-2xl font-bold text-slate-900">
              {dataLoading ? '...' : kpis.avgDuration}<span className="text-base font-normal text-slate-500 ml-1">分</span>
            </p>
            <p className="text-xs text-slate-400 mt-0.5">※ 面接機能実装後に実データ反映</p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm hover:shadow-md transition-shadow">
            <p className="text-xs font-medium text-slate-500 mb-1">今月の応募者数</p>
            <p className="text-2xl font-bold text-slate-900">
              {dataLoading ? '...' : kpis.applicants}<span className="text-base font-normal text-slate-500 ml-1">名</span>
            </p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm hover:shadow-md transition-shadow">
            <p className="text-xs font-medium text-slate-500 mb-1">プラン利用状況</p>
            <p className="text-2xl font-bold text-slate-900">
              {dataLoading ? '...' : `${kpis.used}/${kpis.limit}`}<span className="text-base font-normal text-slate-500 ml-1">件</span>
            </p>
          </div>
        </div>

        {/* 直近の応募者 */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-4 py-4 border-b border-slate-200 flex items-center justify-between">
            <h2 className="text-base font-semibold text-slate-900">直近の応募者</h2>
            <Link
              href="/client/applicants"
              className="text-sm font-medium text-blue-600 hover:text-blue-700 flex items-center gap-1"
            >
              一覧を見る
              <ChevronRightIcon className="w-4 h-4" />
            </Link>
          </div>
          {/* デスクトップ: テーブル */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full min-w-[600px] text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">応募者名</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">面接日時</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">現在状況</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">点数・推薦度</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">結果</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {applicants.map((a) => (
                  <tr key={a.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-4 py-3 text-sm font-medium text-slate-900">{a.name}</td>
                    <td className="px-4 py-3 text-sm text-slate-600">{a.date}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${
                          a.currentStatus === 'preparing' ? 'bg-gray-100 text-gray-600' : 'bg-green-100 text-green-600'
                        }`}
                      >
                        {a.currentStatus === 'preparing' ? '準備中' : '完了'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600">
                      {a.currentStatus === 'preparing' ? (
                        ''
                      ) : a.score != null ? (
                        <span className="inline-flex items-center gap-1.5">
                          {a.score}点
                          <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold ${
                            scoreToGrade(a.score) === 'A' ? 'bg-emerald-500 text-white' :
                            scoreToGrade(a.score) === 'B' ? 'bg-sky-500 text-white' :
                            scoreToGrade(a.score) === 'C' ? 'bg-amber-500 text-white' : 'bg-rose-500 text-white'
                          }`}>
                            {scoreToGrade(a.score)}
                          </span>
                        </span>
                      ) : ''}
                    </td>
                    <td className="px-4 py-3">
                      {a.currentStatus === 'preparing' ? (
                        <span className="text-slate-400">-</span>
                      ) : (
                        <div className="relative inline-block">
                          <button
                            type="button"
                            onClick={() => setStatusDropdownApplicantId(statusDropdownApplicantId === a.id ? null : a.id)}
                            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium cursor-pointer hover:opacity-90 transition-opacity ${
                              a.status == null ? 'bg-gray-100 text-gray-600' :
                              a.status === 'considering' ? 'bg-orange-100 text-orange-600' :
                              a.status === 'second_pass' ? 'bg-blue-100 text-blue-600' : 'bg-red-100 text-red-600'
                            }`}
                          >
                            {a.status == null ? '未対応' : a.status === 'considering' ? '検討中' : a.status === 'second_pass' ? '二次通過' : '不採用'}
                            <ChevronDownIcon className="w-3.5 h-3.5" />
                          </button>
                          {statusDropdownApplicantId === a.id && (
                            <>
                              <div 
                                className="fixed inset-0 z-[50]" 
                                onClick={() => setStatusDropdownApplicantId(null)} 
                              />
                              <div className="absolute left-0 top-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg z-[60] min-w-[120px] py-1">
                                <button onClick={() => handleStatusUpdate(a.id, null)} className="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">未対応</button>
                                <button onClick={() => handleStatusUpdate(a.id, 'considering')} className="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">検討中</button>
                                <button onClick={() => handleStatusUpdate(a.id, 'second_pass')} className="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">二次通過</button>
                                <button onClick={() => handleStatusUpdate(a.id, 'rejected')} className="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">不採用</button>
                              </div>
                            </>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <a
                          href={`tel:${a.phone}`}
                          className="p-2 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          title="電話"
                        >
                          <PhoneIcon className="w-4 h-4" />
                        </a>
                        <button
                          type="button"
                          onClick={() => openMailModal(new Set([a.id]))}
                          className="p-2 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          title="メール"
                        >
                          <MailIcon className="w-4 h-4" />
                        </button>
                        <Link
                          href={`/client/applicants/${a.id}`}
                          className="inline-flex items-center px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-medium rounded-lg transition-colors"
                        >
                          詳細
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* モバイル: カード表示 */}
          <div className="md:hidden divide-y divide-slate-100">
            {applicants.map((a) => (
              <div key={a.id} className="p-3 sm:p-4 space-y-2">
                <p className="text-sm font-medium text-slate-900">{a.name}</p>
                <p className="text-xs text-slate-500">{a.date}</p>
                <div className="flex flex-wrap gap-2 text-xs">
                  <span className={`inline-flex px-2 py-0.5 rounded-full font-medium ${
                    a.currentStatus === 'preparing' ? 'bg-gray-100 text-gray-600' : 'bg-green-100 text-green-600'
                  }`}>
                    {a.currentStatus === 'preparing' ? '準備中' : '完了'}
                  </span>
                  {a.currentStatus === 'completed' && a.score != null && (
                    <span className="inline-flex items-center gap-1">
                      {a.score}点
                      <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-xs font-bold ${
                        scoreToGrade(a.score) === 'A' ? 'bg-emerald-500 text-white' :
                        scoreToGrade(a.score) === 'B' ? 'bg-sky-500 text-white' :
                        scoreToGrade(a.score) === 'C' ? 'bg-amber-500 text-white' : 'bg-rose-500 text-white'
                      }`}>
                        {scoreToGrade(a.score)}
                      </span>
                    </span>
                  )}
                  {a.currentStatus === 'completed' && (
                    <div className="relative inline-block">
                      <button
                        type="button"
                        onClick={() => setStatusDropdownApplicantId(statusDropdownApplicantId === a.id ? null : a.id)}
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-medium text-xs cursor-pointer hover:opacity-90 ${
                          a.status == null ? 'bg-gray-100 text-gray-600' :
                          a.status === 'considering' ? 'bg-orange-100 text-orange-600' :
                          a.status === 'second_pass' ? 'bg-blue-100 text-blue-600' : 'bg-red-100 text-red-600'
                        }`}
                      >
                        {a.status == null ? '未対応' : a.status === 'considering' ? '検討中' : a.status === 'second_pass' ? '二次通過' : '不採用'}
                        <ChevronDownIcon className="w-3.5 h-3.5" />
                      </button>
                      {statusDropdownApplicantId === a.id && (
                        <>
                          <div 
                            className="fixed inset-0 z-[50]" 
                            onClick={() => setStatusDropdownApplicantId(null)} 
                          />
                          <div className="absolute left-0 top-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg z-[60] min-w-[120px] py-1">
                            <button onClick={() => handleStatusUpdate(a.id, null)} className="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">未対応</button>
                            <button onClick={() => handleStatusUpdate(a.id, 'considering')} className="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">検討中</button>
                            <button onClick={() => handleStatusUpdate(a.id, 'second_pass')} className="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">二次通過</button>
                            <button onClick={() => handleStatusUpdate(a.id, 'rejected')} className="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">不採用</button>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-1 pt-1">
                  <a href={`tel:${a.phone}`} className="p-2 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg">
                    <PhoneIcon className="w-4 h-4" />
                  </a>
                  <button type="button" onClick={() => openMailModal(new Set([a.id]))} className="p-2 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg">
                    <MailIcon className="w-4 h-4" />
                  </button>
                  <Link href={`/client/applicants/${a.id}`} className="inline-flex items-center px-2.5 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-medium rounded-lg">
                    詳細
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* メール送信モーダル */}
      {mailModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={closeMailModal} aria-hidden />
          <div className="relative bg-white rounded-2xl shadow-xl border border-gray-200 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <h3 className="text-lg font-bold text-gray-900 mb-6">メール送信</h3>

              {/* ステップ1: テンプレート選択 */}
              <div className="mb-6">
                <label className="block text-sm font-semibold text-gray-700 mb-2">テンプレート選択</label>
                <select
                  value={mailTemplateId}
                  onChange={(e) => handleMailTemplateChange(e.target.value)}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-xl bg-white text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
                >
                  {templates.map((t: Template) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* 送信対象一覧 */}
              <div className="mb-6">
                <p className="text-sm font-semibold text-gray-700 mb-2">
                  送信先（<span className="text-blue-600 font-semibold">{mailSelectedApplicants.length}</span>名）
                </p>
                <div className="relative rounded-xl border border-gray-200 bg-slate-50/50 overflow-hidden">
                  <div
                    ref={sendListRef}
                    onScroll={checkSendListFade}
                    className="p-4 max-h-32 overflow-y-auto"
                  >
                    <ul className="text-sm">
                      {mailSelectedApplicants.map((a) => (
                        <li key={a.id} className="flex justify-between py-1.5">
                          <span className="font-medium text-gray-800">{a.name}</span>
                          <span className="text-gray-600">{a.email}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  {sendListShowFade && (
                    <div
                      className="absolute bottom-0 left-0 right-0 h-4 bg-gradient-to-t from-white to-transparent pointer-events-none"
                      aria-hidden
                    />
                  )}
                </div>
              </div>

              {/* ステップ2: プレビュー */}
              <div className="mb-6">
                <p className="text-sm font-semibold text-gray-700 mb-2">プレビュー</p>
                <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-4">
                  {selectedTemplate && (
                    <>
                      <div>
                        <p className="text-xs text-gray-500 mb-1">件名</p>
                        <p className="text-sm font-medium text-gray-800">{selectedTemplate.subject}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 mb-2">本文</p>
                        {mailSelectedApplicants.length === 1 ? (
                          <>
                            <p className="text-sm text-gray-600 whitespace-pre-wrap mb-3">
                              {mailSelectedApplicants[0].name} 様
                              {'\n'}この度はご応募いただきありがとうございます。
                            </p>
                            <textarea
                              value={mailBody.replace(/\{\{応募者名\}\}/g, mailSelectedApplicants[0].name)}
                              onChange={(e) =>
                                setMailBody(e.target.value.split(mailSelectedApplicants[0].name).join('{{応募者名}}'))
                              }
                              rows={8}
                              className="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30 resize-none"
                            />
                          </>
                        ) : (
                          <>
                            <div className="bg-yellow-50 border border-yellow-300 rounded-lg p-4 mb-3">
                              <p className="text-sm text-yellow-800">
                                応募者様ごとのお名前は自動で記載されますが、テンプレート文章の追加・変更はできません。本当に送信してもよろしいでしょうか？
                              </p>
                            </div>
                            <div className="max-h-64 overflow-y-auto space-y-4 border border-slate-200 rounded-xl divide-y divide-slate-200">
                              {mailSelectedApplicants.map((a, idx) => (
                                <div key={a.id} className="p-4 first:pt-4">
                                  <p className="text-xs font-semibold text-slate-500 mb-2">
                                    {idx + 1}通目: {a.name} 様
                                  </p>
                                  <p className="text-sm text-gray-600 whitespace-pre-wrap mb-2">
                                    {a.name} 様
                                    {'\n'}この度はご応募いただきありがとうございます。
                                  </p>
                                  <p className="text-sm text-gray-700 whitespace-pre-wrap">
                                    {mailBody.replace(/\{\{応募者名\}\}/g, a.name)}
                                  </p>
                                </div>
                              ))}
                            </div>
                          </>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* ステップ3: 送信確認 */}
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={handleMailSend}
                  className="flex-1 px-4 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                >
                  送信する
                </button>
                <button
                  type="button"
                  onClick={closeMailModal}
                  className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 text-sm font-medium rounded-xl hover:bg-gray-50"
                >
                  キャンセル
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 結果更新トースト */}
      {statusToast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[60] px-6 py-3 bg-gray-900 text-white text-sm font-medium rounded-xl shadow-lg">
          結果を更新しました
        </div>
      )}

      {/* メール送信成功トースト */}
      {mailToast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[60] px-6 py-3 bg-gray-900 text-white text-sm font-medium rounded-xl shadow-lg">
          メールを送信しました
        </div>
      )}
      </div>
  )
}
