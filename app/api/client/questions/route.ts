import { type NextRequest } from 'next/server'
import { getClientUser } from '@/lib/api/auth'
import { successJson, apiError } from '@/lib/api/response'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { can } from '@/lib/rbac/permissions'
import { isValidUUID } from '@/lib/api/validation'
import { writeCompanyAuditLog } from '@/lib/audit/company-audit'
import { MAX_ICEBREAKER_QUESTIONS, MAX_EVALUATION_QUESTIONS, MAX_CLOSING_QUESTIONS } from '@/lib/config/interview-policy'

// 面接質問の保存（client・question.manage=OWNER/ADMIN/RECRUITER・VIEWER 不可）。E-5-4-B:
//   従来のブラウザ直 delete+insert（common_questions / job_questions）を廃止。
//   置換単位（category）ごとに delete → insert。company_id は session 固定・job は自社スコープ検証。
const Q_MAX_LEN = 500
const LABEL_MAX_LEN = 100

type QItem = { question: string; label?: string }

// body.questions を検証済み配列へ正規化（string 化・trim・空/超過は reject）。
function parseQuestions(v: unknown, max: number): { ok: true; items: QItem[] } | { ok: false; message: string } {
  if (!Array.isArray(v)) return { ok: false, message: '質問リストが不正です' }
  if (v.length > max) return { ok: false, message: `質問は最大${max}問までです` }
  const items: QItem[] = []
  for (const raw of v) {
    if (!raw || typeof raw !== 'object') return { ok: false, message: '質問の形式が不正です' }
    const r = raw as Record<string, unknown>
    const question = typeof r.question === 'string' ? r.question.trim() : ''
    if (!question) return { ok: false, message: '空の質問は保存できません' }
    if (question.length > Q_MAX_LEN) return { ok: false, message: '質問が長すぎます' }
    const label = typeof r.label === 'string' ? r.label.trim().slice(0, LABEL_MAX_LEN) : ''
    items.push({ question, label })
  }
  return { ok: true, items }
}

export async function PUT(request: NextRequest) {
  try {
    const { data: user, error: authError } = await getClientUser()
    if (authError) return authError
    if (!can(user.companyRole, 'question.manage')) return apiError('FORBIDDEN')

    const body = await request.json().catch(() => null)
    if (!body || typeof body !== 'object') return apiError('VALIDATION_ERROR', '入力が不正です')
    const b = body as Record<string, unknown>
    const svc = createServiceRoleClient()

    // クロージング（企業共通・common_questions.category='closing'）の置換。
    if (b.kind === 'closing') {
      const parsed = parseQuestions(b.questions, MAX_CLOSING_QUESTIONS)
      if (!parsed.ok) return apiError('VALIDATION_ERROR', parsed.message)

      const { error: delErr } = await svc
        .from('common_questions')
        .delete()
        .eq('company_id', user.companyId)
        .eq('category', 'closing')
      if (delErr) return apiError('INTERNAL_ERROR', 'クロージング質問の保存に失敗しました')

      if (parsed.items.length > 0) {
        const rows = parsed.items.map((q, i) => ({
          company_id: user.companyId, category: 'closing', label: q.label || null,
          question_text: q.question, is_scorable: false, sort_order: i + 1,
        }))
        const { error: insErr } = await svc.from('common_questions').insert(rows)
        if (insErr) return apiError('INTERNAL_ERROR', 'クロージング質問の保存に失敗しました')
      }

      await writeCompanyAuditLog({
        companyId: user.companyId, actorUserId: user.userId, actorCompanyRole: user.companyRole,
        action: 'question.updated', resourceType: 'company', resourceId: user.companyId,
        metadata: { kind: 'closing', count: parsed.items.length },
      })
      return successJson({ updated: true })
    }

    // 求人×pattern×category（evaluation / icebreaker）の置換。
    if (b.kind === 'job') {
      const jobId = typeof b.jobId === 'string' ? b.jobId : ''
      const patternKey = typeof b.patternKey === 'string' ? b.patternKey.trim() : ''
      const category = b.category
      if (!isValidUUID(jobId)) return apiError('VALIDATION_ERROR', '求人IDが不正です')
      if (!patternKey || patternKey.length > 100) return apiError('VALIDATION_ERROR', 'パターンが不正です')
      if (category !== 'evaluation' && category !== 'icebreaker') return apiError('VALIDATION_ERROR', 'カテゴリが不正です')
      const max = category === 'evaluation' ? MAX_EVALUATION_QUESTIONS : MAX_ICEBREAKER_QUESTIONS
      const parsed = parseQuestions(b.questions, max)
      if (!parsed.ok) return apiError('VALIDATION_ERROR', parsed.message)

      // 自社の求人であることを検証（他社 job への書き込みを防ぐ）。fail-closed。
      const { data: job, error: jobErr } = await svc
        .from('jobs')
        .select('id')
        .eq('id', jobId)
        .eq('company_id', user.companyId)
        .maybeSingle()
      if (jobErr) return apiError('INTERNAL_ERROR', '質問の保存に失敗しました')
      if (!job) return apiError('NOT_FOUND', '求人が見つかりません')

      const { error: delErr } = await svc
        .from('job_questions')
        .delete()
        .eq('job_id', jobId)
        .eq('pattern_key', patternKey)
        .eq('category', category)
      if (delErr) return apiError('INTERNAL_ERROR', '質問の保存に失敗しました')

      if (parsed.items.length > 0) {
        const rows = parsed.items.map((q, i) => ({
          job_id: jobId, pattern_key: patternKey, category, question_text: q.question, sort_order: i + 1,
        }))
        const { error: insErr } = await svc.from('job_questions').insert(rows)
        if (insErr) return apiError('INTERNAL_ERROR', '質問の保存に失敗しました')
      }

      await writeCompanyAuditLog({
        companyId: user.companyId, actorUserId: user.userId, actorCompanyRole: user.companyRole,
        action: 'question.updated', resourceType: 'job', resourceId: jobId,
        metadata: { kind: 'job', category, count: parsed.items.length },
      })
      return successJson({ updated: true })
    }

    return apiError('VALIDATION_ERROR', '不正な操作です')
  } catch {
    return apiError('INTERNAL_ERROR')
  }
}
