'use client'

import { useEffect, useState } from 'react'
import { buildAuditSentence, auditActorName, auditActorRoleLabel, formatAuditDate, type AuditLogView } from '@/lib/audit/audit-view'

type Pagination = { page: number; limit: number; total: number; total_pages: number }

// 設定 > 操作ログ（audit.read=OWNER/ADMIN のみ・タブ自体が上位で gate）。
//   server-side pagination・成功時のみ表示更新・empty と error を区別・raw UUID/JSON は出さない。
export default function AuditLogsTab() {
  const [logs, setLogs] = useState<AuditLogView[]>([])
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 25, total: 0, total_pages: 1 })
  const [page, setPage] = useState(1)
  const [refreshTick, setRefreshTick] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)

  // fetch のみ（setState しない・純粋）。effect / handler の両方から使う。
  async function fetchLogs(p: number): Promise<{ logs: AuditLogView[]; pagination: Pagination } | null> {
    try {
      const res = await fetch(`/api/client/audit-logs?page=${p}&limit=25`, { cache: 'no-store' })
      if (!res.ok) return null
      const json = await res.json().catch(() => null)
      if (!json || !Array.isArray(json.logs)) return null
      return { logs: json.logs as AuditLogView[], pagination: (json.pagination ?? { page: p, limit: 25, total: json.logs.length, total_pages: 1 }) as Pagination }
    } catch {
      return null
    }
  }

  // 初回 / page / 更新 で再取得。setState は await 後のみ（同期 setState-in-effect を避ける）。
  useEffect(() => {
    let alive = true
    ;(async () => {
      await Promise.resolve()
      if (!alive) return
      setLoading(true)
      const r = await fetchLogs(page)
      if (!alive) return
      if (r === null) { setLoadError(true) } else { setLogs(r.logs); setPagination(r.pagination); setLoadError(false) }
      setLoading(false)
    })()
    return () => { alive = false }
  }, [page, refreshTick])

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-slate-900">操作ログ</h2>
          <p className="mt-1 text-sm text-slate-500">この企業で行われた重要な操作やデータ出力の履歴を確認できます。</p>
        </div>
        <button type="button" onClick={() => setRefreshTick((t) => t + 1)} disabled={loading} className="shrink-0 rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60">更新</button>
      </div>

      {loading ? (
        <div className="py-10 text-center text-sm text-slate-500">読み込み中...</div>
      ) : loadError ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">操作ログを取得できませんでした。時間をおいて再度お試しください。</div>
      ) : logs.length === 0 ? (
        <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-8 text-center">
          <p className="text-sm font-medium text-slate-700">操作ログはまだありません</p>
          <p className="mt-1 text-xs text-slate-500">PDFのダウンロードやメンバー管理などの操作が行われると、ここに記録されます。</p>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs font-semibold text-slate-500 border-b border-slate-200">
                  <th className="py-2.5 pr-4 whitespace-nowrap">日時</th>
                  <th className="py-2.5 pr-4 whitespace-nowrap">操作者</th>
                  <th className="py-2.5 pr-4 whitespace-nowrap">権限</th>
                  <th className="py-2.5">操作内容</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((l) => (
                  <tr key={l.id} className="border-b border-slate-100 align-top">
                    <td className="py-3 pr-4 whitespace-nowrap text-slate-600">{formatAuditDate(l.created_at)}</td>
                    <td className="py-3 pr-4 whitespace-nowrap text-slate-800">{auditActorName(l)}</td>
                    <td className="py-3 pr-4 whitespace-nowrap text-slate-500">{auditActorRoleLabel(l)}</td>
                    <td className="py-3 text-slate-800">{buildAuditSentence(l)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {pagination.total_pages > 1 && (
            <div className="mt-4 flex items-center justify-between">
              <span className="text-xs text-slate-500">{pagination.total}件中 {(pagination.page - 1) * pagination.limit + 1}–{Math.min(pagination.page * pagination.limit, pagination.total)}件</span>
              <div className="flex gap-2">
                <button type="button" disabled={loading || pagination.page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40">前へ</button>
                <span className="px-2 py-1.5 text-xs text-slate-500">{pagination.page} / {pagination.total_pages}</span>
                <button type="button" disabled={loading || pagination.page >= pagination.total_pages} onClick={() => setPage((p) => Math.min(pagination.total_pages, p + 1))} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40">次へ</button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
