import { type NextRequest } from 'next/server'
import { apiError, errorJson, successJson } from '@/lib/api/response'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { verifyInterviewToken } from '@/lib/interview/capability-token'
import { isTranscriptIngestEnabled } from '@/lib/config/transcript'
import { handleTranscriptIngestion, type IngestionHandlerDeps } from '@/lib/interview/transcript-ingestion-handler'
import { createProductionIngestionContext } from '@/lib/interview/transcript-ingestion-production'

// 公開面接フロー: Transcript 取り込み（secure ingestion・既定 OFF）。
// node:crypto（token 検証）を使うため Node runtime。
export const runtime = 'nodejs'

// 【重要 / 信頼境界・本番 OFF】
//   - TRANSCRIPT_INGEST_ENABLED === 'true' でのみ有効。本番未設定＝OFF＝最上流 503（保存経路へ到達しない）。
//   - gate OFF 時は service-role client 生成・DB read・allocator RPC・transcript 保存のいずれにも到達しない
//     （openContext を呼ばない）。
//   - サーバ権威化するのは tenant / interview / applicant / speaker / source / final / seq / dedup 構造。
//     transcript text 内容はブラウザ由来で暗号学的検証は不可（方式 A の既知限界。handler header 参照）。
//   - PII: 本文・氏名・token 等を error レスポンス / ログへ出さない（汎用コード/メッセージのみ・console 追加なし）。

// リクエストボディ全体の粗い上限（本文 20000 文字 + metadata の JSON overhead に十分な緩衝）。
const MAX_BODY_BYTES = 64 * 1024

export async function POST(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params

    // 粗い body サイズ上限（DB/token 検証前に巨大 payload を弾く）。
    const raw = await request.text()
    if (raw.length > MAX_BODY_BYTES) return errorJson('TRANSCRIPT_TOO_LARGE', 'Transcript が大きすぎます', 413)
    let body: unknown = null
    try {
      body = raw ? JSON.parse(raw) : null
    } catch {
      body = null
    }

    // 依存注入。openContext（service-role client 生成）は gate ON & token 有効時のみ handler から呼ばれる。
    const deps: IngestionHandlerDeps = {
      gate: isTranscriptIngestEnabled,
      verifyToken: verifyInterviewToken,
      openContext: () => createProductionIngestionContext(createServiceRoleClient()),
    }

    const result = await handleTranscriptIngestion(body, slug, deps)
    if (result.ok) return successJson(result.data, 200)
    return errorJson(result.code, result.message, result.httpStatus)
  } catch {
    return apiError('INTERNAL_ERROR')
  }
}
