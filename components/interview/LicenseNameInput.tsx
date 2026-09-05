'use client'

import { useState, useRef, useId } from 'react'
import { filterLicenseSuggestions, LICENSE_SUGGESTIONS } from '@/lib/resume/license-suggest'

// 資格・免許名の「自由入力 + autocomplete 候補」入力。
//   - select/dropdown ではない。候補は入力補助であり、候補外の名称もそのまま入力・保存できる。
//   - 2文字以上入力で候補を絞り込み表示（focus だけで全件を出さない）。最大 8 件・スクロールで巨大化を防ぐ。
//   - キーボード: ArrowUp/Down で移動、Enter で確定、Escape で閉じる。候補クリックで反映。
type Props = {
  value: string
  onChange: (val: string) => void
  placeholder?: string
  maxLength?: number
  suggestions?: readonly string[]
}

export default function LicenseNameInput({
  value, onChange, placeholder, maxLength, suggestions = LICENSE_SUGGESTIONS,
}: Props) {
  const [open, setOpen] = useState(false)
  const [highlight, setHighlight] = useState(-1) // -1 = 未選択
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const listId = useId()

  const matches = filterLicenseSuggestions(value, suggestions)
  const showList = open && matches.length > 0

  const commit = (v: string) => {
    onChange(v)
    setOpen(false)
    setHighlight(-1)
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showList) {
      if (e.key === 'ArrowDown' && matches.length > 0) { setOpen(true); setHighlight(0); e.preventDefault() }
      return
    }
    if (e.key === 'ArrowDown') { setHighlight((h) => (h + 1) % matches.length); e.preventDefault() }
    else if (e.key === 'ArrowUp') { setHighlight((h) => (h <= 0 ? matches.length - 1 : h - 1)); e.preventDefault() }
    else if (e.key === 'Enter') {
      if (highlight >= 0 && highlight < matches.length) { commit(matches[highlight]); e.preventDefault() }
      else setOpen(false)
    } else if (e.key === 'Escape') { setOpen(false); setHighlight(-1) }
  }

  return (
    <div className="relative">
      <input
        type="text"
        role="combobox"
        aria-expanded={showList}
        aria-autocomplete="list"
        aria-controls={showList ? listId : undefined}
        value={value}
        maxLength={maxLength}
        placeholder={placeholder}
        onChange={(e) => { onChange(e.target.value); setOpen(true); setHighlight(-1) }}
        onFocus={() => setOpen(true)}
        onBlur={() => { blurTimer.current = setTimeout(() => setOpen(false), 120) }}
        onKeyDown={onKeyDown}
        className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
      {showList && (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-20 mt-1 max-h-60 w-full overflow-y-auto overflow-x-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-lg"
        >
          {matches.map((s, i) => (
            <li
              key={s}
              role="option"
              aria-selected={i === highlight}
              // onMouseDown で反映（onBlur によるリスト消滅より先に確定させる）。
              onMouseDown={(e) => { e.preventDefault(); if (blurTimer.current) clearTimeout(blurTimer.current); commit(s) }}
              onMouseEnter={() => setHighlight(i)}
              className={`cursor-pointer truncate px-4 py-2 text-sm ${i === highlight ? 'bg-blue-50 text-blue-700' : 'text-slate-800'}`}
            >
              {s}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
