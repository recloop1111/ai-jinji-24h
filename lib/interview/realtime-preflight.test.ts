import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  evaluateRealtimeSmokePreflight,
  DEFAULT_REALTIME_PREFLIGHT_POLICY,
  type RealtimePreflightFacts,
} from './realtime-preflight'
import { DEMO_COMPANY_ID } from '@/lib/config/demo'

// 実 OpenAI は一切呼ばない（preflight は純関数・network/DB なし）。actual call 禁止。
const TEST_COMPANY_ID = 'c0000000-0000-0000-0000-000000000001'

// READY になる基準 env（1社 allowlist・gate ON・key あり・model 既定）。
function readyEnv(over: Record<string, string | undefined> = {}): NodeJS.ProcessEnv {
  return {
    OPENAI_REALTIME_ENABLED: 'true',
    OPENAI_API_KEY: 'sk-test-DUMMY-not-real',
    OPENAI_REALTIME_COMPANY_IDS: TEST_COMPANY_ID,
    ...over,
  } as NodeJS.ProcessEnv
}

// READY になる基準 facts（非demo・in_progress・凍結snapshot・ロック無し）。
function readyFacts(over: Partial<RealtimePreflightFacts> = {}): RealtimePreflightFacts {
  return {
    company: { id: TEST_COMPANY_ID, is_demo: false, is_suspended: false },
    applicant: { id: 'a1', company_id: TEST_COMPANY_ID },
    interview: {
      id: 'iv1',
      applicant_id: 'a1',
      status: 'in_progress',
      questions_snapshot: [
        { question_text: '志望動機を教えてください', sort_order: 1 },
        { question_text: 'あなたの強みは何ですか', sort_order: 2 },
      ],
      realtime_call_locked_until: null,
    },
    nowMs: Date.now(),
    ...over,
  }
}

describe('evaluateRealtimeSmokePreflight', () => {
  it('#6 前提が全て揃えば READY', () => {
    const r = evaluateRealtimeSmokePreflight(readyFacts(), readyEnv())
    expect(r.status).toBe('READY')
    expect(r.reasons).toEqual([])
    expect(r.checks.gateEnabled).toBe(true)
    expect(r.checks.companyAllowed).toBe(true)
    expect(r.checks.snapshotFrozen).toBe(true)
  })

  it('#1 gate OFF → BLOCKED(GATE_DISABLED)', () => {
    const r = evaluateRealtimeSmokePreflight(readyFacts(), readyEnv({ OPENAI_REALTIME_ENABLED: undefined }))
    expect(r.status).toBe('BLOCKED')
    expect(r.reasons).toContain('GATE_DISABLED')
    // 厳格に 'true' のみ有効
    expect(evaluateRealtimeSmokePreflight(readyFacts(), readyEnv({ OPENAI_REALTIME_ENABLED: 'TRUE' })).reasons).toContain('GATE_DISABLED')
  })

  it('#2 API key 未設定 → BLOCKED(API_KEY_MISSING)', () => {
    const r = evaluateRealtimeSmokePreflight(readyFacts(), readyEnv({ OPENAI_API_KEY: undefined }))
    expect(r.reasons).toContain('API_KEY_MISSING')
    expect(evaluateRealtimeSmokePreflight(readyFacts(), readyEnv({ OPENAI_API_KEY: '   ' })).reasons).toContain('API_KEY_MISSING')
  })

  it('#3 allowlist 未設定 → BLOCKED(ALLOWLIST_MISSING)', () => {
    expect(evaluateRealtimeSmokePreflight(readyFacts(), readyEnv({ OPENAI_REALTIME_COMPANY_IDS: undefined })).reasons).toContain('ALLOWLIST_MISSING')
    expect(evaluateRealtimeSmokePreflight(readyFacts(), readyEnv({ OPENAI_REALTIME_COMPANY_IDS: '' })).reasons).toContain('ALLOWLIST_MISSING')
  })

  it('#4 対象 company が allowlist に無い → BLOCKED(COMPANY_NOT_ALLOWLISTED)', () => {
    const r = evaluateRealtimeSmokePreflight(readyFacts(), readyEnv({ OPENAI_REALTIME_COMPANY_IDS: 'other-company-id' }))
    expect(r.reasons).toContain('COMPANY_NOT_ALLOWLISTED')
    expect(r.checks.companyAllowed).toBe(false)
  })

  it('#5 demo 企業 → BLOCKED(COMPANY_IS_DEMO)（demo禁止を維持）', () => {
    const demo = evaluateRealtimeSmokePreflight(readyFacts({ company: { id: TEST_COMPANY_ID, is_demo: true } }), readyEnv())
    expect(demo.reasons).toContain('COMPANY_IS_DEMO')
    expect(demo.checks.companyAllowed).toBe(false)
    // テスト株式会社(DEMO_COMPANY_ID)も allowlist に入れても不可（isCompanyAllowed で弾く）。
    const demoId = evaluateRealtimeSmokePreflight(
      readyFacts({ company: { id: DEMO_COMPANY_ID, is_demo: false }, applicant: { id: 'a1', company_id: DEMO_COMPANY_ID } }),
      readyEnv({ OPENAI_REALTIME_COMPANY_IDS: DEMO_COMPANY_ID }),
    )
    expect(demoId.checks.companyAllowed).toBe(false)
  })

  it('#7 interview が対象 company/applicant に属さない → BLOCKED', () => {
    const wrongCompany = evaluateRealtimeSmokePreflight(
      readyFacts({ applicant: { id: 'a1', company_id: 'other-co' } }),
      readyEnv(),
    )
    expect(wrongCompany.reasons).toContain('APPLICANT_WRONG_COMPANY')
    const wrongApplicant = evaluateRealtimeSmokePreflight(
      readyFacts({ interview: { id: 'iv1', applicant_id: 'someone-else', status: 'in_progress', questions_snapshot: readyFacts().interview!.questions_snapshot, realtime_call_locked_until: null } }),
      readyEnv(),
    )
    expect(wrongApplicant.reasons).toContain('INTERVIEW_WRONG_APPLICANT')
  })

  it('interview が in_progress でない → BLOCKED(INTERVIEW_NOT_IN_PROGRESS)', () => {
    const r = evaluateRealtimeSmokePreflight(
      readyFacts({ interview: { id: 'iv1', applicant_id: 'a1', status: 'completed', questions_snapshot: readyFacts().interview!.questions_snapshot, realtime_call_locked_until: null } }),
      readyEnv(),
    )
    expect(r.reasons).toContain('INTERVIEW_NOT_IN_PROGRESS')
  })

  it('#8 questions_snapshot 未凍結/空/既定のみ → BLOCKED(SNAPSHOT_NOT_FROZEN)', () => {
    for (const snap of [null, [], [{ foo: 'bar' }], [{ question_text: '本日は面接にお越しいただきありがとうございます。まず自己紹介をお願いできますか？', sort_order: 1 }]]) {
      const r = evaluateRealtimeSmokePreflight(
        readyFacts({ interview: { id: 'iv1', applicant_id: 'a1', status: 'in_progress', questions_snapshot: snap, realtime_call_locked_until: null } }),
        readyEnv(),
      )
      expect(r.reasons).toContain('SNAPSHOT_NOT_FROZEN')
    }
  })

  it('#9 有効な realtime lock が存在 → BLOCKED(ACTIVE_LOCK)', () => {
    const now = Date.now()
    const locked = evaluateRealtimeSmokePreflight(
      readyFacts({ nowMs: now, interview: { id: 'iv1', applicant_id: 'a1', status: 'in_progress', questions_snapshot: readyFacts().interview!.questions_snapshot, realtime_call_locked_until: new Date(now + 60_000).toISOString() } }),
      readyEnv(),
    )
    expect(locked.reasons).toContain('ACTIVE_LOCK')
    // 失効済みロックは READY を妨げない
    const expired = evaluateRealtimeSmokePreflight(
      readyFacts({ nowMs: now, interview: { id: 'iv1', applicant_id: 'a1', status: 'in_progress', questions_snapshot: readyFacts().interview!.questions_snapshot, realtime_call_locked_until: new Date(now - 60_000).toISOString() } }),
      readyEnv(),
    )
    expect(expired.reasons).not.toContain('ACTIVE_LOCK')
  })

  it('#10 不正な model 明示 → BLOCKED(MODEL_INVALID)、許可 model は OK', () => {
    expect(evaluateRealtimeSmokePreflight(readyFacts(), readyEnv({ OPENAI_REALTIME_MODEL: 'gpt-4o-evil' })).reasons).toContain('MODEL_INVALID')
    expect(evaluateRealtimeSmokePreflight(readyFacts(), readyEnv({ OPENAI_REALTIME_MODEL: 'gpt-realtime' })).status).toBe('READY')
    // 未設定は既定 model で有効
    expect(evaluateRealtimeSmokePreflight(readyFacts(), readyEnv({ OPENAI_REALTIME_MODEL: undefined })).status).toBe('READY')
  })

  it('#11 cost/time guard が不正 → BLOCKED(COST_GUARD_INVALID)', () => {
    const bad = evaluateRealtimeSmokePreflight(readyFacts(), readyEnv(), { ...DEFAULT_REALTIME_PREFLIGHT_POLICY, maxInterviewSeconds: 0 })
    expect(bad.reasons).toContain('COST_GUARD_INVALID')
    const badTtl = evaluateRealtimeSmokePreflight(readyFacts(), readyEnv(), { ...DEFAULT_REALTIME_PREFLIGHT_POLICY, lockTtlMs: -1 })
    expect(badTtl.reasons).toContain('COST_GUARD_INVALID')
    // 既定 policy は有効
    expect(evaluateRealtimeSmokePreflight(readyFacts(), readyEnv()).checks.costGuardValid).toBe(true)
  })

  it('#12 結果に secret / API key / token / 応募者PII を含めない', () => {
    const r = evaluateRealtimeSmokePreflight(readyFacts(), readyEnv({ OPENAI_API_KEY: 'sk-super-secret-value-123' }))
    const json = JSON.stringify(r)
    expect(json).not.toContain('sk-super-secret-value-123')
    expect(json).not.toContain(TEST_COMPANY_ID) // company id も出さない
    expect(json).not.toContain('a1') // applicant id も出さない
    expect(json).not.toMatch(/@|090|080|電話|メール/) // PII 兆候なし
    // reasons/warnings は code 文字列のみ
    for (const code of [...r.reasons, ...r.warnings]) expect(code).toMatch(/^[A-Z_]+$/)
  })

  it('#13 client spoof 不可: 入力は server 解決 facts + env のみで、client 値を受け付けない', () => {
    // company/model/gate はすべて env or server-resolved facts 由来。関数シグネチャに client 入力は無い。
    // demo company を「非demoのふり」で渡しても facts は server read 前提。ここでは env allowlist を
    // spoof しても、facts.company.is_demo が true なら必ず BLOCKED になることを示す。
    const spoof = evaluateRealtimeSmokePreflight(
      readyFacts({ company: { id: TEST_COMPANY_ID, is_demo: true } }),
      readyEnv({ OPENAI_REALTIME_COMPANY_IDS: TEST_COMPANY_ID }),
    )
    expect(spoof.status).toBe('BLOCKED')
    expect(spoof.reasons).toContain('COMPANY_IS_DEMO')
  })

  it('#14/#15 Transcript/Evaluation gate が OFF でも READY（依存しない）', () => {
    const r = evaluateRealtimeSmokePreflight(
      readyFacts(),
      readyEnv({ TRANSCRIPT_INGEST_ENABLED: undefined, OPENAI_EVALUATION_ENABLED: undefined }),
    )
    expect(r.status).toBe('READY')
    expect(r.checks.transcriptGateIndependent).toBe(true)
    expect(r.checks.evaluationGateIndependent).toBe(true)
  })

  it('公開前 blocker(TRUST_BOUNDARY) を READY でも常に warning として提示する', () => {
    const r = evaluateRealtimeSmokePreflight(readyFacts(), readyEnv())
    expect(r.warnings).toContain('TRUST_BOUNDARY_SDP_PROXY_PUBLIC_LAUNCH_BLOCKER')
  })
})

// route の「gate/key を OpenAI fetch より前に必ず確認する」構造を source-level で固定（#1/#13）。
describe('realtime routes: OpenAI 到達前に gate/key/allowlist を確認（source-guard）', () => {
  const CALL = readFileSync(join(process.cwd(), 'app/api/interview/[slug]/realtime-call/route.ts'), 'utf8')
  const SESSION = readFileSync(join(process.cwd(), 'app/api/interview/[slug]/realtime-session/route.ts'), 'utf8')
  for (const [name, src] of [
    ['realtime-call', CALL],
    ['realtime-session', SESSION],
  ] as const) {
    it(`${name}: isRealtimeEnabled と OPENAI_API_KEY チェックが fetch より前にある`, () => {
      const idxGate = src.indexOf('isRealtimeEnabled()')
      const idxKey = src.indexOf('OPENAI_API_KEY')
      const idxFetch = src.indexOf('fetch(')
      expect(idxGate).toBeGreaterThan(0)
      expect(idxKey).toBeGreaterThan(0)
      expect(idxFetch).toBeGreaterThan(0)
      expect(idxGate).toBeLessThan(idxFetch)
      expect(idxKey).toBeLessThan(idxFetch)
    })
  }
  it('realtime-call: company/model は server 解決（client の model/company を使わない）', () => {
    expect(CALL).toContain('isCompanyAllowed(company)')
    expect(CALL).toContain('resolveRealtimeModel()')
    expect(CALL).not.toMatch(/body\.(model|company_id|is_demo)/)
  })
})
