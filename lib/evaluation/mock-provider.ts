// PR-P5: テスト/synthetic E2E 専用の決定的モック EvaluationProvider（OpenAI へ一切接続しない）。
//
// 目的:
//   * Provider interface（service.ts の EvaluationProvider）を満たし、evaluation pipeline 全体
//     （prompt → provider → validation/evidence/scoring → mapping → repository）を local で E2E するための double。
//   * 決定的（deterministic）: 同一 config + 同一 prompt → 常に同一 raw を返す（Date/random/network を使わない）。
//   * mockable な失敗系: normal / insufficient_data / malformed / error / timeout / partial-axis /
//     no-evidence / out-of-range を「構造として」再現し、validation 層が silent に正常化しないことを固定する。
//
// 【重要 / Production 誤用防止】
//   本 provider は「テスト double」であり Production runtime で評価に使ってはならない。構造ガード:
//     1. どの route/Service/orchestration にも import されていない（実配線ゼロ）。実 provider は 4E で別途接続する。
//     2. constructor で「実評価が有効な環境」を検出したら throw する（下記 assertMockUsageAllowed）。
//   これにより「gate ON（本番評価）なのに mock が動く」経路を型/実行時の両方で塞ぐ。
//
// evidence について:
//   provider は prompt（system/user 文字列）しか受け取らず、prompt は seq を含まない（PII/内部列を渡さないため）。
//   有効な evidence（seq が実在し quote が本文の部分文字列）を決定的に生成するには元発話の seq/quote が要るため、
//   本 double は config.evidenceSource（final 応募者発話の {seq, quote}）を明示注入できる。raw は
//   (mode, evidenceSource, prompt) の純関数であり、乱数・時刻に依存しない（＝決定的）。

import type { EvaluationProvider, ProviderResult } from './service'
import type { EvaluationPrompt } from './prompt'
import { EBCA_AXIS_IDS, EBCA_SCHEMA_VERSION } from './ebca'

export type MockEvaluationMode =
  | 'normal' // 6軸すべてに有効 evidence + 妥当 score → success
  | 'insufficient_data' // 全軸 score=null（判断材料不足）→ insufficient_data
  | 'malformed' // object でない raw（壊れた出力）→ parse で draft=null → insufficient_data（crash しない）
  | 'error' // provider レベルの permanent 失敗（{ok:false}）→ failed（保存しない）
  | 'timeout' // provider が throw（timeout 相当）→ service が temporary 失敗化 → retry/cooldown 対象
  | 'partial-axis' // 一部の軸のみ有効 evidence（他は evidence 無し）→ 有効軸のみ score 生存
  | 'no-evidence' // 全軸に score はあるが evidence 無し → validateAxisEvidence が全 null 化 → insufficient_data
  | 'out-of-range' // score が範囲外（999 / -5 / NaN）→ validation が null 正規化（silent clamp しない）

// final 応募者発話の {seq, quote}。quote は必ず本文の部分文字列にすること（isValidEvidence 準拠）。
export interface MockEvidenceSource {
  seq: number
  quote: string
}

export interface DeterministicMockConfig {
  mode: MockEvaluationMode
  // normal / partial-axis / out-of-range 用の有効 evidence 源。無指定なら evidence 無し扱い。
  evidenceSource?: readonly MockEvidenceSource[]
  // partial-axis で「有効 evidence を与える軸数」（既定 2）。
  partialAxisCount?: number
  schemaVersion?: string
  // Production ガードを迂回する明示フラグ（テスト内での意図的な検証のみ）。
  bypassProductionGuardForTest?: boolean
}

// gate ON（本番評価が有効）or 本番 runtime では mock を作れないようにする（誤配線の実行時検出）。
function assertMockUsageAllowed(bypass?: boolean): void {
  if (bypass) return
  const underTest =
    typeof process !== 'undefined' &&
    (process.env?.VITEST === 'true' || process.env?.NODE_ENV === 'test' || process.env?.NODE_ENV === 'development')
  const evaluationEnabled = typeof process !== 'undefined' && process.env?.OPENAI_EVALUATION_ENABLED === 'true'
  if (evaluationEnabled || !underTest) {
    throw new Error('DeterministicMockEvaluationProvider is test-only and must not run in production/evaluation-enabled runtime')
  }
}

// object → 決定的 raw JSON（乱数/時刻を使わない）。mode ごとに「validation が観測すべき異常」を構造化する。
// raw は prompt 内容に依存させない（config のみの純関数）＝同一 config なら prompt 差異に関わらず同一 raw。
function buildRaw(config: DeterministicMockConfig): unknown {
  const schemaVersion = config.schemaVersion ?? EBCA_SCHEMA_VERSION
  const evidenceSource = config.evidenceSource ?? []
  // 各軸へ「決定的だが軸ごとに異なる」score を割り当て（index ベース＝乱数なし）。
  const baseScores = [18, 16, 14, 12, 15, 13]

  const evidenceFor = (axisIndex: number): { seq: number; quote: string }[] => {
    if (evidenceSource.length === 0) return []
    const src = evidenceSource[axisIndex % evidenceSource.length]
    return [{ seq: src.seq, quote: src.quote }]
  }

  switch (config.mode) {
    case 'malformed':
      // object でない（parseEvaluationOutput が draft=null にする）。文字列を返す。
      return 'not-a-json-object'

    case 'insufficient_data':
      return {
        schema_version: schemaVersion,
        overall: { recommendation: 'neutral', confidence: 'low' },
        summary: '評価に十分な情報が得られませんでした。',
        axes: EBCA_AXIS_IDS.map((axisId) => ({
          axis_id: axisId,
          score: null,
          rank: null,
          confidence: 'low',
          insufficient_reason: '判断材料が不足しています',
          evidence: [],
          comment: null,
        })),
        strengths: [],
        concerns: [],
      }

    case 'no-evidence':
      // score はあるが evidence 無し → evidence-first で全 null 化されるべき。
      return {
        schema_version: schemaVersion,
        overall: { recommendation: 'yes', confidence: 'medium' },
        summary: 'evidence を伴わない評価（テスト）。',
        axes: EBCA_AXIS_IDS.map((axisId, i) => ({
          axis_id: axisId,
          score: baseScores[i],
          rank: 'B',
          confidence: 'medium',
          insufficient_reason: null,
          evidence: [],
          comment: 'コメント',
        })),
        strengths: [],
        concerns: [],
      }

    case 'out-of-range':
      // 範囲外 score（999 / -5 / NaN 相当）。silent clamp されず null 正規化されるべき。
      return {
        schema_version: schemaVersion,
        overall: { recommendation: 'neutral', confidence: 'low' },
        summary: '範囲外スコア（テスト）。',
        axes: EBCA_AXIS_IDS.map((axisId, i) => ({
          axis_id: axisId,
          score: [999, -5, 20.5, 'x', Infinity, 21][i], // すべて invalid（0-20 整数でない）
          rank: 'A',
          confidence: 'high',
          insufficient_reason: null,
          evidence: evidenceFor(i),
          comment: 'コメント',
        })),
        strengths: [],
        concerns: [],
      }

    case 'partial-axis': {
      const withEvidence = config.partialAxisCount ?? 2
      return {
        schema_version: schemaVersion,
        overall: { recommendation: 'yes', confidence: 'medium' },
        summary: '一部の軸のみ根拠あり（テスト）。',
        axes: EBCA_AXIS_IDS.map((axisId, i) => ({
          axis_id: axisId,
          score: baseScores[i],
          rank: 'B',
          confidence: i < withEvidence ? 'medium' : 'low',
          insufficient_reason: null,
          evidence: i < withEvidence ? evidenceFor(i) : [],
          comment: 'コメント',
        })),
        strengths: [],
        concerns: [],
      }
    }

    case 'normal':
    default:
      return {
        schema_version: schemaVersion,
        overall: { recommendation: 'yes', confidence: 'high' },
        summary: '全軸に根拠のある評価（テスト）。',
        axes: EBCA_AXIS_IDS.map((axisId, i) => ({
          axis_id: axisId,
          score: baseScores[i],
          rank: (['A', 'B', 'B', 'C', 'B', 'C'] as const)[i],
          confidence: 'high',
          insufficient_reason: null,
          evidence: evidenceFor(i),
          comment: `${axisId} の所見`,
        })),
        strengths: evidenceSource[0]
          ? [{ text: '具体的な行動の説明ができている', evidence: [{ seq: evidenceSource[0].seq, quote: evidenceSource[0].quote }] }]
          : [],
        concerns: [],
      }
  }
}

// 決定的モック provider。同一 config + 同一 prompt → 常に同一 raw。
export class DeterministicMockEvaluationProvider implements EvaluationProvider {
  private readonly config: DeterministicMockConfig
  constructor(config: DeterministicMockConfig) {
    assertMockUsageAllowed(config.bypassProductionGuardForTest)
    this.config = config
  }

  async evaluate(prompt: EvaluationPrompt): Promise<ProviderResult> {
    switch (this.config.mode) {
      case 'error':
        return { ok: false, failure: 'permanent' }
      case 'timeout':
        // provider の timeout/network を throw で再現（service が temporary 失敗化 → retry/cooldown）。
        throw new Error('MOCK_PROVIDER_TIMEOUT')
      default:
        void prompt // prompt は受け取るが raw には反映しない（決定性の担保）
        return { ok: true, raw: buildRaw(this.config) }
    }
  }
}

// 便宜ファクトリ（テストの読みやすさ用）。
export function createDeterministicMockProvider(config: DeterministicMockConfig): DeterministicMockEvaluationProvider {
  return new DeterministicMockEvaluationProvider(config)
}
