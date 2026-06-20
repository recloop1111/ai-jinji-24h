import { type NextRequest } from 'next/server'
import { getAdminUser } from '@/lib/api/auth'
import { apiError } from '@/lib/api/response'
import { isValidUUID } from '@/lib/api/validation'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { verifySettingPassword } from '@/lib/security/setting-password'
import { deriveDisplayStatusJa } from '@/lib/applicants/displayStatus'

export const runtime = 'nodejs'

const ADMIN_SECURITY_ROW_ID = 'default'

// 運営のCSV出力（応募者データ一括）。ログインに加えて「運営管理設定変更用パスワード」
// （admin_security_settings.setting_password_hash）のサーバ検証を必須とする。ログインPWでは取得不可。
// パスワード・フィルタは POST ボディで受け取り（URL/ログに残さない）、
// /admin/applicants 画面と同一のデータ源・フィルタ・列で生成する（画面＝出力の一致）。

type CompanyRow = { id: string; name: string }
type ApplicantRow = {
  id: string
  company_id: string
  last_name: string | null
  first_name: string | null
  email: string | null
  phone_number: string | null
  status: string | null
  selection_status: string | null
  created_at: string
}
type ResultRow = { applicant_id: string; total_score: number | null }

const RESULT_LABEL: Record<string, string> = {
  pending: '未対応',
  considering: '検討中',
  second_pass: '二次通過',
  rejected: '不採用',
  hired: '内定',
}

export async function POST(request: NextRequest) {
  try {
    const { error: authError } = await getAdminUser()
    if (authError) return authError

    const body = await request.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return apiError('VALIDATION_ERROR', 'リクエストボディが不正です')
    }

    // --- 運営管理設定変更用パスワードのサーバ検証（scrypt 照合・平文比較しない）---
    const settingPassword = typeof body.settingPassword === 'string' ? body.settingPassword : ''
    const serviceClient = createServiceRoleClient()
    const { data: secRow } = await serviceClient
      .from('admin_security_settings')
      .select('setting_password_hash')
      .eq('id', ADMIN_SECURITY_ROW_ID)
      .maybeSingle()
    const settingHash = secRow?.setting_password_hash ?? null
    if (!settingHash) {
      return apiError('FORBIDDEN', '運営管理設定変更用パスワードが未設定です。セキュリティ設定から登録してください')
    }
    if (!settingPassword || !verifySettingPassword(settingPassword, settingHash)) {
      return apiError('FORBIDDEN', '運営管理設定変更用パスワードが正しくありません')
    }

    // --- フィルタ（/admin/applicants 画面と同一セマンティクス）---
    const search = (typeof body.search === 'string' ? body.search : '').trim().toLowerCase()
    const companyFilter = typeof body.company_id === 'string' ? body.company_id : 'all'
    const statusFilter = typeof body.status === 'string' ? body.status : 'all'      // all/準備中/面接中/完了/途中離脱
    const scoreFilter = typeof body.score === 'string' ? body.score : 'all'         // all/80+/60-79/40-59/40-
    const resultFilter = typeof body.result === 'string' ? body.result : 'all'      // all/pending/considering/second_pass/rejected/hired
    const periodFilter = typeof body.period === 'string' ? body.period : 'all'      // all/this_month/last_month/3months

    if (companyFilter !== 'all' && !isValidUUID(companyFilter)) {
      return apiError('VALIDATION_ERROR', 'company_id の形式が不正です')
    }

    const supabase = createServiceRoleClient()

    // 企業名マップ
    const { data: companiesData } = await supabase.from('companies').select('id, name')
    const companiesMap: Record<string, string> = {}
    ;((companiesData ?? []) as CompanyRow[]).forEach((c) => {
      companiesMap[c.id] = c.name
    })

    // 応募者（全件・created_at 降順）。フィルタは画面と一致させるため取得後に適用。
    const { data: applicantsData, error } = await supabase
      .from('applicants')
      .select('id, company_id, last_name, first_name, email, phone_number, status, selection_status, created_at')
      .order('created_at', { ascending: false })
    if (error) {
      return apiError('INTERNAL_ERROR', '応募者データの取得に失敗しました')
    }

    // 評価結果（スコア）
    const { data: resultsData } = await supabase
      .from('interview_results')
      .select('applicant_id, total_score')
    const scoreMap: Record<string, number | null> = {}
    ;((resultsData ?? []) as ResultRow[]).forEach((r) => {
      scoreMap[r.applicant_id] = r.total_score ?? null
    })

    // 最新 interview.status（ステータス導出用）
    const latestInterviewStatus: Record<string, string> = {}
    const { data: ipData } = await supabase
      .from('interviews')
      .select('applicant_id, status, created_at')
      .order('created_at', { ascending: false })
    ;((ipData ?? []) as { applicant_id: string; status: string | null }[]).forEach((iv) => {
      if (iv.applicant_id && !(iv.applicant_id in latestInterviewStatus)) {
        latestInterviewStatus[iv.applicant_id] = iv.status ?? ''
      }
    })

    const now = new Date()
    const matchPeriod = (createdAt: string): boolean => {
      if (periodFilter === 'all') return true
      if (!createdAt) return false
      const d = new Date(createdAt)
      if (periodFilter === 'this_month') return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()
      if (periodFilter === 'last_month') {
        const lm = new Date(now.getFullYear(), now.getMonth() - 1, 1)
        return d.getFullYear() === lm.getFullYear() && d.getMonth() === lm.getMonth()
      }
      if (periodFilter === '3months') {
        const three = new Date(now.getFullYear(), now.getMonth() - 3, 1)
        return d >= three
      }
      return true
    }
    const matchScore = (score: number | null): boolean => {
      if (scoreFilter === 'all') return true
      if (score === null) return false
      if (scoreFilter === '80+') return score >= 80
      if (scoreFilter === '60-79') return score >= 60 && score < 80
      if (scoreFilter === '40-59') return score >= 40 && score < 60
      if (scoreFilter === '40-') return score < 40
      return true
    }

    type Row = { companyId: string; name: string; company: string; email: string; phone: string; statusJa: string; score: number | null; resultKey: string; createdAt: string }
    const rows: Row[] = ((applicantsData ?? []) as ApplicantRow[])
      .map((a): Row => {
        const name = `${a.last_name || ''} ${a.first_name || ''}`.trim() || '名前不明'
        const statusJa = deriveDisplayStatusJa(a.status || '準備中', latestInterviewStatus[a.id] ?? null)
        return {
          companyId: a.company_id,
          name,
          company: companiesMap[a.company_id] || '不明',
          email: a.email || '',
          phone: a.phone_number || '',
          statusJa,
          score: scoreMap[a.id] ?? null,
          resultKey: a.selection_status || 'pending',
          createdAt: a.created_at,
        }
      })
      .filter((r) => {
        if (search && !(r.name.toLowerCase().includes(search) || r.email.toLowerCase().includes(search))) return false
        if (companyFilter !== 'all' && r.companyId !== companyFilter) return false
        if (statusFilter !== 'all' && r.statusJa !== statusFilter) return false
        if (!matchScore(r.score)) return false
        if (resultFilter !== 'all' && r.resultKey !== resultFilter) return false
        if (!matchPeriod(r.createdAt)) return false
        return true
      })

    // --- CSV 生成（BOM + CRLF + 条件付きクォート）---
    const escapeCsvField = (v: string): string => {
      const s = v ?? ''
      if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
        return '"' + s.replace(/"/g, '""') + '"'
      }
      return s
    }
    const header = '応募者名,企業名,メールアドレス,電話番号,ステータス,スコア,結果,応募日時'
    const lines = rows.map((r) =>
      [
        r.name,
        r.company,
        r.email,
        r.phone,
        r.statusJa,
        r.score === null ? '' : String(r.score),
        RESULT_LABEL[r.resultKey] ?? '未対応',
        r.createdAt ? new Date(r.createdAt).toLocaleString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tokyo' }) : '',
      ].map(escapeCsvField).join(','),
    )
    const csv = '﻿' + [header, ...lines].join('\r\n')

    const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Tokyo' }) // YYYY-MM-DD
    return new Response(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="admin_applicants_${today}.csv"`,
      },
    })
  } catch {
    return apiError('INTERNAL_ERROR')
  }
}
