// PR-R1-A: 実行時に評価 Provider を解決する（fail-closed）。gate OFF / API Key 無しでは provider を返さない。
//   これにより「gate OFF なのに OpenAI を呼ぶ」経路を型/実行時の両方で塞ぐ（本 PR の OpenAI actual = 0 を担保）。
//   R1-B では OPENAI_EVALUATION_ENABLED=true + OPENAI_API_KEY + OPENAI_EVALUATION_MODEL を設定するだけで有効化。

import { isEvaluationEnabled, resolveEvaluationModel, evaluationRequestOptionsForModel } from '@/lib/config/evaluation'
import { createOpenAiEvaluationProvider } from './openai-provider'
import type { EvaluationProvider } from './service'

export type ProviderResolution =
  | { ok: true; provider: EvaluationProvider; model: string }
  | { ok: false; reason: 'gate_disabled' | 'api_key_missing' | 'model_missing' }

// env（gate / key / model）から provider を解決。いずれか欠ければ fail-closed（provider を返さない＝呼び出さない）。
export function resolveEvaluationProvider(env: NodeJS.ProcessEnv = process.env): ProviderResolution {
  if (!isEvaluationEnabled()) return { ok: false, reason: 'gate_disabled' }
  const apiKey = env.OPENAI_API_KEY
  if (typeof apiKey !== 'string' || apiKey.trim().length === 0) return { ok: false, reason: 'api_key_missing' }
  const model = resolveEvaluationModel()
  if (!model) return { ok: false, reason: 'model_missing' }
  // model capability に応じて temperature/reasoning を出し分け（reasoning model へ temperature を送らない）。
  const requestOptions = evaluationRequestOptionsForModel(model, env)
  return { ok: true, provider: createOpenAiEvaluationProvider({ apiKey: apiKey.trim(), model, requestOptions }), model }
}
