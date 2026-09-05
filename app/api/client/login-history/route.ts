import { type NextRequest } from 'next/server'
import { getClientUser } from '@/lib/api/auth'
import { successJson, apiError } from '@/lib/api/response'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { can } from '@/lib/rbac/permissions'

// 企業のログイン履歴（client・audit.read=OWNER/ADMIN のみ）。E-5-5:
//   既存 login_attempts（service-role のみ・成功/失敗・auth_user_id/email/ip/portal/created_at）を再利用。
//   自社メンバー（company_members.user_id）に紐づく client portal の試行のみを返す（他社・不明メールは対象外）。
//   member 情報（full_name/role/email）は company_members + profiles を batch 解決（N+1 回避）。
export const runtime = 'nodejs'

const PAGE_SIZE = 20

export async function GET(request: NextRequest) {
  try {
    const { data: user, error: authError } = await getClientUser()
    if (authError) return authError
    if (!can(user.companyRole, 'audit.read')) return apiError('FORBIDDEN')

    const url = new URL(request.url)
    const pageRaw = Number(url.searchParams.get('page') ?? '1')
    const page = Number.isFinite(pageRaw) && pageRaw >= 1 ? Math.floor(pageRaw) : 1
    const offset = (page - 1) * PAGE_SIZE

    const svc = createServiceRoleClient()

    // 自社メンバー（全 status＝過去に在籍した者の履歴も表示）。user_id → {full_name, role}。
    const { data: members, error: memErr } = await svc
      .from('company_members')
      .select('user_id, full_name, company_role')
      .eq('company_id', user.companyId)
    if (memErr) return apiError('INTERNAL_ERROR', 'ログイン履歴の取得に失敗しました')

    const memberRows = (members ?? []) as Array<{ user_id: string; full_name: string | null; company_role: string | null }>
    const memberUids = memberRows.map((m) => m.user_id).filter(Boolean)
    if (memberUids.length === 0) {
      return successJson({ items: [], page, page_size: PAGE_SIZE, has_more: false })
    }

    const infoByUid = new Map<string, { full_name: string | null; role: string | null; email: string | null }>()
    for (const m of memberRows) infoByUid.set(m.user_id, { full_name: m.full_name, role: m.company_role, email: null })

    // email は profiles から batch 解決（auth.users は読まない）。
    const { data: profs } = await svc.from('profiles').select('id, email').in('id', memberUids)
    for (const p of (profs ?? []) as Array<{ id: string; email: string | null }>) {
      const info = infoByUid.get(p.id)
      if (info) info.email = p.email ?? null
    }

    // login_attempts（client portal・自社メンバーのみ）。pageSize+1 で has_more を判定。
    const { data: attempts, error: attErr } = await svc
      .from('login_attempts')
      .select('id, auth_user_id, ip_address, success, failure_reason, created_at')
      .eq('user_type', 'client')
      .in('auth_user_id', memberUids)
      .order('created_at', { ascending: false })
      .range(offset, offset + PAGE_SIZE) // +1 行で has_more 判定
    if (attErr) return apiError('INTERNAL_ERROR', 'ログイン履歴の取得に失敗しました')

    const rows = (attempts ?? []) as Array<{
      id: string; auth_user_id: string | null; ip_address: string | null
      success: boolean | null; failure_reason: string | null; created_at: string | null
    }>
    const hasMore = rows.length > PAGE_SIZE
    const pageRows = hasMore ? rows.slice(0, PAGE_SIZE) : rows

    const items = pageRows.map((r) => {
      const info = r.auth_user_id ? infoByUid.get(r.auth_user_id) : undefined
      return {
        id: r.id,
        user_id: r.auth_user_id,
        full_name: info?.full_name ?? null,
        role: info?.role ?? null,
        email: info?.email ?? null,
        ip_address: r.ip_address ?? null,
        success: r.success === true,
        failure_reason: r.failure_reason ?? null,
        created_at: r.created_at,
      }
    })

    return successJson({ items, page, page_size: PAGE_SIZE, has_more: hasMore })
  } catch {
    return apiError('INTERNAL_ERROR')
  }
}
