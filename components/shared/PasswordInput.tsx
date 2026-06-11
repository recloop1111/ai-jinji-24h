'use client'

import { useState } from 'react'
import { Eye as EyeIcon, EyeOff as EyeOffIcon } from 'lucide-react'

type PasswordInputProps = {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
  id?: string
  autoFocus?: boolean
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void
  /** 目アイコンのカラー（テーマに合わせて指定。デフォルトはライト系） */
  iconClassName?: string
}

/**
 * パスワード入力欄 + 表示/非表示トグル（UIのみ）。
 * 初期状態は必ず非表示（type=password）。値・onChange・送信処理は呼び出し側のまま。
 */
export default function PasswordInput({
  value,
  onChange,
  placeholder,
  className = '',
  id,
  autoFocus,
  onKeyDown,
  iconClassName = 'text-slate-400 hover:text-slate-600',
}: PasswordInputProps) {
  const [show, setShow] = useState(false)
  return (
    <div className="relative">
      <input
        id={id}
        type={show ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        autoFocus={autoFocus}
        placeholder={placeholder}
        className={`${className} pr-10`}
      />
      <button
        type="button"
        tabIndex={-1}
        onClick={() => setShow((s) => !s)}
        aria-label={show ? 'パスワードを隠す' : 'パスワードを表示'}
        className={`absolute right-3 top-1/2 -translate-y-1/2 ${iconClassName}`}
      >
        {show ? <EyeOffIcon className="w-4 h-4" /> : <EyeIcon className="w-4 h-4" />}
      </button>
    </div>
  )
}
