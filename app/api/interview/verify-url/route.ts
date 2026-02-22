import { type NextRequest } from 'next/server'
import { successJson, apiError } from '@/lib/api/response'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null)
    if (!body || typeof body.slug !== 'string' || body.slug.trim().length === 0) {
      return apiError('VALIDATION_ERROR', 'slug は必須です')
    }

    const slug = body.slug.trim()

    const supabase = await createClient()

    const { data: company, error } = await supabase
      .from('companies')
      .select('id, name, logo_url, interview_slug, is_suspended, plan, plan_limit')
      .eq('interview_slug', slug)
      .single()

    if (error || !company) {
      return apiError('NOT_FOUND', '無効な面接URLです')
    }

    if (company.is_suspended) {
      return apiError('FORBIDDEN', 'この企業は現在利用停止中です')
    }

    // プラン上限チェック
    let available = true
    if (company.plan_limit) {
      const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()
      const { count } = await supabase
        .from('interviews')
        .select('id', { count: 'exact', head: true })
        .eq('company_id', company.id)
        .eq('billable', true)
        .gte('created_at', monthStart)

      if ((count ?? 0) >= company.plan_limit) {
        available = false
      }
    }

    return successJson({
      company: {
        id: company.id,
        name: company.name,
        logo_url: company.logo_url,
        interview_slug: company.interview_slug,
      },
      available,
    })
  } catch {
    return apiError('INTERNAL_ERROR')
  }
}
