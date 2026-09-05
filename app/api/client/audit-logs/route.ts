import { type NextRequest } from 'next/server'
import { getClientUser } from '@/lib/api/auth'
import { successJson, apiError } from '@/lib/api/response'
import { can } from '@/lib/rbac/permissions'
import { createServiceRoleClient } from '@/lib/supabase/server'

// 企業操作ログの閲覧（client・audit.read=OWNER/ADMIN のみ）。
//   company_id は getClientUser 由来固定（query の company_id は受けない）。server-side pagination。
//   label（actor/applicant/member/invite/company）は batch join で解決（N+1 回避）。秘匿列は取得も返却もしない。
//   ※ この GET 自体は audit しない（閲覧でログを増やさない）。
const DEFAULT_LIMIT = 25
const MAX_LIMIT = 50

function parsePositiveInt(raw: string | null, fallback: number): number {
  const n = Number(raw)
  if (!Number.isInteger(n) || n < 1) return fallback
  return n
}

export async function GET(request: NextRequest) {
  try {
    const { data: user, error: authError } = await getClientUser()
    if (authError) return authError
    if (!can(user.companyRole, 'audit.read')) return apiError('FORBIDDEN')

    const sp = request.nextUrl.searchParams
    const page = parsePositiveInt(sp.get('page'), 1)
    const limit = Math.min(parsePositiveInt(sp.get('limit'), DEFAULT_LIMIT), MAX_LIMIT)
    const from = (page - 1) * limit
    const to = from + limit - 1

    const svc = createServiceRoleClient()

    // 総件数（company_id 固定）
    const { count, error: countError } = await svc
      .from('company_audit_logs')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', user.companyId)
    if (countError) return apiError('INTERNAL_ERROR', '操作ログの取得に失敗しました')
    const total = count ?? 0

    // 当該ページ（新しい順・stable ordering）
    const { data: rows, error: rowsError } = await svc
      .from('company_audit_logs')
      .select('id, action, resource_type, resource_id, actor_user_id, actor_company_role, metadata, created_at')
      .eq('company_id', user.companyId)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .range(from, to)
    if (rowsError) return apiError('INTERNAL_ERROR', '操作ログの取得に失敗しました')
    const logs = (rows ?? []) as Array<{
      id: string; action: string; resource_type: string; resource_id: string | null
      actor_user_id: string | null; actor_company_role: string | null
      metadata: Record<string, string | number | boolean | null> | null; created_at: string
    }>

    // ---- batch label resolution（tenant 固定・token/hash は select しない）----
    const actorIds = [...new Set(logs.map((l) => l.actor_user_id).filter((v): v is string => !!v))]
    const applicantIds = [...new Set(logs.filter((l) => l.resource_type === 'applicant').map((l) => l.resource_id).filter((v): v is string => !!v))]
    const memberIds = [...new Set(logs.filter((l) => l.resource_type === 'member').map((l) => l.resource_id).filter((v): v is string => !!v))]
    const inviteIds = [...new Set(logs.filter((l) => l.resource_type === 'member_invite').map((l) => l.resource_id).filter((v): v is string => !!v))]
    const billingIds = [...new Set(logs.filter((l) => l.resource_type === 'billing_record').map((l) => l.resource_id).filter((v): v is string => !!v))]

    // actor: company_members.full_name（自社）＋ profiles.email（fallback）
    const memberByUser = new Map<string, { full_name: string | null }>()
    const memberById = new Map<string, { full_name: string | null; user_id: string }>()
    const profileById = new Map<string, { email: string | null }>()

    if (actorIds.length > 0) {
      const { data } = await svc.from('company_members').select('user_id, full_name').eq('company_id', user.companyId).in('user_id', actorIds)
      for (const r of (data ?? []) as Array<{ user_id: string; full_name: string | null }>) memberByUser.set(r.user_id, { full_name: r.full_name })
    }
    if (memberIds.length > 0) {
      const { data } = await svc.from('company_members').select('id, full_name, user_id').eq('company_id', user.companyId).in('id', memberIds)
      for (const r of (data ?? []) as Array<{ id: string; full_name: string | null; user_id: string }>) memberById.set(r.id, { full_name: r.full_name, user_id: r.user_id })
    }
    // profiles email は actor と member target の user_id 集合ぶんだけ取得
    const profileIds = [...new Set([...actorIds, ...[...memberById.values()].map((m) => m.user_id)])]
    if (profileIds.length > 0) {
      const { data } = await svc.from('profiles').select('id, email').in('id', profileIds)
      for (const r of (data ?? []) as Array<{ id: string; email: string | null }>) profileById.set(r.id, { email: r.email })
    }

    const applicantById = new Map<string, { last_name: string | null; first_name: string | null }>()
    if (applicantIds.length > 0) {
      const { data } = await svc.from('applicants').select('id, last_name, first_name').eq('company_id', user.companyId).in('id', applicantIds)
      for (const r of (data ?? []) as Array<{ id: string; last_name: string | null; first_name: string | null }>) applicantById.set(r.id, { last_name: r.last_name, first_name: r.first_name })
    }
    const inviteById = new Map<string, { email: string }>()
    if (inviteIds.length > 0) {
      const { data } = await svc.from('member_invites').select('id, email').eq('company_id', user.companyId).in('id', inviteIds)
      for (const r of (data ?? []) as Array<{ id: string; email: string }>) inviteById.set(r.id, { email: r.email })
    }
    // billing_record は id / billing_month のみ取得（金額/snapshot/宛名等は取得しない・company_id 固定）。
    const billingById = new Map<string, { billing_month: string | null }>()
    if (billingIds.length > 0) {
      const { data } = await svc.from('billing_records').select('id, billing_month').eq('company_id', user.companyId).in('id', billingIds)
      for (const r of (data ?? []) as Array<{ id: string; billing_month: string | null }>) billingById.set(r.id, { billing_month: r.billing_month })
    }

    // company 名（company target 用に1回）
    let companyName: string | null = null
    if (logs.some((l) => l.resource_type === 'company')) {
      const { data } = await svc.from('companies').select('name').eq('id', user.companyId).maybeSingle()
      companyName = (data as { name?: string } | null)?.name ?? null
    }

    function actorLabel(userId: string | null): { display_name: string | null; email: string | null } {
      if (!userId) return { display_name: null, email: null }
      const full = memberByUser.get(userId)?.full_name ?? null
      const email = profileById.get(userId)?.email ?? null
      return { display_name: full, email }
    }
    function targetLabel(l: (typeof logs)[number]): string | null {
      if (l.resource_type === 'applicant') {
        const a = l.resource_id ? applicantById.get(l.resource_id) : undefined
        if (!a) return '削除済みの応募者'
        const name = `${a.last_name ?? ''} ${a.first_name ?? ''}`.trim()
        return name || '応募者'
      }
      if (l.resource_type === 'member') {
        const mm = l.resource_id ? memberById.get(l.resource_id) : undefined
        if (!mm) return '削除済みのメンバー'
        return mm.full_name || profileById.get(mm.user_id)?.email || 'メンバー'
      }
      if (l.resource_type === 'member_invite') {
        const inv = l.resource_id ? inviteById.get(l.resource_id) : undefined
        return inv?.email ?? 'メンバー招待'
      }
      if (l.resource_type === 'company') return companyName ?? '企業設定'
      if (l.resource_type === 'template') return 'テンプレート'
      if (l.resource_type === 'billing_record') {
        const b = l.resource_id ? billingById.get(l.resource_id) : undefined
        if (!b) return '請求書'
        const m = (b.billing_month ?? '').match(/^(\d{4})-(\d{2})/)
        return m ? `${m[1]}年${Number(m[2])}月分の請求書` : '請求書'
      }
      return null
    }

    const out = logs.map((l) => {
      const a = actorLabel(l.actor_user_id)
      return {
        id: l.id,
        action: l.action,
        resource_type: l.resource_type,
        resource_id: l.resource_id,
        created_at: l.created_at,
        actor: { display_name: a.display_name, email: a.email, role: l.actor_company_role },
        target: { label: targetLabel(l) },
        metadata: l.metadata ?? {},
      }
    })

    return successJson({
      logs: out,
      pagination: { page, limit, total, total_pages: Math.max(1, Math.ceil(total / limit)) },
    })
  } catch {
    return apiError('INTERNAL_ERROR')
  }
}
