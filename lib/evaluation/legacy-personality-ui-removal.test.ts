import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { buildEvaluationDisplayModel } from './display'

// PR-19H (P2-4): 応募者評価 UI を EBCA に一本化。legacy personality/culture/BigFive を「現在の AI 評価結果」として
// 表示する経路がゼロであることを、①ページのソース guard と ②EBCA 表示モデルが personality を持ち込まないこと で担保する。
// （大きな client component は RTL を使わず、表示アクセスのソース非在＋domain モデルの純テストで回帰を防ぐ。）

const CLIENT_PAGE = join(process.cwd(), 'app/client/(dashboard)/applicants/[id]/page.tsx')
const ADMIN_PAGE = join(process.cwd(), 'app/admin/(dashboard)/applicants/[id]/page.tsx')

// 「表示アクセス」を表すトークン（コメント中の説明文字列は除外し、実際の描画参照のみを対象にする）。
const RENDER_TOKENS = [
  'interviewResult.personality_type',
  'interviewResult.personality_description',
  'interviewResult?.personality_type',
  'interviewResult?.personality_description',
  '.personalityType',
  '.personalityDesc',
  '.personalityForCompany',
]
// UI 見出し（撤去済みであるべき legacy ラベル）。
const LEGACY_HEADINGS = ['パーソナリティタイプ', '性格タイプ', '性格説明']

describe('P2-4: applicant 詳細ページから legacy personality 表示が撤去されている', () => {
  const clientSrc = readFileSync(CLIENT_PAGE, 'utf8')
  const adminSrc = readFileSync(ADMIN_PAGE, 'utf8')

  it('1-5: client / admin ともに personality 表示アクセスが存在しない', () => {
    for (const token of RENDER_TOKENS) {
      expect(clientSrc.includes(token), `client renders ${token}`).toBe(false)
      expect(adminSrc.includes(token), `admin renders ${token}`).toBe(false)
    }
  })

  it('legacy 見出し（パーソナリティタイプ/性格タイプ/性格説明）が UI に無い', () => {
    for (const h of LEGACY_HEADINGS) {
      expect(clientSrc.includes(h), `client heading ${h}`).toBe(false)
      expect(adminSrc.includes(h), `admin heading ${h}`).toBe(false)
    }
  })

  it('culture_fit / big_five を UI に描画しない', () => {
    for (const t of ['culture_fit', 'big_five', 'BigFive']) {
      expect(clientSrc.includes(t)).toBe(false)
      expect(adminSrc.includes(t)).toBe(false)
    }
  })

  it('13: DUMMY の personality フィールドが client ページに残っていない', () => {
    for (const t of ['personalityType:', 'personalityDesc:', 'personalityForCompany:']) {
      expect(clientSrc.includes(t)).toBe(false)
    }
  })

  it('8/9/10/11: EvaluationReport / TranscriptLog / summary / basic-info の結線は維持（非回帰）', () => {
    // 撤去で他機能を巻き込んでいないこと（依然として結線されている）。
    expect(clientSrc.includes('EvaluationReport')).toBe(true)
    expect(clientSrc.includes('TranscriptLog')).toBe(true)
    expect(adminSrc.includes('normalizeEvaluationAxes')).toBe(true) // admin は EBCA 軸を描画
  })
})

describe('P2-4: EBCA 表示モデルは legacy personality を持ち込まない（fallback 復活なし）', () => {
  it('6/7: legacy row（personality_type 等あり）でも表示モデルに personality/culture が現れない・crash しない', () => {
    const legacyRow = {
      total_score: 72,
      evaluation_axes: [{ axis: 'communication', score: 15, rank: 'B', confidence: 'high', evidence: [], insufficient_reason: null }],
      // 旧データが残っていても読めるが表示しない：
      personality_type: '実行型リーダー',
      personality_description: '決断力が高い',
      culture_fit_score: 80,
      big_five: { openness: 0.7 },
      detail_json: { profile_summary: { persona: 'x' }, personality_type: 'INTJ' },
    }
    const model = buildEvaluationDisplayModel(legacyRow)
    expect(model).not.toBeNull()
    const json = JSON.stringify(model)
    for (const leak of ['personality', 'culture_fit', 'big_five', '実行型リーダー', 'INTJ']) {
      expect(json.includes(leak), `display model leaked ${leak}`).toBe(false)
    }
  })

  it('12: EBCA 未評価（null）→ 表示モデル null（honest empty・DUMMY fallback なし）', () => {
    expect(buildEvaluationDisplayModel(null)).toBeNull()
    expect(buildEvaluationDisplayModel({})).not.toBeUndefined() // 空 row でも crash しない
  })
})
