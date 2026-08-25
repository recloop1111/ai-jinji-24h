// Phase R1: OpenAI Realtime「実スモーク」開始前の副作用ゼロ preflight（純関数）。
//
// 目的:
//   本番で初めて OpenAI Realtime を実接続する前に、「1社限定・短時間・低コスト・即OFF可能」の
//   前提が満たされているかを OpenAI へ一切接続せず判定する。READY / BLOCKED と安全な reason code
//   だけを返す。secret / API key / token / 応募者PII は絶対に返さない（結果は boolean と code のみ）。
//
// 設計:
//   - HTTP endpoint は新設しない（診断口＝攻撃面の増加を避ける）。本 module は純関数のみで、
//     検証は vitest（test でのみ直接関数検証）で行う。DB 読み取りは呼び出し側（service-role）が担い、
//     解決済み facts を渡す（本関数は DB / network / env 書き込みを一切しない）。
//   - 判定ロジックは realtime-call ルートの実ガードと同じ純関数を再利用する（乖離を防ぐ）:
//     isRealtimeEnabled / isCompanyAllowed / resolveRealtimeModel / buildRealtimeInstructions /
//     needsFreeze / isDefaultQuestionSnapshot。
//   - スモーク用途のため、ルートより「厳格」にする点が1つある: allowlist（OPENAI_REALTIME_COMPANY_IDS）が
//     空だと BLOCKED（ルートは空許容だが、スモークでは必ず 1 社明示を要求＝誤って全企業許可にしない）。

import {
  isRealtimeEnabled,
  isCompanyAllowed,
  buildRealtimeInstructions,
} from '@/lib/openai/realtime'
import { REALTIME_ALLOWED_MODELS } from '@/lib/config/openai'
import { MAX_INTERVIEW_SECONDS } from '@/lib/config/interview-policy'
import { REALTIME_CALL_LOCK_TTL_MS } from '@/lib/interview/realtime-call-lock'
import { needsFreeze } from '@/lib/interview/frozenQuestions'
import { isDefaultQuestionSnapshot } from '@/lib/interview/assembleQuestions'

export type RealtimePreflightReason =
  | 'GATE_DISABLED' // OPENAI_REALTIME_ENABLED !== 'true'
  | 'API_KEY_MISSING' // OPENAI_API_KEY 未設定（存在のみ確認・値は扱わない）
  | 'ALLOWLIST_MISSING' // OPENAI_REALTIME_COMPANY_IDS 未設定/空（スモークは 1 社明示必須）
  | 'COMPANY_NOT_FOUND'
  | 'COMPANY_SUSPENDED'
  | 'COMPANY_IS_DEMO' // demo 企業は Realtime 構造的に禁止（維持）
  | 'COMPANY_NOT_ALLOWLISTED'
  | 'APPLICANT_NOT_FOUND'
  | 'APPLICANT_WRONG_COMPANY'
  | 'INTERVIEW_NOT_FOUND'
  | 'INTERVIEW_WRONG_APPLICANT'
  | 'INTERVIEW_NOT_IN_PROGRESS'
  | 'SNAPSHOT_NOT_FROZEN' // questions_snapshot 未凍結/空/既定のみ/命令生成不可
  | 'MODEL_INVALID' // OPENAI_REALTIME_MODEL が明示されているが許可候補外
  | 'ACTIVE_LOCK' // 同一 interview に有効な realtime-call ロックが存在
  | 'COST_GUARD_INVALID' // 面接時間上限 / ロック TTL が不正

// READY を妨げないが人間へ必ず提示する警告（公開前 blocker 等）。
export type RealtimePreflightWarning =
  // SDP-proxy 方式は接続後に client が session.update 等で instructions/tools を改変し得る既知の
  // 信頼境界の限界（lib/openai/realtime.ts 参照）。R1=自社テスターの管理下 1 セッションなら許容だが、
  // 「一般応募者への公開」は恒久対策（server relay / Option B, docs/REALTIME_SESSION_TRUST_DESIGN.md）
  // の完了を必須 blocker とする。
  | 'TRUST_BOUNDARY_SDP_PROXY_PUBLIC_LAUNCH_BLOCKER'

export interface RealtimePreflightFacts {
  // slug から解決した対象企業（service-role read の結果）。存在しなければ null。
  company: { id: string; is_demo?: boolean | null; is_suspended?: boolean | null } | null
  // 対象応募者（company 所属の再検証用）。
  applicant: { id: string; company_id: string } | null
  // 対象 interview（in_progress / 凍結 snapshot / ロック確認用）。
  interview: {
    id: string
    applicant_id: string
    status: string
    questions_snapshot: unknown
    realtime_call_locked_until?: string | null
  } | null
  nowMs: number
}

export interface RealtimePreflightPolicy {
  maxInterviewSeconds: number
  lockTtlMs: number
  allowedModels: readonly string[]
}

export const DEFAULT_REALTIME_PREFLIGHT_POLICY: RealtimePreflightPolicy = {
  maxInterviewSeconds: MAX_INTERVIEW_SECONDS,
  lockTtlMs: REALTIME_CALL_LOCK_TTL_MS,
  allowedModels: REALTIME_ALLOWED_MODELS,
}

export interface RealtimePreflightResult {
  status: 'READY' | 'BLOCKED'
  reasons: RealtimePreflightReason[]
  warnings: RealtimePreflightWarning[]
  // 安全な boolean チェックのみ（id / secret / token / PII は含めない）。
  checks: {
    gateEnabled: boolean
    apiKeyPresent: boolean
    allowlistConfigured: boolean
    companyAllowed: boolean
    companyNonDemo: boolean
    interviewInProgress: boolean
    snapshotFrozen: boolean
    noActiveLock: boolean
    modelValid: boolean
    costGuardValid: boolean
    // R1 は transcript / evaluation gate に依存しない（OFF のままスモーク可能）を明示。
    transcriptGateIndependent: true
    evaluationGateIndependent: true
  }
}

function isActiveLock(lockedUntil: string | null | undefined, nowMs: number): boolean {
  if (!lockedUntil) return false
  const t = Date.parse(lockedUntil)
  return Number.isFinite(t) && t > nowMs
}

/**
 * Realtime 実スモークの前提を副作用ゼロで判定する純関数。
 * OpenAI / DB / network へ接続せず、渡された facts + env + policy だけで評価する。
 * client 由来の値は入力にならない（company/interview は server 解決済み、model/gate は env）。
 */
export function evaluateRealtimeSmokePreflight(
  facts: RealtimePreflightFacts,
  env: NodeJS.ProcessEnv = process.env,
  policy: RealtimePreflightPolicy = DEFAULT_REALTIME_PREFLIGHT_POLICY,
): RealtimePreflightResult {
  const reasons: RealtimePreflightReason[] = []

  // 1) gate（厳格 === 'true'）
  const gateEnabled = isRealtimeEnabled(env)
  if (!gateEnabled) reasons.push('GATE_DISABLED')

  // 2) API key は「存在のみ」確認（値は絶対に読まない/返さない）
  const apiKeyPresent = typeof env.OPENAI_API_KEY === 'string' && env.OPENAI_API_KEY.trim().length > 0
  if (!apiKeyPresent) reasons.push('API_KEY_MISSING')

  // 3) allowlist はスモークで必須（空なら BLOCKED＝誤って全非demo企業を許可しない）
  const allowlistRaw = (env.OPENAI_REALTIME_COMPANY_IDS ?? '').trim()
  const allowlistConfigured = allowlistRaw.length > 0
  if (!allowlistConfigured) reasons.push('ALLOWLIST_MISSING')

  // 4) company（server 解決）
  const { company, applicant, interview } = facts
  let companyNonDemo = false
  let companyAllowed = false
  if (!company) {
    reasons.push('COMPANY_NOT_FOUND')
  } else {
    if (company.is_suspended === true) reasons.push('COMPANY_SUSPENDED')
    companyNonDemo = company.is_demo !== true
    if (!companyNonDemo) reasons.push('COMPANY_IS_DEMO')
    // allowlist が設定済みなら含有必須。demo 禁止は isCompanyAllowed が保証（多層防御で再チェック）。
    if (allowlistConfigured) {
      const allow = allowlistRaw.split(',').map((s) => s.trim()).filter(Boolean)
      if (!allow.includes(company.id)) reasons.push('COMPANY_NOT_ALLOWLISTED')
    }
    // ルート実ガードと同一関数で最終判定（demo/DEMO_COMPANY_ID/allowlist を一括で担保）。
    companyAllowed = isCompanyAllowed(company, env) && allowlistConfigured
  }

  // 5) applicant（当該 company 所属の再検証）
  if (!applicant) {
    reasons.push('APPLICANT_NOT_FOUND')
  } else if (company && applicant.company_id !== company.id) {
    reasons.push('APPLICANT_WRONG_COMPANY')
  }

  // 6) interview（in_progress / 凍結 snapshot / active lock）
  let interviewInProgress = false
  let snapshotFrozen = false
  let noActiveLock = true
  if (!interview) {
    reasons.push('INTERVIEW_NOT_FOUND')
  } else {
    if (applicant && interview.applicant_id !== applicant.id) reasons.push('INTERVIEW_WRONG_APPLICANT')
    interviewInProgress = interview.status === 'in_progress'
    if (!interviewInProgress) reasons.push('INTERVIEW_NOT_IN_PROGRESS')
    // 凍結済み: 非空配列 かつ 既定質問のみでない かつ instructions 生成可能。
    const frozen =
      !needsFreeze(interview.questions_snapshot) &&
      !isDefaultQuestionSnapshot(interview.questions_snapshot) &&
      buildRealtimeInstructions(interview.questions_snapshot) !== null
    snapshotFrozen = frozen
    if (!frozen) reasons.push('SNAPSHOT_NOT_FROZEN')
    if (isActiveLock(interview.realtime_call_locked_until, facts.nowMs)) {
      noActiveLock = false
      reasons.push('ACTIVE_LOCK')
    }
  }

  // 7) model（明示された場合のみ検証。未設定は既定モデルで有効）
  const modelRaw = (env.OPENAI_REALTIME_MODEL ?? '').trim()
  const modelValid = modelRaw.length === 0 || policy.allowedModels.includes(modelRaw)
  if (!modelValid) reasons.push('MODEL_INVALID')

  // 8) cost guard（面接時間上限 / ロック TTL が正の有限値）
  const costGuardValid =
    Number.isFinite(policy.maxInterviewSeconds) &&
    policy.maxInterviewSeconds > 0 &&
    Number.isFinite(policy.lockTtlMs) &&
    policy.lockTtlMs > 0
  if (!costGuardValid) reasons.push('COST_GUARD_INVALID')

  return {
    status: reasons.length === 0 ? 'READY' : 'BLOCKED',
    reasons,
    // R1 を実行する限り、公開前 blocker を常に提示する（READY でも黙らせない）。
    warnings: ['TRUST_BOUNDARY_SDP_PROXY_PUBLIC_LAUNCH_BLOCKER'],
    checks: {
      gateEnabled,
      apiKeyPresent,
      allowlistConfigured,
      companyAllowed,
      companyNonDemo,
      interviewInProgress,
      snapshotFrozen,
      noActiveLock,
      modelValid,
      costGuardValid,
      transcriptGateIndependent: true,
      evaluationGateIndependent: true,
    },
  }
}
