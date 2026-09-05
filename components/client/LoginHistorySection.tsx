'use client'

import { useEffect, useState } from 'react'

type LoginHistoryItem = {
  id: string
  user_id: string | null
  full_name: string | null
  role: string | null
  email: string | null
  ip_address: string | null
  success: boolean
  failure_reason: string | null
  created_at: string | null
}

const ROLE_LABEL: Record<string, string> = { owner: 'オーナー', admin: '管理者', recruiter: '採用担当', viewer: '閲覧者' }
const REASON_LABEL: Record<string, string> = { auth_failed: '認証失敗', role_mismatch: '権限不一致', rate_limited: '試行回数超過' }

function fmt(iso: string | null): string {
  if (!iso) return '—'
  const t = new Date(iso).getTime()
  if (!Number.isFinite(t)) return '—'
  const d = new Date(t + 9 * 60 * 60 * 1000)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getUTCFullYear()}/${p(d.getUTCMonth() + 1)}/${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`
}

// 設定 > セキュリティ > ログイン履歴（audit.read=OWNER/ADMIN のみ・親でタブ gate）。
//   既存 login_attempts を server API 経由で表示（誰が・いつ・成否）。server-side pagination。
export default function LoginHistorySection() {
  const [items, setItems] = useState<LoginHistoryItem[]>([])
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(false)
  const [refreshTick, setRefreshTick] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)

  useEffect(() => {
    let alive = true
    ;(async () => {
      await Promise.resolve()
      if (!alive) return
      setLoading(true)
      try {
        const res = await fetch(`/api/client/login-history?page=${page}`, { cache: 'no-store' })
        if (!alive) return
        if (!res.ok) { setLoadError(true); setLoading(false); return }
        const json = await res.json().catch(() => null)
        if (!alive) return
        if (!json || !Array.isArray(json.items)) { setLoadError(true) }
        else { setItems(json.items as LoginHistoryItem[]); setHasMore(json.has_more === true); setLoadError(false) }
      } catch {
        if (alive) setLoadError(true)
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => { alive = false }
  }, [page, refreshTick])

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-slate-900">ログイン履歴</h2>
          <p className="mt-1 text-sm text-slate-500">この企業のメンバーによるログインの記録（成功・失敗）を確認できます。</p>
        </div>
        <button type="button" onClick={() => setRefreshTick((t) => t + 1)} disabled={loading} className="shrink-0 rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60">更新</button>
      </div>

      {loading ? (
        <div className="py-10 text-center text-sm text-slate-500">読み込み中...</div>
      ) : loadError ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">ログイン履歴を取得できませんでした。時間をおいて再度お試しください。</div>
      ) : items.length === 0 ? (
        <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-8 text-center">
          <p className="text-sm font-medium text-slate-700">ログイン履歴はまだありません</p>
          <p className="mt-1 text-xs text-slate-500">メンバーがログインすると、ここに記録されます。</p>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs font-semibold text-slate-500 border-b border-slate-200">
                  <th className="py-2.5 pr-4 whitespace-nowrap">日時</th>
                  <th className="py-2.5 pr-4 whitespace-nowrap">ユーザー</th>
                  <th className="py-2.5 pr-4 whitespace-nowrap">権限</th>
                  <th className="py-2.5 pr-4 whitespace-nowrap">結果</th>
                  <th className="py-2.5 whitespace-nowrap">IPアドレス</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it) => (
                  <tr key={it.id} className="border-b border-slate-100 align-top">
                    <td className="py-3 pr-4 whitespace-nowrap text-slate-600">{fmt(it.created_at)}</td>
                    <td className="py-3 pr-4 whitespace-nowrap text-slate-800">{it.full_name || it.email || '—'}</td>
                    <td className="py-3 pr-4 whitespace-nowrap text-slate-500">{it.role ? (ROLE_LABEL[it.role] ?? it.role) : '—'}</td>
                    <td className="py-3 pr-4 whitespace-nowrap">
                      {it.success ? (
                        <span className="inline-flex items-center rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200 px-2 py-0.5 text-xs font-medium">成功</span>
                      ) : (
                        <span className="inline-flex items-center rounded-full bg-slate-100 text-slate-600 border border-slate-200 px-2 py-0.5 text-xs font-medium">失敗{it.failure_reason ? `（${REASON_LABEL[it.failure_reason] ?? it.failure_reason}）` : ''}</span>
                      )}
                    </td>
                    <td className="py-3 whitespace-nowrap text-slate-500">{it.ip_address || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {(page > 1 || hasMore) && (
            <div className="mt-4 flex items-center justify-end gap-2">
              <button type="button" disabled={loading || page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40">前へ</button>
              <span className="px-2 py-1.5 text-xs text-slate-500">{page}</span>
              <button type="button" disabled={loading || !hasMore} onClick={() => setPage((p) => p + 1)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40">次へ</button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
