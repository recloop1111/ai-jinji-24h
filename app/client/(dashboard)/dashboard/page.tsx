'use client'

import Link from 'next/link'
import { ChevronRight as ChevronRightIcon } from 'lucide-react'

// TODO: 実データに差替え
const KPIS = [
  { label: '今月の面接数', value: '24', unit: '件' },
  { label: '平均面接時間', value: '22', unit: '分' },
  { label: '今月の応募者数', value: '35', unit: '名' },
  { label: 'プラン利用状況', value: '24/30', unit: '件' },
]

// currentStatus: preparing=準備中(システム), completed=完了(システム)
// status: considering=検討中, second_pass=二次通過, rejected=不採用(企業担当者が手動管理)
// TODO: 実データに差替え
const RECENT_APPLICANTS = [
  { id: '1', name: '山田 太郎', date: '2025-02-14 14:30', currentStatus: 'completed', status: 'second_pass', score: 85 },
  { id: '2', name: '佐藤 花子', date: '2025-02-14 11:00', currentStatus: 'preparing', status: null, score: null },
  { id: '3', name: '鈴木 一郎', date: '2025-02-13 16:00', currentStatus: 'completed', status: 'considering', score: 78 },
  { id: '4', name: '田中 美咲', date: '2025-02-13 10:30', currentStatus: 'preparing', status: null, score: null },
  { id: '5', name: '高橋 健太', date: '2025-02-12 15:00', currentStatus: 'completed', status: 'rejected', score: 92 },
]


export default function ClientDashboardPage() {
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
                      <Link
                        href={`/client/applicants/${a.id}`}
                        className="inline-flex items-center px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-medium rounded-lg transition-colors"
                      >
                        詳細
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
  )
}
