// OpenAI Realtime（GA・音声AI面接）の純関数群。fetch はルート側が行い、ここは副作用なし＝単体テスト可能。
// フラグ/モデル/企業ガード/instructions/payload を提供する。API キーはここでは扱わない。

import { createHash } from 'node:crypto'
import {
  REALTIME_DEFAULT_MODEL,
  REALTIME_ALLOWED_MODELS,
  REALTIME_VOICE,
  REALTIME_TRANSCRIPTION_MODEL,
  REALTIME_MAX_FOLLOWUPS,
} from '@/lib/config/openai'
import { DEMO_COMPANY_ID } from '@/lib/config/demo'

// 面接完了シグナル用のサーバー定義 function tool 名（realtime-client.ts の COMPLETE_INTERVIEW_TOOL と一致させる）。
export const COMPLETE_INTERVIEW_TOOL = 'complete_interview'

// フィーチャーフラグ: 厳格に 'true' のときだけ有効（未設定/他値は無効＝既定 OFF）。
export function isRealtimeEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.OPENAI_REALTIME_ENABLED === 'true'
}

// モデル解決: OPENAI_REALTIME_MODEL が許可候補（gpt-realtime / gpt-realtime-2）なら採用、それ以外/未設定は既定。
export function resolveRealtimeModel(env: NodeJS.ProcessEnv = process.env): string {
  const m = (env.OPENAI_REALTIME_MODEL ?? '').trim()
  return (REALTIME_ALLOWED_MODELS as readonly string[]).includes(m) ? m : REALTIME_DEFAULT_MODEL
}

// 企業ガード: is_demo / テスト株式会社(DEMO_COMPANY_ID) は Realtime 禁止。
// OPENAI_REALTIME_COMPANY_IDS（カンマ区切り）が設定されている場合は、そのIDのみ許可（段階ロールアウト）。
export function isCompanyAllowed(
  company: { id: string; is_demo?: boolean | null },
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (company.is_demo === true) return false
  if (company.id === DEMO_COMPANY_ID) return false
  const raw = (env.OPENAI_REALTIME_COMPANY_IDS ?? '').trim()
  if (raw.length > 0) {
    const allow = raw.split(',').map((s) => s.trim()).filter(Boolean)
    return allow.includes(company.id)
  }
  return true
}

type SnapshotQuestion = { question_text?: unknown }

// questions_snapshot（凍結済みの質問配列）→ 音声面接官の instructions。
// 非配列/空/有効な question_text なし → null（呼び出し側が SNAPSHOT_NOT_READY を返す）。
export function buildRealtimeInstructions(
  snapshot: unknown,
  opts?: { language?: string },
): string | null {
  if (!Array.isArray(snapshot) || snapshot.length === 0) return null
  const questions = snapshot
    .map((q) =>
      q && typeof (q as SnapshotQuestion).question_text === 'string'
        ? ((q as SnapshotQuestion).question_text as string)
        : null,
    )
    .filter((t): t is string => !!t && t.trim().length > 0)
  if (questions.length === 0) return null

  const lang = opts?.language && opts.language.trim() ? opts.language.trim() : 'ja'
  const numbered = questions.map((t, i) => `${i + 1}. ${t}`).join('\n')
  return [
    'あなたはプロの採用面接官です。応募者と自然な音声会話で面接を行います。',
    `使用言語: ${lang}。丁寧かつ簡潔に、1問ずつ順番に質問してください。`,
    `各質問について、必要に応じて最大${REALTIME_MAX_FOLLOWUPS}回まで自然に深掘りしてください。`,
    '質問を飛ばしたり、勝手に新しい評価質問を追加したりしないでください。',
    `質問リストは全${questions.length}問です。必ず1番から順に、全ての質問を尋ね終えてください。`,
    '最後の質問が終わったら、丁寧にお礼を述べて面接を締めくくってください。',
    // 全質問完了シグナル: 発話数ではなく明示的な function 呼び出しで確実に終了を伝える。
    `締めのお礼を述べた後にのみ、必ず ${COMPLETE_INTERVIEW_TOOL} 関数を1回だけ呼び出して面接の完了を通知してください。`,
    `${COMPLETE_INTERVIEW_TOOL} は全${questions.length}問を順に尋ね終えるまで絶対に呼び出さないでください。途中で呼び出してはいけません。`,
    '以下の質問リストの順に進めてください:',
    numbered,
  ].join('\n')
}

// Realtime session に載せる function tool 定義（GA はフラット形 {type:'function', name, description, parameters}）。
// AI が全質問を尋ね終えて締めのお礼を述べた後に complete_interview を呼ぶ。引数は取らない（誤用面を最小化）。
export function buildRealtimeTools(): Record<string, unknown>[] {
  return [
    {
      type: 'function',
      name: COMPLETE_INTERVIEW_TOOL,
      description:
        'リストの全質問を順に尋ね終え、締めのお礼を述べた後にのみ呼び出す。面接が正常に完了したことを通知する。途中では呼び出さない。',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  ]
}

// サーバー確定の Realtime session 設定（model/instructions/audio/transcription/turn_detection）。
// realtime-call（SDP proxy）と realtime-session（client_secret・代替経路）が共有する。
// これをサーバー側で確定して OpenAI へ渡すことで、クライアントによる model/instructions の
// 作成時上書きを排除する（残余の接続後 session.update はアカウント側モデル制限＋評価側逸脱検知で担保）。
export function buildRealtimeSessionConfig(input: {
  model: string
  instructions: string
  voice?: string
}): Record<string, unknown> {
  return {
    type: 'realtime',
    model: input.model,
    instructions: input.instructions,
    // 全質問完了を明示シグナル化するサーバー定義 tool（発話数カウントに依存しない終了検知）。
    tools: buildRealtimeTools(),
    tool_choice: 'auto',
    audio: {
      input: {
        transcription: { model: REALTIME_TRANSCRIPTION_MODEL },
        turn_detection: { type: 'server_vad' },
      },
      output: { voice: input.voice ?? REALTIME_VOICE },
    },
  }
}

// GA /v1/realtime/client_secrets のリクエスト payload（session ラッパー）。realtime-session（PR-1・代替経路）用。
export function buildClientSecretPayload(input: {
  model: string
  instructions: string
  voice?: string
}): Record<string, unknown> {
  return { session: buildRealtimeSessionConfig(input) }
}

// OpenAI-Safety-Identifier 用の安定・不可逆ID。applicant_id/interview_id をそのまま出さず sha256 で秘匿。
// 同一応募者で安定（＝OpenAI 側のレート/濫用検知に使える）だが、生の内部IDは復元不可。
export function computeSafetyIdentifier(seed: string): string {
  const h = createHash('sha256').update(`ai-jinji:${seed}`).digest('hex')
  return `aj_${h.slice(0, 32)}`
}
