'use client'

import { useEffect, useState } from 'react'
import { companyRoleLabel, memberStatusLabel, MAX_FULL_NAME_LENGTH } from '@/lib/members/member-view'
import { INVITABLE_ROLES, INVITE_ROLE_LABEL } from '@/lib/members/invite'

type Member = {
  id: string; full_name: string | null; email: string | null; company_role: string; status: string
  joined_at: string | null; invited_at: string | null; last_login_at: string | null; is_self: boolean
}
type PendingInvite = { id: string; email: string; company_role: string; status: string; expires_at: string | null; created_at: string | null }
type Issued = { email: string; url: string }

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())}`
}
function isExpired(iso: string | null): boolean {
  if (!iso) return true
  const t = new Date(iso).getTime()
  return Number.isNaN(t) || t <= Date.now()
}

// 設定 > メンバー管理（E-5-3-2A: v1 はメール送信なし＝招待リンク発行方式）。
//   一覧 ＋ 招待リンク発行 ＋ 再発行 ＋ 取消 ＋ 本人の表示名編集。role/status 変更・remove は E-5-3-3。
export default function MembersTab() {
  const [members, setMembers] = useState<Member[]>([])
  const [pending, setPending] = useState<PendingInvite[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [toast, setToast] = useState('')

  const [editing, setEditing] = useState(false)
  const [nameInput, setNameInput] = useState('')
  const [savingName, setSavingName] = useState(false)
  const [nameError, setNameError] = useState('')

  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<string>('viewer')
  const [inviting, setInviting] = useState(false)
  const [inviteError, setInviteError] = useState('')
  // 発行された招待リンク（平文 token を含む）。component memory のみ・保存しない・reload で失われる。
  const [issued, setIssued] = useState<Issued | null>(null)

  async function fetchAll(): Promise<{ members: Member[]; pending: PendingInvite[] } | null> {
    try {
      const res = await fetch('/api/client/members', { cache: 'no-store' })
      if (!res.ok) return null
      const json = await res.json().catch(() => null)
      return {
        members: Array.isArray(json?.members) ? (json.members as Member[]) : [],
        pending: Array.isArray(json?.pendingInvites) ? (json.pendingInvites as PendingInvite[]) : [],
      }
    } catch { return null }
  }

  useEffect(() => {
    let alive = true
    ;(async () => {
      const r = await fetchAll()
      if (!alive) return
      if (r === null) setLoadError(true)
      else { setMembers(r.members); setPending(r.pending) }
      setLoading(false)
    })()
    return () => { alive = false }
  }, [])

  async function reload() {
    const r = await fetchAll()
    if (r === null) { setLoadError(true) } else { setMembers(r.members); setPending(r.pending); setLoadError(false) }
  }

  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(''), 2500) }

  const self = members.find((m) => m.is_self) ?? null

  async function saveName() {
    if (savingName) return
    const trimmed = nameInput.trim()
    if (trimmed.length === 0) { setNameError('表示名を入力してください'); return }
    if (trimmed.length > MAX_FULL_NAME_LENGTH) { setNameError(`表示名は${MAX_FULL_NAME_LENGTH}文字以内で入力してください`); return }
    setSavingName(true); setNameError('')
    try {
      const res = await fetch('/api/client/members/me', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ full_name: trimmed }),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok || !json || typeof json.full_name !== 'string') { setNameError('表示名を保存できませんでした。時間をおいて再度お試しください。'); return }
      setEditing(false); showToast('表示名を保存しました'); await reload()
    } catch {
      setNameError('表示名を保存できませんでした。時間をおいて再度お試しください。')
    } finally { setSavingName(false) }
  }

  async function issueInvite() {
    if (inviting) return
    setInviteError('')
    const email = inviteEmail.trim()
    if (email.length === 0) { setInviteError('メールアドレスを入力してください'); return }
    setInviting(true)
    try {
      const res = await fetch('/api/client/members/invite', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, company_role: inviteRole }),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok || !json?.invited || typeof json.inviteUrl !== 'string') {
        setInviteError(json?.error?.message ?? '招待リンクを発行できませんでした。')
        return
      }
      setIssued({ email: json.invite?.email ?? email, url: json.inviteUrl })
      setInviteEmail('')
      await reload()
    } catch {
      setInviteError('招待リンクを発行できませんでした。')
    } finally { setInviting(false) }
  }

  async function regenerate(id: string) {
    try {
      const res = await fetch(`/api/client/members/invite/${id}/regenerate`, { method: 'POST' })
      const json = await res.json().catch(() => null)
      if (!res.ok || !json?.regenerated || typeof json.inviteUrl !== 'string') { showToast('リンクを再発行できませんでした'); return }
      setIssued({ email: json.invite?.email ?? '', url: json.inviteUrl })
      await reload()
    } catch { showToast('リンクを再発行できませんでした') }
  }

  async function revokeInvite(id: string) {
    try {
      const res = await fetch(`/api/client/members/invite/${id}`, { method: 'DELETE' })
      if (!res.ok) { showToast('招待を取り消せませんでした'); return }
      showToast('招待を取り消しました'); await reload()
    } catch { showToast('招待を取り消せませんでした') }
  }

  async function copyUrl(url: string) {
    try {
      await navigator.clipboard.writeText(url)
      showToast('招待リンクをコピーしました')
    } catch {
      // clipboard 不可時は fake success を出さない。URL は input から手動コピー可能。
      showToast('コピーできませんでした。リンクを選択してコピーしてください')
    }
  }

  return (
    <div className="space-y-6">
      {/* 招待リンク発行 */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
        <h2 className="text-base font-bold text-slate-900">メンバーを招待</h2>
        <p className="mt-1 text-sm text-slate-500">メールアドレスと権限を指定して招待リンクを発行し、招待する本人へ共有してください。招待された方はご自身で氏名とパスワードを設定します。</p>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1">
            <label htmlFor="inv-email" className="block text-xs font-semibold text-slate-500 mb-1">メールアドレス（ログインID）</label>
            <input id="inv-email" type="email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} placeholder="member@company.com"
              className="w-full rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-2 text-sm text-slate-800 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30" />
          </div>
          <div className="sm:w-40">
            <label htmlFor="inv-role" className="block text-xs font-semibold text-slate-500 mb-1">権限</label>
            <select id="inv-role" value={inviteRole} onChange={(e) => setInviteRole(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-2 text-sm text-slate-800 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30">
              {INVITABLE_ROLES.map((r) => (<option key={r} value={r}>{INVITE_ROLE_LABEL[r]}</option>))}
            </select>
          </div>
          <button type="button" onClick={issueInvite} disabled={inviting}
            className="shrink-0 rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60">
            {inviting ? '発行中…' : '招待リンクを発行'}
          </button>
        </div>
        {inviteError && <p className="mt-2 text-sm text-red-600">{inviteError}</p>}

        {/* 発行された招待リンク（memory のみ・reload で消える） */}
        {issued && (
          <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50/60 p-4">
            <p className="text-sm font-semibold text-slate-800">招待リンクを発行しました（{issued.email}）</p>
            <div className="mt-2 flex flex-col gap-2 sm:flex-row">
              <input readOnly value={issued.url} onFocus={(e) => e.currentTarget.select()}
                className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700" />
              <button type="button" onClick={() => copyUrl(issued.url)} className="shrink-0 rounded-lg bg-slate-800 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-900">リンクをコピー</button>
            </div>
            <ul className="mt-3 space-y-1 text-xs text-slate-500">
              <li>このリンクを招待する本人へ共有してください。</li>
              <li>リンクの有効期限は7日間です。</li>
              <li>メールアドレスはログインIDとして利用されます。入力内容に誤りがないかご確認ください。</li>
              <li>このリンクは再表示できません。必要な場合は「リンクを再発行」してください。</li>
            </ul>
          </div>
        )}
      </div>

      {/* メンバー一覧 */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
        <div className="mb-4">
          <h2 className="text-base font-bold text-slate-900">メンバー</h2>
          <p className="mt-1 text-sm text-slate-500">この企業に所属するメンバーの一覧です。権限の変更などは今後追加されます。</p>
        </div>

        {self && (
          <div className="mb-6 rounded-lg border border-slate-200 bg-slate-50/60 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-semibold text-slate-500">あなたの表示名</p>
                {editing ? (
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <input type="text" value={nameInput} onChange={(e) => setNameInput(e.target.value)} maxLength={MAX_FULL_NAME_LENGTH} placeholder="例: 山田 太郎"
                      className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30" />
                    <button type="button" onClick={saveName} disabled={savingName} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60">{savingName ? '保存中…' : '保存'}</button>
                    <button type="button" onClick={() => setEditing(false)} disabled={savingName} className="px-3 py-2 text-sm text-slate-600 hover:text-slate-900">キャンセル</button>
                  </div>
                ) : (
                  <p className="mt-1 text-sm text-slate-800">{self.full_name ? self.full_name : <span className="text-slate-400">未設定</span>}</p>
                )}
                {nameError && <p className="mt-1 text-sm text-red-600">{nameError}</p>}
              </div>
              {!editing && (
                <button type="button" onClick={() => { setNameInput(self.full_name ?? ''); setNameError(''); setEditing(true) }} className="shrink-0 rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-white">表示名を編集</button>
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
                  <th className="py-2.5 pr-4">氏名</th><th className="py-2.5 pr-4">メールアドレス</th><th className="py-2.5 pr-4">権限</th><th className="py-2.5 pr-4">状態</th><th className="py-2.5 pr-4">参加日</th><th className="py-2.5">操作</th>
                </tr>
              </thead>
              <tbody>
                {members.map((m) => (
                  <tr key={m.id} className="border-b border-slate-100">
                    <td className="py-3 pr-4 text-slate-800">{m.full_name ? m.full_name : <span className="text-slate-400">未設定</span>}{m.is_self && <span className="ml-2 text-xs text-slate-400">(あなた)</span>}</td>
                    <td className="py-3 pr-4 text-slate-600">{m.email ?? '—'}</td>
                    <td className="py-3 pr-4">{m.company_role === 'owner' ? <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">オーナー</span> : <span className="text-slate-700">{companyRoleLabel(m.company_role)}</span>}</td>
                    <td className="py-3 pr-4"><span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${m.status === 'active' ? 'bg-green-100 text-green-700' : m.status === 'suspended' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500'}`}>{memberStatusLabel(m.status)}</span></td>
                    <td className="py-3 pr-4 text-slate-600">{formatDate(m.joined_at)}</td>
                    <td className="py-3 text-slate-400">—</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 招待中（pending） */}
      {pending.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
          <h2 className="text-base font-bold text-slate-900">招待中</h2>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs font-semibold text-slate-500 border-b border-slate-200">
                  <th className="py-2.5 pr-4">メールアドレス</th><th className="py-2.5 pr-4">権限</th><th className="py-2.5 pr-4">有効期限</th><th className="py-2.5">操作</th>
                </tr>
              </thead>
              <tbody>
                {pending.map((p) => (
                  <tr key={p.id} className="border-b border-slate-100">
                    <td className="py-3 pr-4 text-slate-800">{p.email}</td>
                    <td className="py-3 pr-4 text-slate-700">{companyRoleLabel(p.company_role)}</td>
                    <td className="py-3 pr-4">
                      {isExpired(p.expires_at)
                        ? <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-500">期限切れ</span>
                        : <span className="text-slate-600">{formatDate(p.expires_at)}</span>}
                    </td>
                    <td className="py-3">
                      <div className="flex gap-2">
                        <button type="button" onClick={() => regenerate(p.id)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50">リンクを再発行</button>
                        <button type="button" onClick={() => revokeInvite(p.id)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50">招待を取消</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {toast && (<div className="fixed bottom-6 right-6 bg-emerald-600 text-white px-5 py-3 rounded-xl shadow-lg text-sm font-medium z-50">{toast}</div>)}
    </div>
  )
}
