import { type NextRequest } from 'next/server'
import { successJson, apiError } from '@/lib/api/response'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { verifyInterviewToken } from '@/lib/interview/capability-token'

// node:crypto（token検証）を使うため Node runtime を明示
export const runtime = 'nodejs'

// 公開面接フロー: 面接終了（service-role）。token で本人のフローだけ許可し、
// interviews と applicants の status を確定する（anon RLS では applicants を更新できないため）。
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params
    const body = await request.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return apiError('VALIDATION_ERROR', 'リクエストボディが不正です')
    }

    // token 検証（署名・exp）＋ slug / applicant_id の一致
    const payload = verifyInterviewToken(typeof body.token === 'string' ? body.token : null)
    if (!payload) return apiError('UNAUTHORIZED', 'トークンが無効です')
    if (payload.slug !== slug) return apiError('UNAUTHORIZED', 'トークンが一致しません')
    const applicantId = typeof body.applicant_id === 'string' ? body.applicant_id : ''
    if (!applicantId || applicantId !== payload.applicant_id) {
      return apiError('UNAUTHORIZED', 'applicant_id が一致しません')
    }

    const interviewId = typeof body.interview_id === 'string' ? body.interview_id : ''
    if (!interviewId) return apiError('VALIDATION_ERROR', 'interview_id は必須です')

    const finalStatus = body.final_status
    if (finalStatus !== 'completed' && finalStatus !== 'cancelled') {
      return apiError('VALIDATION_ERROR', 'final_status は completed または cancelled のみ')
    }

    const supabase = createServiceRoleClient()

    // slug → 企業特定。
    // ※ 企業停止（is_suspended）は「新規 start」だけを抑止する。開始済み（in_progress）面接の確定（/end）は、
    //   token / interview / applicant の整合が取れていれば通す。停止で /end を 403 にすると、
    //   面接中に管理者が停止した場合に interview が in_progress のまま固着し、applicants も更新されないため。
    const { data: company, error: compError } = await supabase
      .from('companies')
      .select('id')
      .eq('interview_slug', slug)
      .single()
    if (compError || !company) return apiError('NOT_FOUND', '無効な面接URLです')

    // applicant 実在＆当該企業所属
    const { data: applicant, error: appError } = await supabase
      .from('applicants')
      .select('id, company_id')
      .eq('id', applicantId)
      .single()
    if (appError || !applicant) return apiError('NOT_FOUND', '応募者が見つかりません')
    if (applicant.company_id !== company.id) return apiError('FORBIDDEN', '不正なリクエストです')

    // interview 実在＆applicant 一致（現在の status / 課金算出用の started_at も取得）
    const { data: interview, error: ivError } = await supabase
      .from('interviews')
      .select('id, applicant_id, status, started_at')
      .eq('id', interviewId)
      .single()
    if (ivError || !interview) return apiError('NOT_FOUND', '面接が見つかりません')
    if (interview.applicant_id !== applicantId) return apiError('FORBIDDEN', '不正なリクエストです')

    // 二重送信/トークン再利用対策: in_progress（更新可能な状態）のときだけ確定する。
    // completed / cancelled 等の終了済みは上書きせず、冪等に現状を返す。
    if (interview.status !== 'in_progress') {
      return successJson({
        interview_id: interviewId,
        final_status: interview.status,
        already_finalized: true,
      })
    }

    // 課金は応募者制御の入力（body.duration_seconds）を信用しない。
    // サーバ保存の started_at とサーバ終了時刻の差分で算出する（10分超の面接後に 0 を送る等の過少申告で課金回避させない）。
    const endedAtIso = new Date().toISOString()
    const startedAtMs = interview.started_at ? new Date(interview.started_at).getTime() : NaN
    const durationSeconds = Number.isFinite(startedAtMs)
      ? Math.max(0, Math.floor((new Date(endedAtIso).getTime() - startedAtMs) / 1000))
      : 0
    // 課金判定（INT-009）: 10分超の利用は途中離脱でも従量課金対象（サーバ算出値で判定）
    const isBillable = durationSeconds > 600

    // 対象 interview を確定（status='in_progress' 条件付きUPDATEで競合時の二重確定も防ぐ）
    const { data: updatedRows, error: updError } = await supabase
      .from('interviews')
      .update({
        status: finalStatus,
        ended_at: endedAtIso,
        duration_seconds: durationSeconds,
        total_questions: typeof body.total_questions === 'number' ? body.total_questions : null,
        answered_questions: typeof body.answered_questions === 'number' ? body.answered_questions : null,
        end_reason: typeof body.end_reason === 'string' ? body.end_reason : null,
        is_billable: isBillable,
      })
      .eq('id', interviewId)
      .eq('status', 'in_progress')
      .select('id')
    if (updError) return apiError('INTERNAL_ERROR', '面接の終了処理に失敗しました')
    // 並行リクエストに先に確定された場合（0件）は applicant 更新を行わず冪等に返す
    if (!updatedRows || updatedRows.length === 0) {
      return successJson({
        interview_id: interviewId,
        final_status: finalStatus,
        already_finalized: true,
      })
    }

    // 新セッション保持の race ガード: この面接より後に started_at がある in_progress
    //（＝並行 /start が作った新しい面接セッション）が存在する場合は、applicant の terminal 確定
    //（status='完了'/'途中離脱'・result='不採用'）をスキップする。最終確定は新セッションの /end に委ね、
    // 進行中の応募者を誤って 途中離脱/不採用 にして stale な結果を残さないようにする。
    const { data: newerInProgress } = await supabase
      .from('interviews')
      .select('id')
      .eq('applicant_id', applicantId)
      .eq('status', 'in_progress')
      .neq('id', interviewId)
      .gt('started_at', interview.started_at)
      .limit(1)
      .maybeSingle()

    if (!newerInProgress) {
      // applicants.status をサーバ確定（anon では更新できないためここで確定する）
      const applicantStatus = finalStatus === 'completed' ? '完了' : '途中離脱'
      const applicantUpdate: Record<string, unknown> = {
        status: applicantStatus,
        updated_at: new Date().toISOString(),
      }
      if (applicantStatus === '途中離脱') applicantUpdate.result = '不採用'
      await supabase.from('applicants').update(applicantUpdate).eq('id', applicantId)
    }

    // 同一 applicant の「この面接より前に開始された」他の in_progress 孤児だけを finalize（cancelled）。
    // ※ ブランケット更新だと、リロード等で並行する /start が挿入した「後から始まった新しい in_progress」まで
    //   巻き込み、ended_at < started_at / duration_seconds=null の不整合行を生む（新セッションを即殺してしまう）。
    //   started_at で「この面接以前」に限定し、後発の新面接は触らない。
    //   巻き込む正当な孤児は started_at からサーバ算出した duration で is_billable を確定する（/start の孤児finalizeと同方式）。
    const cleanupNowIso = new Date().toISOString()
    const { data: olderOrphans } = await supabase
      .from('interviews')
      .select('id, started_at')
      .eq('applicant_id', applicantId)
      .eq('status', 'in_progress')
      .neq('id', interviewId)
      .lte('started_at', interview.started_at)
    for (const orphan of olderOrphans ?? []) {
      const startedMs = orphan.started_at ? new Date(orphan.started_at).getTime() : NaN
      const dur = Number.isFinite(startedMs)
        ? Math.max(0, Math.floor((new Date(cleanupNowIso).getTime() - startedMs) / 1000))
        : 0
      await supabase
        .from('interviews')
        .update({ status: 'cancelled', ended_at: cleanupNowIso, duration_seconds: dur, is_billable: dur > 600 })
        .eq('id', orphan.id)
        .eq('status', 'in_progress')
    }

    return successJson({ interview_id: interviewId, final_status: finalStatus })
  } catch {
    return apiError('INTERNAL_ERROR')
  }
}
