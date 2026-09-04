import { describe, it, expect } from 'vitest'
import {
  SELECTION_RESULT_VALUES, isSelectionResultValue, resultKeyToValue, resultValueToKey,
  MAX_SELECTION_MEMO_LENGTH, validateSelectionMemo,
} from './selectionResult'

describe('selectionResult（client 選考結果 SoT = applicants.result）', () => {
  it('DB CHECK と一致する4値のみ', () => {
    expect([...SELECTION_RESULT_VALUES]).toEqual(['未対応', '検討中', '二次通過', '不採用'])
  })

  it('isSelectionResultValue: 既存 demo/prod 値はすべて valid・不正値は reject', () => {
    for (const v of ['未対応', '検討中', '二次通過', '不採用']) expect(isSelectionResultValue(v)).toBe(true)
    // 運営用 selection_status の値や旧 route の値は client SoT では不正
    for (const v of ['pending', 'second_interview', 'considering', 'hired', '', null, undefined, 3]) {
      expect(isSelectionResultValue(v)).toBe(false)
    }
  })

  it('resultKeyToValue: UI キー → DB 値', () => {
    expect(resultKeyToValue(null)).toBe('未対応')
    expect(resultKeyToValue('considering')).toBe('検討中')
    expect(resultKeyToValue('second_pass')).toBe('二次通過')
    expect(resultKeyToValue('rejected')).toBe('不採用')
  })

  it('resultValueToKey: DB 値 → UI キー（未知/未対応/null は null）', () => {
    expect(resultValueToKey('未対応')).toBe(null)
    expect(resultValueToKey('検討中')).toBe('considering')
    expect(resultValueToKey('二次通過')).toBe('second_pass')
    expect(resultValueToKey('不採用')).toBe('rejected')
    expect(resultValueToKey(null)).toBe(null)
    expect(resultValueToKey('unknown')).toBe(null)
  })

  it('round-trip: key → value → key が保存される', () => {
    for (const key of [null, 'considering', 'second_pass', 'rejected'] as const) {
      expect(resultValueToKey(resultKeyToValue(key))).toBe(key)
    }
  })
})

describe('validateSelectionMemo（選考メモ・applicants.selection_memo）', () => {
  it('最大文字数は 2000', () => {
    expect(MAX_SELECTION_MEMO_LENGTH).toBe(2000)
  })
  it('string 以外は reject', () => {
    expect(validateSelectionMemo(123).ok).toBe(false)
    expect(validateSelectionMemo(null).ok).toBe(false)
    expect(validateSelectionMemo(undefined).ok).toBe(false)
  })
  it('trim される', () => {
    const r = validateSelectionMemo('  メモ  ')
    expect(r.ok && r.value).toBe('メモ')
  })
  it('空文字はクリアとして許可（value=""）', () => {
    const r = validateSelectionMemo('   ')
    expect(r.ok).toBe(true)
    expect(r.ok && r.value).toBe('')
  })
  it('改行を保持する（plain text・trim は端のみ）', () => {
    const r = validateSelectionMemo('一行目\n二行目')
    expect(r.ok && r.value).toBe('一行目\n二行目')
  })
  it('2000文字は許可・2001文字は reject', () => {
    expect(validateSelectionMemo('あ'.repeat(2000)).ok).toBe(true)
    expect(validateSelectionMemo('あ'.repeat(2001)).ok).toBe(false)
  })
})
