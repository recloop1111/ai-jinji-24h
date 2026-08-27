import { describe, it, expect } from 'vitest'
import { maskPhone } from './mask-phone'

// 電話番号マスク（純関数）。plaintext 全体を出さず、先頭3桁＋末尾4桁のみ表示する。

describe('maskPhone', () => {
  it('11桁 携帯番号 → 先頭3＋****＋末尾4', () => {
    expect(maskPhone('09012345678')).toBe('090-****-5678')
  })
  it('ハイフン/空白入りでも数字のみ抽出して整形', () => {
    expect(maskPhone('090-1234-5678')).toBe('090-****-5678')
    expect(maskPhone('090 1234 5678')).toBe('090-****-5678')
  })
  it('全体の生番号を返さない（中間桁は伏せる）', () => {
    const masked = maskPhone('09011112222')
    expect(masked).not.toContain('1111')
    expect(masked).toContain('****')
  })
  it('短すぎる/空は情報を出さない（全マスク or 空）', () => {
    expect(maskPhone('')).toBe('')
    expect(maskPhone('123')).toBe('***')
  })
})
