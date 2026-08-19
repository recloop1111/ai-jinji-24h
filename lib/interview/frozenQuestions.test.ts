import { describe, it, expect } from 'vitest'
import { needsFreeze } from './frozenQuestions'

// 追加P2（Codex）: 凍結済み snapshot があればそれを単一の真実として使い、無いときだけ assemble+freeze する。
describe('needsFreeze', () => {
  it('非空配列（凍結済み）→ false（既存凍結を使う・再アセンブルしない）', () => {
    expect(needsFreeze([{ question_text: 'Q1', sort_order: 1 }])).toBe(false)
    expect(needsFreeze([{ question_text: 'Q1' }, { question_text: 'Q2' }])).toBe(false)
  })

  it('null / undefined / 空配列 / 非配列 → true（assemble して凍結する）', () => {
    expect(needsFreeze(null)).toBe(true)
    expect(needsFreeze(undefined)).toBe(true)
    expect(needsFreeze([])).toBe(true)
    expect(needsFreeze('not-an-array')).toBe(true)
    expect(needsFreeze({ question_text: 'x' })).toBe(true)
  })
})
