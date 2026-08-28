import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  resolveCompanyName,
  canSubmitRating,
  classifyBackendStatus,
  resolveCompleteState,
  DEMO_COMPANY_NAME,
} from './complete-view'
import { durationToMinutes, questionCountDisplay } from './completeSummary'

// 面接完了画面: 正常完了/中断の分岐・会社名解決・満足度送信・実データ表示・AIMEN24非表示 を pure logic＋ソースで固定。

describe('resolveCompanyName（会社名・demo フォールバック）', () => {
  it('12/13. 会社名があればそのまま表示（ロゴは使わない・名前のみ）', () => {
    expect(resolveCompanyName('株式会社サンプル')).toBe('株式会社サンプル')
  })
  it('未取得/空文字 → テスト株式会社（demo フォールバック）', () => {
    expect(resolveCompanyName(null)).toBe('テスト株式会社')
    expect(resolveCompanyName(undefined)).toBe('テスト株式会社')
    expect(resolveCompanyName('')).toBe('テスト株式会社')
    expect(resolveCompanyName('   ')).toBe('テスト株式会社')
    expect(DEMO_COMPANY_NAME).toBe('テスト株式会社')
  })
})

describe('classifyBackendStatus（backend の completed 検証）', () => {
  it('ok + status=completed → completed', () => {
    expect(classifyBackendStatus({ ok: true, status: 'completed' })).toBe('completed')
  })
  it('ok + status≠completed（cancelled/in_progress 等）→ other', () => {
    expect(classifyBackendStatus({ ok: true, status: 'cancelled' })).toBe('other')
    expect(classifyBackendStatus({ ok: true, status: 'in_progress' })).toBe('other')
    expect(classifyBackendStatus({ ok: true, status: null })).toBe('other')
  })
  it('レスポンス失敗 → unknown', () => {
    expect(classifyBackendStatus({ ok: false, status: undefined })).toBe('unknown')
  })
})

describe('resolveCompleteState（backend 権威: 完了 / 中断 / 検証エラー / サマリーエラー）', () => {
  it('9. backend completed ＋ 表示可能サマリー → completed（サマリー必須表示）', () => {
    expect(resolveCompleteState({ backendStatus: 'completed', hasDisplayableSummary: true })).toBe('completed')
  })
  it('10. backend other（cancelled/in_progress 等）→ interrupted（/ended）', () => {
    expect(resolveCompleteState({ backendStatus: 'other', hasDisplayableSummary: true })).toBe('interrupted')
    expect(resolveCompleteState({ backendStatus: 'other', hasDisplayableSummary: false })).toBe('interrupted')
  })
  it('11/12. backend unknown（通信失敗）→ verification_error（local summary があっても completed にしない・/ended へも飛ばさない）', () => {
    expect(resolveCompleteState({ backendStatus: 'unknown', hasDisplayableSummary: true })).toBe('verification_error')
    expect(resolveCompleteState({ backendStatus: 'unknown', hasDisplayableSummary: false })).toBe('verification_error')
  })
  it('14. backend completed だが表示できるサマリーが皆無 → summary_error（interrupted とは区別）', () => {
    expect(resolveCompleteState({ backendStatus: 'completed', hasDisplayableSummary: false })).toBe('summary_error')
  })
})

describe('canSubmitRating（満足度送信の可否・二重送信防止）', () => {
  it('未選択（rating=0）→ 送信不可', () => {
    expect(canSubmitRating({ rating: 0, submitting: false, submitted: false })).toBe(false)
  })
  it('1〜5 選択 → 送信可', () => {
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
  it('3. 所要秒 → 分（19分 = 1140秒 など）', () => {
    expect(durationToMinutes(1140)).toBe(19)
    expect(durationToMinutes(59)).toBe(1) // 1分未満は最小1（0分にしない）
  })
  it('4. 質問数は取得できた値を表示', () => {
    expect(questionCountDisplay(9)).toBe(9)
  })
  it('5. 取得不能（0以下/NaN）は null（ダミー9問を出さない）', () => {
    expect(questionCountDisplay(0)).toBeNull()
    expect(questionCountDisplay(-3)).toBeNull()
    expect(questionCountDisplay(Number.NaN)).toBeNull()
    expect(durationToMinutes(0)).toBeNull()
  })
})

describe('complete/page.tsx: 正常完了検証 / ヘッダー / honest / 実データ / AI評価非表示', () => {
  const PAGE = readFileSync(join(process.cwd(), 'app/interview/[slug]/complete/page.tsx'), 'utf8')
  const header = PAGE.slice(PAGE.indexOf('const header ='), PAGE.indexOf('</header>'))

  it('12/13/14. ヘッダーは会社名のみ（AIMEN24/ロゴ非表示）', () => {
    expect(header).toContain('{companyName}')
    expect(header).not.toContain('APP_NAME')
    expect(header).not.toContain('logo')
  })
  it('14. Powered by AIMEN24 はフッターにのみ残す', () => {
    expect(PAGE).toContain('Powered by {APP_NAME}')
  })
  it('2/8/11. 正常完了は backend 検証（summary API＋resolveCompleteState）で分岐し、未完了は /ended へ退避', () => {
    expect(PAGE).toContain('/summary')
    expect(PAGE).toContain('resolveCompleteState')
    expect(PAGE).toContain('classifyBackendStatus')
    expect(PAGE).toContain('/ended')
    // completed 以外は正常完了 UI を描画しない（viewState ガード）
    expect(PAGE).toContain("viewState !== 'completed'")
  })
  it('12/14. verification_error / summary_error を安全エラー＋再試行で表示（/ended へ飛ばさない）', () => {
    expect(PAGE).toContain("viewState === 'verification_error'")
    expect(PAGE).toContain("viewState === 'summary_error'")
    expect(PAGE).toContain('完了状態を確認できませんでした')
    expect(PAGE).toContain('サマリー情報を取得できませんでした')
    expect(PAGE).toContain('再確認する')
    expect(PAGE).toContain('再取得する')
    expect(PAGE).toContain('handleRetry')
    // interrupted のときだけ /ended へ replace（error 状態では replace しない）
    expect(PAGE).toMatch(/state === 'interrupted'[\s\S]{0,200}router\.replace/)
  })
  it('9/10. 中断時は「面接が完了しました」「面接完了」サマリーを描画しない（completed 時のみ本体）', () => {
    // 完了本体（見出し）が viewState==='completed' ガードの後に置かれている
    const idxGuard = PAGE.indexOf("viewState !== 'completed'")
    const idxTitle = PAGE.indexOf('面接が完了しました')
    expect(idxGuard).toBeGreaterThan(0)
    expect(idxTitle).toBeGreaterThan(idxGuard)
  })
  it('15. 既存の満足度送信 API を再利用＋二重送信ガード', () => {
    expect(PAGE).toContain('/satisfaction')
    expect(PAGE).toContain('satisfaction_rating')
    expect(PAGE).toContain('canSubmitRating')
    expect(PAGE).toContain('setSubmitting')
  })
  it('5. 固定ダミー値（9問/19分/?? 9 等）を出さない・実データを条件表示', () => {
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
  it('16. 応募者に AI 評価情報（EBCA/スコア/ランク/合否/採用）を表示しない', () => {
    for (const term of ['EBCA', 'スコア', 'ランク', '合否', '採用', '評価結果', 'big_five', 'total_score']) {
      expect(PAGE).not.toContain(term)
    }
  })
  it('レスポンシブ: 中央 max-w-xl・2カラムは flex-1 で縮小', () => {
    expect(PAGE).toContain('max-w-xl')
    expect(PAGE).toContain('flex-1')
  })
})

describe('api/interview/[slug]/summary: 読み取り専用・token 検証・書き込みなし', () => {
  const API = readFileSync(join(process.cwd(), 'app/api/interview/[slug]/summary/route.ts'), 'utf8')
  it('token / applicant / company / interview の整合を検証', () => {
    expect(API).toContain('verifyInterviewToken')
    expect(API).toContain('applicant_id')
    expect(API).toContain('interview_id')
  })
  it('interviews から status / duration_seconds / total_questions を読む', () => {
    expect(API).toContain('status, duration_seconds, total_questions')
  })
  it('書き込み（update/insert/delete）を行わない（読み取り専用）', () => {
    expect(API).not.toContain('.update(')
    expect(API).not.toContain('.insert(')
    expect(API).not.toContain('.delete(')
  })
})
