import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { resolveCompanyName, canSubmitRating, DEMO_COMPANY_NAME } from './complete-view'
import { durationToMinutes, questionCountDisplay } from './completeSummary'

// 面接完了画面: 会社名解決 / 満足度送信の可否 / 実データ表示 / AIMEN24 ヘッダー非表示 を pure logic＋ソースで固定。

describe('resolveCompanyName（会社名・demo フォールバック）', () => {
  it('2. 会社名があればそのまま表示', () => {
    expect(resolveCompanyName('株式会社サンプル')).toBe('株式会社サンプル')
  })
  it('3. 未取得/空文字 → テスト株式会社（demo フォールバック・捏造しない範囲の既定名）', () => {
    expect(resolveCompanyName(null)).toBe('テスト株式会社')
    expect(resolveCompanyName(undefined)).toBe('テスト株式会社')
    expect(resolveCompanyName('')).toBe('テスト株式会社')
    expect(resolveCompanyName('   ')).toBe('テスト株式会社')
    expect(DEMO_COMPANY_NAME).toBe('テスト株式会社')
  })
})

describe('canSubmitRating（満足度送信の可否・二重送信防止）', () => {
  it('9. 未選択（rating=0）→ 送信不可', () => {
    expect(canSubmitRating({ rating: 0, submitting: false, submitted: false })).toBe(false)
  })
  it('8/10. 1〜5 選択 → 送信可', () => {
    for (const r of [1, 2, 3, 4, 5]) {
      expect(canSubmitRating({ rating: r, submitting: false, submitted: false })).toBe(true)
    }
  })
  it('範囲外（6 / 負値）→ 不可', () => {
    expect(canSubmitRating({ rating: 6, submitting: false, submitted: false })).toBe(false)
    expect(canSubmitRating({ rating: -1, submitting: false, submitted: false })).toBe(false)
  })
  it('送信中/送信済み → 不可（二重送信防止）', () => {
    expect(canSubmitRating({ rating: 3, submitting: true, submitted: false })).toBe(false)
    expect(canSubmitRating({ rating: 3, submitting: false, submitted: true })).toBe(false)
  })
})

describe('面接時間/質問数の実データ表示', () => {
  it('4. 所要秒 → 分（19分 = 1140秒 など）', () => {
    expect(durationToMinutes(1140)).toBe(19)
    expect(durationToMinutes(59)).toBe(1) // 1分未満は最小1（0分にしない）
  })
  it('6. 質問数は取得できた値を表示', () => {
    expect(questionCountDisplay(9)).toBe(9)
  })
  it('7. 取得不能（0以下/NaN）は null（ダミー9問を出さない）', () => {
    expect(questionCountDisplay(0)).toBeNull()
    expect(questionCountDisplay(-3)).toBeNull()
    expect(questionCountDisplay(Number.NaN)).toBeNull()
    expect(durationToMinutes(0)).toBeNull()
  })
})

describe('complete/page.tsx: ヘッダー AIMEN24 非表示 / honest 文言 / 実データ / AI評価非表示', () => {
  const PAGE = readFileSync(join(process.cwd(), 'app/interview/[slug]/complete/page.tsx'), 'utf8')
  const header = PAGE.slice(PAGE.indexOf('<header'), PAGE.indexOf('</header>'))

  it('1. ヘッダーに AIMEN24（APP_NAME）を出さない・会社名を表示', () => {
    expect(header).toContain('{companyName}')
    expect(header).not.toContain('APP_NAME')
    expect(header).not.toContain('AIMEN24')
  })
  it('13. Powered by AIMEN24 はフッターにのみ残す（small/muted）', () => {
    expect(PAGE).toContain('Powered by {APP_NAME}')
    const footerPart = PAGE.slice(PAGE.indexOf('この画面は閉じて'))
    expect(footerPart).toContain('APP_NAME')
  })
  it('11. 既存の満足度送信 API を再利用＋二重送信ガード', () => {
    expect(PAGE).toContain('/satisfaction')
    expect(PAGE).toContain('satisfaction_rating')
    expect(PAGE).toContain('canSubmitRating')
    expect(PAGE).toContain('setSubmitting')
  })
  it('14. 固定ダミー値（9問/19分/?? 9 等）を出さない・実データを条件表示', () => {
    expect(PAGE).not.toContain('9問')
    expect(PAGE).not.toContain('19分')
    expect(PAGE).not.toMatch(/\?\?\s*9\b/)
    expect(PAGE).toContain('questions !== null')
    expect(PAGE).toContain('minutes !== null')
    // 数字と単位が分離しないよう nowrap/baseline を使用（「1 9 / 分」対策）
    expect(PAGE).toContain('whitespace-nowrap')
    expect(PAGE).toContain('items-baseline')
  })
  it('honest 文言: 保存成功を断定しない（「正常に送信されました」を出さない）', () => {
    expect(PAGE).toContain('面接が完了しました')
    expect(PAGE).not.toContain('正常に送信されました')
    expect(PAGE).not.toContain('送信完了')
  })
  it('12. 応募者に AI 評価情報（EBCA/スコア/ランク/合否/採用）を表示しない', () => {
    for (const term of ['EBCA', 'スコア', 'ランク', '合否', '採用', '評価結果', 'big_five', 'total_score']) {
      expect(PAGE).not.toContain(term)
    }
  })
  it('13(mobile). レスポンシブ: 中央 max-w-xl・2カラムは flex-1 で縮小', () => {
    expect(PAGE).toContain('max-w-xl')
    expect(PAGE).toContain('flex-1')
  })
})
