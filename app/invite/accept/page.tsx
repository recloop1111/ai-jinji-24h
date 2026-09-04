'use client'

import { Suspense, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { MAX_FULL_NAME_LENGTH } from '@/lib/members/member-view'

function AcceptForm() {
  const token = useSearchParams().get('token') ?? ''

  const [fullName, setFullName] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  if (!token) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-lg font-bold text-slate-900">招待リンクが不正です</h1>
        <p className="mt-2 text-sm text-slate-600">お手元の招待メールのリンクを再度ご確認ください。</p>
      </div>
    )
  }

  if (done) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-lg font-bold text-slate-900">登録が完了しました</h1>
        <p className="mt-2 text-sm text-slate-600">設定したメールアドレスとパスワードでログインできます。</p>
        <Link href="/client/login" className="mt-5 inline-flex items-center justify-center rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700">
          ログインへ
        </Link>
      </div>
    )
  }

  async function submit() {
    if (submitting) return
    setError('')
    const name = fullName.trim()
    if (name.length === 0) { setError('お名前を入力してください'); return }
    if (name.length > MAX_FULL_NAME_LENGTH) { setError(`お名前は${MAX_FULL_NAME_LENGTH}文字以内で入力してください`); return }
    if (password.length < 8) { setError('パスワードは8文字以上で設定してください'); return }
    if (password !== confirm) { setError('パスワードが一致しません'); return }
    setSubmitting(true)
    try {
      const res = await fetch('/api/invite/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, full_name: name, password }),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok || !json?.accepted) {
        setError(json?.error?.message ?? '登録できませんでした。時間をおいて再度お試しください。')
        return
      }
      setDone(true)
    } catch {
      setError('登録できませんでした。時間をおいて再度お試しください。')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
      <h1 className="text-lg font-bold text-slate-900">アカウントの設定</h1>
      <p className="mt-1 text-sm text-slate-600">お名前とパスワードを設定して参加を完了してください。</p>

      <div className="mt-6 space-y-4">
        <div>
          <label htmlFor="acc-name" className="block text-sm font-medium text-slate-700 mb-1">お名前</label>
          <input id="acc-name" type="text" value={fullName} onChange={(e) => setFullName(e.target.value)} maxLength={MAX_FULL_NAME_LENGTH}
            placeholder="例: 山田 太郎"
            className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-2.5 text-sm text-slate-800 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30" />
        </div>
        <div>
          <label htmlFor="acc-pw" className="block text-sm font-medium text-slate-700 mb-1">パスワード（8文字以上）</label>
          <input id="acc-pw" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password"
            className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-2.5 text-sm text-slate-800 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30" />
        </div>
        <div>
          <label htmlFor="acc-pw2" className="block text-sm font-medium text-slate-700 mb-1">パスワード（確認）</label>
          <input id="acc-pw2" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password"
            className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-2.5 text-sm text-slate-800 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30" />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button type="button" onClick={submit} disabled={submitting}
          className="w-full rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60">
          {submitting ? '登録中…' : '登録して参加する'}
        </button>
      </div>
    </div>
  )
}

export default function InviteAcceptPage() {
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <span className="text-xl font-bold tracking-tight text-slate-900">AIMEN24</span>
        </div>
        <Suspense fallback={<div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 shadow-sm">読み込み中...</div>}>
          <AcceptForm />
        </Suspense>
      </div>
    </div>
  )
}
