// OpenAI Realtime（GA・音声AI面接）の純関数群。fetch はルート側が行い、ここは副作用なし＝単体テスト可能。
// フラグ/モデル/企業ガード/instructions/payload を提供する。API キーはここでは扱わない。

import {
  REALTIME_DEFAULT_MODEL,
  REALTIME_ALLOWED_MODELS,
  REALTIME_VOICE,
  REALTIME_TRANSCRIPTION_MODEL,
  REALTIME_MAX_FOLLOWUPS,
} from '@/lib/config/openai'
import { DEMO_COMPANY_ID } from '@/lib/config/demo'

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
    '最後の質問が終わったら、丁寧にお礼を述べて面接を締めくくってください。',
    '以下の質問リストの順に進めてください:',
    numbered,
  ].join('\n')
}

// GA /v1/realtime/client_secrets のリクエスト payload（session ラッパー・audio 入出力ネスト）。
export function buildClientSecretPayload(input: {
  model: string
  instructions: string
  voice?: string
}): Record<string, unknown> {
  return {
    session: {
      type: 'realtime',
      model: input.model,
      instructions: input.instructions,
      audio: {
        input: {
          transcription: { model: REALTIME_TRANSCRIPTION_MODEL },
          turn_detection: { type: 'server_vad' },
        },
        output: { voice: input.voice ?? REALTIME_VOICE },
      },
    },
  }
}
