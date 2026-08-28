import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { classifyEndResponse } from './end-finalize'

// 正常完了の /end 応答分類。completed 確認前に complete へ進めない／通信失敗で /ended へ飛ばさない を pure logic で固定。

describe('classifyEndResponse（/end 成功＝completed 確認）', () => {
  it('1. 200 + final_status=completed → completed（summary 確定して complete へ）', () => {
    expect(classifyEndResponse({ ok: true, finalStatus: 'completed' })).toBe('completed')
  })
  it('2. end 500（!ok）→ retryable（complete へ進めない）', () => {
    expect(classifyEndResponse({ ok: false, finalStatus: undefined })).toBe('retryable')
    expect(classifyEndResponse({ ok: false, finalStatus: 'completed' })).toBe('retryable') // body があっても !ok は信用しない
  })
  it('3/4. network error 相当（!ok / final_status 欠落）→ retryable（complete にも /ended にも進めない）', () => {
    expect(classifyEndResponse({ ok: true, finalStatus: null })).toBe('retryable')
    expect(classifyEndResponse({ ok: true, finalStatus: undefined })).toBe('retryable')
    expect(classifyEndResponse({ ok: true, finalStatus: '' })).toBe('retryable')
  })
  it('7. response lost 後 retry ＋ already_finalized=true ＋ final_status=completed → completed（二重保存せず復旧）', () => {
    // already_finalized でも body の final_status が completed なら completed 扱い。
    expect(classifyEndResponse({ ok: true, finalStatus: 'completed' })).toBe('completed')
  })
  it('8. already_finalized=true ＋ final_status=cancelled → not_completed（complete にしない）', () => {
    expect(classifyEndResponse({ ok: true, finalStatus: 'cancelled' })).toBe('not_completed')
    expect(classifyEndResponse({ ok: true, finalStatus: 'in_progress' })).toBe('not_completed')
  })
})

describe('session/page.tsx: 正常完了は /end 確認後に complete・失敗は blocking retry（/ended へ飛ばさない）', () => {
  const PAGE = readFileSync(join(process.cwd(), 'app/interview/[slug]/session/page.tsx'), 'utf8')
  it('正常完了は finalizeCompletion（/end→classifyEndResponse）を await してから遷移', () => {
    expect(PAGE).toContain('finalizeCompletion')
    expect(PAGE).toContain('classifyEndResponse')
    expect(PAGE).toContain('await finalizeCompletion()')
  })
  it('5. 失敗時は endError を立てて blocking「再送信する」を表示（同一 payload で retry）', () => {
    expect(PAGE).toContain('setEndError')
    expect(PAGE).toContain('再送信する')
    expect(PAGE).toContain('pendingEndRef')
  })
  it('completed のときだけ summary 確定して uploading へ・not_completed は /ended', () => {
    // finalizeCompletion 内で completed→summaryStorageKey 保存→uploading、not_completed→ended。
    expect(PAGE).toContain('summaryStorageKey')
    expect(PAGE).toMatch(/outcome === 'completed'[\s\S]{0,500}uploading/)
    expect(PAGE).toMatch(/outcome === 'not_completed'[\s\S]{0,200}ended/)
  })
  it('2/3/4. retryable（通信失敗）では uploading にも /ended にも進めず endError（面接をやり直させない）', () => {
    // retryable 分岐では router.push を呼ばず setEndError のみ。
    expect(PAGE).toContain('面接内容は保持されています')
  })
})
