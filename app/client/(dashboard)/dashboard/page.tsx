'use client'

import { useState, useMemo, useRef, useEffect } from 'react'
import Link from 'next/link'
import { useTemplates, type Template } from '../../contexts/TemplatesContext'
import { ChevronRight as ChevronRightIcon, Phone as PhoneIcon, Mail as MailIcon } from 'lucide-react'

// TODO: 実データに差替え
const KPIS = [
  { label: '今月の面接数', value: '24', unit: '件' },
  { label: '平均面接時間', value: '22', unit: '分' },
  { label: '今月の応募者数', value: '35', unit: '名' },
  { label: 'プラン利用状況', value: '24/30', unit: '件' },
]

// currentStatus: preparing=準備中(システム), completed=完了(システム)
// status: considering=検討中, second_pass=二次通過, rejected=不採用(企業担当者が手動管理)
// TODO: Phase 4 - Supabaseから応募者の連絡先を取得
const RECENT_APPLICANTS = [
  { id: '1', name: '山田 太郎', email: 'yamada@example.com', phone: '090-1234-5678', date: '2025-02-14 14:30', currentStatus: 'completed', status: 'second_pass', score: 85 },
  { id: '2', name: '佐藤 花子', email: 'sato@example.com', phone: '080-2345-6789', date: '2025-02-14 11:00', currentStatus: 'preparing', status: null, score: null },
  { id: '3', name: '鈴木 一郎', email: 'suzuki@example.com', phone: '070-3456-7890', date: '2025-02-13 16:00', currentStatus: 'completed', status: 'considering', score: 78 },
  { id: '4', name: '田中 美咲', email: 'tanaka@example.com', phone: '090-4567-8901', date: '2025-02-13 10:30', currentStatus: 'preparing', status: null, score: null },
  { id: '5', name: '高橋 健太', email: 'takahashi@example.com', phone: '080-5678-9012', date: '2025-02-12 15:00', currentStatus: 'completed', status: 'rejected', score: 92 },
]


export default function ClientDashboardPage() {
  const { templates } = useTemplates()
  const [mailModalOpen, setMailModalOpen] = useState(false)
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
    return RECENT_APPLICANTS.filter((a) => mailSelectedIds.has(a.id))
  }, [mailSelectedIds])

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
          {KPIS.map((kpi, i) => (
            <div
              key={i}
              className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm hover:shadow-md transition-shadow"
            >
              <p className="text-xs font-medium text-slate-500 mb-1">{kpi.label}</p>
              <p className="text-2xl font-bold text-slate-900">
                {kpi.value}
                <span className="text-base font-normal text-slate-500 ml-1">{kpi.unit}</span>
              </p>
            </div>
          ))}
        </div>

        {/* 直近の応募者 */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-4 py-4 border-b border-slate-200 flex items-center justify-between">
            <h2 className="text-base font-semibold text-slate-900">直近の応募者</h2>
            <Link
              href="/client/applicants"
              className="text-sm font-medium text-indigo-600 hover:text-indigo-700 flex items-center gap-1"
            >
              一覧を見る
              <ChevronRightIcon className="w-4 h-4" />
            </Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px]">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">応募者名</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">面接日時</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">現在状況</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">スコア</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">ステータス</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {RECENT_APPLICANTS.map((a) => (
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
                      {a.currentStatus === 'preparing' ? '' : a.score}
                    </td>
                    <td className="px-4 py-3">
                      {a.currentStatus === 'preparing' ? (
                        <span className="text-slate-400">-</span>
                      ) : (
                        <span
                          className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${
                            a.status === 'considering'
                              ? 'bg-orange-100 text-orange-600'
                              : a.status === 'second_pass'
                                ? 'bg-blue-100 text-blue-600'
                                : 'bg-red-100 text-red-600'
                          }`}
                        >
                          {a.status === 'considering' ? '検討中' : a.status === 'second_pass' ? '二次通過' : '不採用'}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <a
                          href={`tel:${a.phone}`}
                          className="p-2 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                          title="電話"
                        >
                          <PhoneIcon className="w-4 h-4" />
                        </a>
                        <button
                          type="button"
                          onClick={() => openMailModal(new Set([a.id]))}
                          className="p-2 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                          title="メール"
                        >
                          <MailIcon className="w-4 h-4" />
                        </button>
                        <Link
                          href={`/client/applicants/${a.id}`}
                          className="inline-flex items-center px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-medium rounded-lg transition-colors"
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
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-xl bg-white text-gray-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400"
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
                              className="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/30 resize-none"
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
                  className="flex-1 px-4 py-2.5 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
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

      {/* メール送信成功トースト */}
      {mailToast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[60] px-6 py-3 bg-gray-900 text-white text-sm font-medium rounded-xl shadow-lg">
          メールを送信しました
        </div>
      )}
      </div>
  )
}
