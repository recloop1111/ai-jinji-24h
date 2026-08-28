import { type NextRequest } from 'next/server'
import { successJson, apiError } from '@/lib/api/response'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { verifyInterviewToken } from '@/lib/interview/capability-token'
import { classifyTermination, computeIsBillable } from '@/lib/billing/interview-eligibility'
import { restoreProgress } from '@/lib/interview/interview-progress'

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

    // interview 実在＆applicant 一致（status / duration 算出用 started_at / 質問数 server 解決用 questions_snapshot）
    const { data: interview, error: ivError } = await supabase
      .from('interviews')
      .select('id, applicant_id, status, started_at, questions_snapshot')
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

    // 課金は応募者制御の入力（body.duration_seconds / body.is_billable）を信用しない。
    // duration はサーバ保存の started_at とサーバ終了時刻の差分で算出する（過少/過大申告で課金操作させない）。
    const endedAtIso = new Date().toISOString()
    const startedAtMs = interview.started_at ? new Date(interview.started_at).getTime() : NaN
    const durationSeconds = Number.isFinite(startedAtMs)
      ? Math.max(0, Math.floor((new Date(endedAtIso).getTime() - startedAtMs) / 1000))
      : 0

    // 課金判定（正式仕様・旧「開始後10分超で課金」は廃止/superseded）: 1 interview = 最大1 billing unit。
    //   A. completed / time_limit（面接時間の上限まで提供）→ 必ず billable。
    //   B. applicant_exit（本人の途中離脱）→ duration>=180s かつ（main質問50%以上回答〔ceil〕 or duration>=480s）。
    //   C. technical/system/forced/未確定 → 非課金。
    //   純ロジック = lib/billing/interview-eligibility.ts。**client の answered/total/is_billable は課金判定に使わない。**
    const category = classifyTermination({
      finalStatus,
      endReason: typeof body.end_reason === 'string' ? body.end_reason : null,
    })

    // main質問「総数」は server 側で解決する（client body は使わない）。
    //   SoT: interviews.questions_snapshot（面接中に server 保存された「実際に提示した main 質問」）の件数。
    //   AI 深掘り/follow-up/turn は含まない（snapshot は main 質問のみ）。取得不能は null（50%ルール不適用）。
    const snapshot = (interview as { questions_snapshot?: unknown }).questions_snapshot
    const serverTotalMain = Array.isArray(snapshot) && snapshot.length > 0 ? snapshot.length : null

    // main質問「回答数」は server-authoritative progress（interviews.interview_progress.completedCount）から取得する。
    //   ※ 列は P7.1/R1-A・**Prod 未適用**かつ Realtime reducer 未結線のため現状 null になり得る（best-effort）。
    //     列非存在の select は error になるため、失敗は握って null（＝取得不能）扱いにする。client 値へは fallback しない。
    let serverAnsweredMain: number | null = null
    try {
      const { data: progRow, error: progErr } = await supabase
        .from('interviews')
        .select('interview_progress')
        .eq('id', interviewId)
        .maybeSingle()
      if (!progErr && progRow) {
        const state = restoreProgress((progRow as Record<string, unknown>).interview_progress)
        if (state && state.interviewId === interviewId && Number.isFinite(state.completedCount)) {
          serverAnsweredMain = Math.max(0, Math.min(Math.floor(state.completedCount), serverTotalMain ?? state.completedCount))
        }
      }
    } catch {
      serverAnsweredMain = null // 列未適用/取得失敗 → 取得不能（safe fallback: duration>=480s のみ課金）
    }

    // 課金は server 権威の duration ＋ server 解決の answered/total で判定（server progress 取得不能時は
    // 50%ルールを使わず duration>=480s の applicant_exit のみ課金＝computeIsBillable の null 挙動）。
    const isBillable = computeIsBillable({
      category,
      durationSeconds,
      answeredMainQuestions: serverAnsweredMain,
      totalMainQuestions: serverTotalMain,
    })

    // 対象 interview を確定（status='in_progress' 条件付きUPDATEで競合時の二重確定も防ぐ）
    const { data: updatedRows, error: updError } = await supabase
      .from('interviews')
      .update({
        status: finalStatus,
        ended_at: endedAtIso,
        duration_seconds: durationSeconds,
        // DB へも server-resolved / normalized 値のみ保存（client raw は保存しない・answered>total を作らない）。
        total_questions: serverTotalMain,
        answered_questions: serverAnsweredMain,
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

    // P1-2（Codex）: 面接終了時に realtime-call の並行防止ロックを解放し、正当な次セッションを即許可する。
    // best-effort・別UPDATE（主要な終了UPDATEには含めない）。列 realtime_call_locked_until 未適用でも
    // エラーは無視して面接終了に影響させない（fail-open・段階ロールアウト。未解放でもTTLで自動失効）。
    try {
      await supabase
        .from('interviews')
        .update({ realtime_call_locked_until: null })
        .eq('id', interviewId)
    } catch {
      /* noop: ロック解放失敗は面接終了に影響させない */
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
      // applicants.status をサーバ確定（anon では更新できないためここで確定する）。
      //   ※ 途中離脱は「面接状態」であって企業の選考結果（result='不採用'）ではない。正式仕様として
      //     cancelled/applicant_exit 時に result を自動で '不採用' にしない（企業が部分回答を見て後から判断できる余地を残す）。
      //     applicants.result CHECK = ('未対応','検討中','二次通過','不採用')・DEFAULT '未対応'。既存 result は上書きしない。
      const applicantStatus = finalStatus === 'completed' ? '完了' : '途中離脱'
      const applicantUpdate: Record<string, unknown> = {
        status: applicantStatus,
        updated_at: new Date().toISOString(),
      }
      await supabase.from('applicants').update(applicantUpdate).eq('id', applicantId)
    }

    // 同一 applicant の「この面接より前に開始された」他の in_progress 孤児だけを finalize（cancelled）。
    // ※ ブランケット更新だと、リロード等で並行する /start が挿入した「後から始まった新しい in_progress」まで
    //   巻き込み、ended_at < started_at / duration_seconds=null の不整合行を生む（新セッションを即殺してしまう）。
    //   started_at で「この面接以前」に限定し、後発の新面接は触らない。
    //   孤児は「応募者本人の正規な終了（/end）が届かなかった行」＝本人利用の確証が無い（network/crash/離脱不明）。
    //   正式仕様では確証の無い離脱は非課金のため is_billable=false で確定する（旧 dur>600 は廃止）。
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
        .update({ status: 'cancelled', ended_at: cleanupNowIso, duration_seconds: dur, is_billable: false })
        .eq('id', orphan.id)
        .eq('status', 'in_progress')
    }

    return successJson({ interview_id: interviewId, final_status: finalStatus })
  } catch {
    return apiError('INTERNAL_ERROR')
  }
}
