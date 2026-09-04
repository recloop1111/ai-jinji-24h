'use client'

import { useEffect, useState } from 'react'
import { companyRoleLabel, memberStatusLabel, MAX_FULL_NAME_LENGTH } from '@/lib/members/member-view'

type Member = {
  id: string
  full_name: string | null
  email: string | null
  company_role: string
  status: string
  joined_at: string | null
  invited_at: string | null
  last_login_at: string | null
  is_self: boolean
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())}`
}

// 企業メンバー一覧（設定 > メンバー管理）。E-5-3-1: 一覧表示 ＋ 本人の表示名編集のみ。
//   招待 / role 変更 / suspend / remove は未実装のため button を出さない（fake UI にしない）。
export default function MembersTab() {
  const [members, setMembers] = useState<Member[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)

  const [editing, setEditing] = useState(false)
  const [nameInput, setNameInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [savedToast, setSavedToast] = useState(false)

  async function fetchMembers(): Promise<Member[] | null> {
    try {
      const res = await fetch('/api/client/members', { cache: 'no-store' })
      if (!res.ok) return null
      const json = await res.json().catch(() => null)
      return Array.isArray(json?.members) ? (json.members as Member[]) : []
    } catch {
      return null
    }
  }

  // 初回ロード（effect 内で同期 setState しない＝await 後にのみ state 更新）。
  useEffect(() => {
    let alive = true
    ;(async () => {
      const m = await fetchMembers()
      if (!alive) return
      if (m === null) setLoadError(true)
      else setMembers(m)
      setLoading(false)
    })()
    return () => { alive = false }
  }, [])

  // 保存後の再取得（イベントハンドラから呼ぶ）。
  async function reload() {
    const m = await fetchMembers()
    if (m === null) { setLoadError(true) } else { setMembers(m); setLoadError(false) }
  }

  const self = members.find((m) => m.is_self) ?? null

  function startEdit() {
    setNameInput(self?.full_name ?? '')
    setSaveError('')
    setEditing(true)
  }

  async function saveName() {
    if (saving) return
    const trimmed = nameInput.trim()
    if (trimmed.length === 0) { setSaveError('表示名を入力してください'); return }
    if (trimmed.length > MAX_FULL_NAME_LENGTH) { setSaveError(`表示名は${MAX_FULL_NAME_LENGTH}文字以内で入力してください`); return }
    setSaving(true)
    setSaveError('')
    try {
      const res = await fetch('/api/client/members/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ full_name: trimmed }),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok || !json || typeof json.full_name !== 'string') {
        setSaveError('表示名を保存できませんでした。時間をおいて再度お試しください。')
        return
      }
      setEditing(false)
      setSavedToast(true)
      setTimeout(() => setSavedToast(false), 2500)
      await reload()
    } catch {
      setSaveError('表示名を保存できませんでした。時間をおいて再度お試しください。')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
      <div className="mb-4">
        <h2 className="text-base font-bold text-slate-900">メンバー管理</h2>
        <p className="mt-1 text-sm text-slate-500">この企業に所属するメンバーの一覧です。招待・権限変更は今後追加されます。</p>
      </div>

      {/* 本人の表示名設定 */}
      {self && (
        <div className="mb-6 rounded-lg border border-slate-200 bg-slate-50/60 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-semibold text-slate-500">あなたの表示名</p>
              {editing ? (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <input
                    type="text"
                    value={nameInput}
                    onChange={(e) => setNameInput(e.target.value)}
                    maxLength={MAX_FULL_NAME_LENGTH}
                    placeholder="例: 山田 太郎"
                    className="px-3 py-2 border border-slate-200 bg-white text-slate-800 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
                  />
                  <button
                    type="button"
                    onClick={saveName}
                    disabled={saving}
                    className="px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {saving ? '保存中…' : '保存'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditing(false)}
                    disabled={saving}
                    className="px-3 py-2 text-sm text-slate-600 hover:text-slate-900"
                  >
                    キャンセル
                  </button>
                </div>
              ) : (
                <p className="mt-1 text-sm text-slate-800">{self.full_name ? self.full_name : <span className="text-slate-400">未設定</span>}</p>
              )}
              {saveError && <p className="mt-1 text-sm text-red-600">{saveError}</p>}
            </div>
            {!editing && (
              <button type="button" onClick={startEdit} className="shrink-0 px-4 py-2 border border-slate-200 text-sm font-medium text-slate-700 rounded-lg hover:bg-white">
                表示名を編集
              </button>
            )}
          </div>
        </div>
      )}

      {loading ? (
        <div className="py-10 text-center text-sm text-slate-500">読み込み中...</div>
      ) : loadError ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">メンバーの取得に失敗しました。時間をおいて再度お試しください。</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs font-semibold text-slate-500 border-b border-slate-200">
                <th className="py-2.5 pr-4">氏名</th>
                <th className="py-2.5 pr-4">メールアドレス</th>
                <th className="py-2.5 pr-4">権限</th>
                <th className="py-2.5 pr-4">状態</th>
                <th className="py-2.5 pr-4">参加日</th>
                <th className="py-2.5">操作</th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.id} className="border-b border-slate-100">
                  <td className="py-3 pr-4 text-slate-800">
                    {m.full_name ? m.full_name : <span className="text-slate-400">未設定</span>}
                    {m.is_self && <span className="ml-2 text-xs text-slate-400">(あなた)</span>}
                  </td>
                  <td className="py-3 pr-4 text-slate-600">{m.email ?? '—'}</td>
                  <td className="py-3 pr-4">
                    <span className="inline-flex items-center gap-1.5">
                      {m.company_role === 'owner' && (
                        <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">オーナー</span>
                      )}
                      {m.company_role !== 'owner' && <span className="text-slate-700">{companyRoleLabel(m.company_role)}</span>}
                    </span>
                  </td>
                  <td className="py-3 pr-4">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                      m.status === 'active' ? 'bg-green-100 text-green-700'
                      : m.status === 'suspended' ? 'bg-amber-100 text-amber-700'
                      : 'bg-slate-100 text-slate-500'
                    }`}>
                      {memberStatusLabel(m.status)}
                    </span>
                  </td>
                  <td className="py-3 pr-4 text-slate-600">{formatDate(m.joined_at)}</td>
                  <td className="py-3 text-slate-400">
                    {/* E-5-3-1: 本人の表示名編集は上部カード。行単位の role/suspend/remove は未実装のため出さない。 */}
                    —
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {savedToast && (
        <div className="fixed bottom-6 right-6 bg-emerald-600 text-white px-5 py-3 rounded-xl shadow-lg text-sm font-medium z-50">表示名を保存しました</div>
      )}
    </div>
  )
}
