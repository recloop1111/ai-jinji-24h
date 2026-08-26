// PR-R1-A: Realtime 生 transcript event を server 権威 ingest route（/api/interview/[slug]/transcript）へ送る client sender。
//   最重要（server 権威・P2 維持）:
//     * client は speaker/source/seq/final/dedup_key を送らない・server が event_type から導出する。
//     * 送るのは token / applicant_id / interview_id と event metadata（event_type/item_id/content_index/response_id/
//       language）＋ transcript（内容は untrusted・server は構造のみ権威化）。
//     * best-effort: gate OFF（503）/ネットワーク失敗でも面接を止めない（例外を投げない）。
//     * FINAL event 以外（partial/delta/未知）は送らない（server も reject するが手前で無駄打ちしない）。
//   本 PR では TRANSCRIPT_INGEST_ENABLED が OFF のため、実際には route が 503 を返し DB へ到達しない。

import { parseRealtimeTranscriptEvent } from './realtime-transcript-adapter'

export interface TranscriptSendContext {
  slug: string
  token: string
  applicantId: string
  interviewId: string
  language?: string | null
}

export interface TranscriptPostPlan {
  url: string
  body: Record<string, unknown>
}

// 生 event + auth context → POST plan（純関数・送信しない）。FINAL でない/欠損 event は null。
export function buildTranscriptPostPlan(evt: unknown, ctx: TranscriptSendContext): TranscriptPostPlan | null {
  const meta = parseRealtimeTranscriptEvent(evt)
  if (!meta) return null // partial/delta/未知 → 送らない
  if (typeof meta.text !== 'string' || meta.text.trim().length === 0) return null
  // server が dedup に必要とする item_id/content_index が欠ける FINAL は送っても 400 になる → 手前で捨てる。
  if (meta.itemId === null || meta.contentIndex === null) return null
  const o = evt as Record<string, unknown>
  return {
    url: `/api/interview/${encodeURIComponent(ctx.slug)}/transcript`,
    body: {
      token: ctx.token,
      applicant_id: ctx.applicantId,
      interview_id: ctx.interviewId,
      // server は event_type から speaker/source/final を導出する（client の speaker/source は送らない）。
      event_type: typeof o.type === 'string' ? o.type : '',
      transcript: meta.text,
      item_id: meta.itemId,
      content_index: meta.contentIndex,
      response_id: meta.responseId,
      language: ctx.language ?? null,
    },
  }
}

export type TranscriptSendOutcome = 'sent' | 'skipped' | 'disabled' | 'error'

// best-effort 送信（例外を投げない）。戻り値は運用観測用（面接フローは戻り値に依存しない）。
export async function sendTranscriptEvent(
  evt: unknown,
  ctx: TranscriptSendContext,
  fetchImpl: typeof fetch = fetch,
): Promise<TranscriptSendOutcome> {
  const plan = buildTranscriptPostPlan(evt, ctx)
  if (!plan) return 'skipped'
  try {
    const res = await fetchImpl(plan.url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(plan.body),
    })
    if (res.status === 503) return 'disabled' // gate OFF（TRANSCRIPT_INGEST_ENABLED 未設定）
    return res.ok ? 'sent' : 'error'
  } catch {
    return 'error' // ネットワーク失敗でも面接を止めない
  }
}
