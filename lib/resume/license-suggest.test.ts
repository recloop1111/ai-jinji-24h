import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { filterLicenseSuggestions, LICENSE_SUGGESTIONS } from './license-suggest'

describe('filterLicenseSuggestions（入力補助・authority ではない）', () => {
  it('2文字未満は候補を出さない（focus だけの大量表示を防ぐ）', () => {
    expect(filterLicenseSuggestions('')).toEqual([])
    expect(filterLicenseSuggestions('普')).toEqual([])
    expect(filterLicenseSuggestions(null)).toEqual([])
    expect(filterLicenseSuggestions(undefined)).toEqual([])
  })
  it('部分一致で絞り込み（「普通自動車」→ 第一種/第二種）', () => {
    const r = filterLicenseSuggestions('普通自動車')
    expect(r).toContain('普通自動車第一種運転免許')
    expect(r).toContain('普通自動車第二種運転免許')
    expect(r.length).toBe(2)
  })
  it('大文字小文字を無視（toeic → TOEIC / toefl → TOEFL）', () => {
    expect(filterLicenseSuggestions('toei')).toContain('TOEIC')
    expect(filterLicenseSuggestions('toef')).toContain('TOEFL')
  })
  it('前方一致を部分一致より優先', () => {
    // '簿記' は「日商簿記検定2級/3級」に部分一致。'日商' は前方一致。
    const r = filterLicenseSuggestions('日商簿記')
    expect(r[0].startsWith('日商簿記')).toBe(true)
  })
  it('最大表示件数を超えない（max=3）', () => {
    const many = Array.from({ length: 20 }, (_, i) => `テスト資格${i}`)
    expect(filterLicenseSuggestions('テスト資格', many, { max: 3 }).length).toBe(3)
  })
  it('候補に無い名称でも空配列を返すだけ（reject しない＝自由入力を妨げない）', () => {
    expect(filterLicenseSuggestions('存在しない独自資格XYZ')).toEqual([])
  })
  it('minChars を変更できる', () => {
    expect(filterLicenseSuggestions('T', LICENSE_SUGGESTIONS, { minChars: 1 })).toContain('TOEIC')
  })
  it('候補データは既存資格を保持（削除していない）', () => {
    for (const name of ['普通自動車第一種運転免許', 'TOEIC', 'TOEFL', '日商簿記検定2級', '宅地建物取引士', '登録販売者']) {
      expect(LICENSE_SUGGESTIONS).toContain(name)
    }
  })
})

// ── source-level guard（RTL 不使用のため）: select/datalist 廃止・自由入力 autocomplete へ ──
const FORM = readFileSync(join(process.cwd(), 'app/interview/[slug]/form/page.tsx'), 'utf8')
const COMP = readFileSync(join(process.cwd(), 'components/interview/LicenseNameInput.tsx'), 'utf8')

describe('資格入力: select/datalist 廃止 → 自由入力 + autocomplete', () => {
  it('form は LicenseNameInput を使い、datalist / list= を撤去', () => {
    expect(FORM).toContain('<LicenseNameInput')
    expect(FORM).not.toContain('id="license-suggestions"')
    expect(FORM).not.toContain('list="license-suggestions"')
    expect(FORM).not.toContain('<datalist')
  })
  it('資格名は自由入力（onChange で値をそのまま反映）', () => {
    expect(COMP).toContain('onChange(e.target.value)')
  })
  it('候補は入力補助（filterLicenseSuggestions を使用・2文字未満は非表示）', () => {
    expect(COMP).toContain('filterLicenseSuggestions(value')
  })
  it('キーボード操作（ArrowUp/Down/Enter/Escape）に対応', () => {
    expect(COMP).toContain("'ArrowDown'")
    expect(COMP).toContain("'ArrowUp'")
    expect(COMP).toContain("'Enter'")
    expect(COMP).toContain("'Escape'")
  })
  it('候補リストは高さ制限＋スクロール（画面外へ巨大化しない）', () => {
    expect(COMP).toContain('max-h-60')
    expect(COMP).toContain('overflow-y-auto')
  })
})
