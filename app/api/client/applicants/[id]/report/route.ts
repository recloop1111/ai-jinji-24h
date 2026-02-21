import { type NextRequest } from 'next/server'
import { getClientUser } from '@/lib/api/auth'
import { successJson, apiError } from '@/lib/api/response'
import { createClient } from '@/lib/supabase/server'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { data: user, error: authError } = await getClientUser()
    if (authError) return authError

    const { id } = await params
    const supabase = await createClient()

    // 応募者の所有権確認
    const { data: applicant, error: appError } = await supabase
      .from('applicants')
      .select('id')
      .eq('id', id)
      .eq('company_id', user.companyId)
      .single()

    if (appError || !applicant) {
      return apiError('NOT_FOUND', '応募者が見つかりません')
    }

    // 面接ID取得
    const { data: interview, error: intError } = await supabase
      .from('interviews')
      .select('id')
      .eq('applicant_id', id)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (intError || !interview) {
      return apiError('NOT_FOUND', '面接データが見つかりません')
    }

    // レポート取得
    const { data: report, error: reportError } = await supabase
      .from('reports')
      .select('id, status, rank, total_score_100, summary_points, overall_comment, created_at')
      .eq('interview_id', interview.id)
      .single()

    if (reportError || !report) {
      return apiError('NOT_FOUND', 'レポートが見つかりません')
    }

    // 6軸スコア取得
    const { data: axisScores } = await supabase
      .from('report_axis_scores')
      .select('axis, axis_score, axis_rank')
      .eq('report_id', report.id)

    // 質問ごとスコア取得
    const { data: questionScores } = await supabase
      .from('report_scores')
      .select('question_text_snapshot, axis, score, rank, evidence_quote, evaluation_reason, improvement_point')
      .eq('report_id', report.id)

    // Q&Aまとめ取得
    const { data: qaSummaries } = await supabase
      .from('report_qa_summaries')
      .select('sort_order, question_text_snapshot, answer_summary')
      .eq('report_id', report.id)
      .order('sort_order', { ascending: true })

    return successJson({
      report: {
        id: report.id,
        status: report.status,
        rank: report.rank,
        total_score_100: report.total_score_100,
        summary_points: report.summary_points,
        overall_comment: report.overall_comment,
        created_at: report.created_at,
      },
      axis_scores: axisScores ?? [],
      question_scores: questionScores ?? [],
      qa_summaries: qaSummaries ?? [],
    })
  } catch {
    return apiError('INTERNAL_ERROR')
  }
}
