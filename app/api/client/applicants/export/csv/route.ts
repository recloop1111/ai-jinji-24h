import { type NextRequest } from 'next/server'
import { getClientUser } from '@/lib/api/auth'
import { apiError } from '@/lib/api/response'
import { isValidDate } from '@/lib/api/validation'
import { createClientServerClient, createServiceRoleClient } from '@/lib/supabase/server'
import { verifySettingPassword } from '@/lib/security/setting-password'
import { deriveCurrentStatus, CURRENT_STATUS_LABEL, type CurrentStatusKey } from '@/lib/applicants/displayStatus'

export const runtime = 'nodejs'

// 結果（applicants.result → 表示用キー）→ CSV 表示ラベル（/client/applicants 画面と同一）
function resultToStatusKey(result: string | null | undefined): 'considering' | 'second_pass' | 'rejected' | null {
  if (result === '検討中') return 'considering'
  if (result === '二次通過') return 'second_pass'
  if (result === '不採用') return 'rejected'
  return null
}
function statusLabel(key: 'considering' | 'second_pass' | 'rejected' | null): string {
  return key === 'considering' ? '検討中' : key === 'second_pass' ? '二次通過' : key === 'rejected' ? '不採用' : '未対応'
}

// CSV は機微な個人情報の一括出力のため、ログインセッションに加えて
// 「管理者設定用パスワード」（companies.company_setting_password_hash）の
// サーバ側検証を必須とする。ログインパスワードでは取得できない。
// パスワード・フィルタは POST ボディで受け取り（パスワードを URL/ログに残さない）、
// 出力は /client/applicants 画面と同一の列・算出元・フィルタ・並び順・文字コードで生成する。
export async function POST(request: NextRequest) {
  try {
    const { data: user, error: authError } = await getClientUser()
    if (authError) return authError

    const body = await request.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return apiError('VALIDATION_ERROR', 'リクエストボディが不正です')
    }

    // --- 設定用パスワードのサーバ検証（service-role で hash 取得し scrypt 照合・平文比較しない）---
    const settingPassword = typeof body.settingPassword === 'string' ? body.settingPassword : ''
    const serviceClient = createServiceRoleClient()
    const { data: company } = await serviceClient
      .from('companies')
      .select('company_setting_password_hash')
      .eq('id', user.companyId)
      .single()
    if (!company?.company_setting_password_hash) {
      return apiError('FORBIDDEN', '管理者設定用パスワードが未設定です。設定画面から登録してください')
    }
    if (!settingPassword || !verifySettingPassword(settingPassword, company.company_setting_password_hash)) {
      return apiError('FORBIDDEN', '管理者設定用パスワードが正しくありません')
    }

    // --- フィルタ（/client/applicants 画面と同一セマンティクス）---
    const search = (typeof body.search === 'string' ? body.search : '').trim().toLowerCase()
    const dateFrom = typeof body.date_from === 'string' ? body.date_from : ''
    const dateTo = typeof body.date_to === 'string' ? body.date_to : ''
    // 結果フィルタ: all / pending(=結果未設定) / considering / second_pass / rejected
    const statusFilter = typeof body.status === 'string' ? body.status : 'all'
    // 現在状況フィルタ: all / preparing / in_progress / completed / abandoned
    const currentStatusFilter = typeof body.current_status === 'string' ? body.current_status : 'all'

    if (dateFrom && !isValidDate(dateFrom)) {
      return apiError('VALIDATION_ERROR', 'date_from の形式が不正です（YYYY-MM-DD）')
    }
    if (dateTo && !isValidDate(dateTo)) {
      return apiError('VALIDATION_ERROR', 'date_to の形式が不正です（YYYY-MM-DD）')
    }

    const supabase = await createClientServerClient()

    // Step 1: applicants（自社・created_at 降順）
    const { data: applicants, error: appError } = await supabase
      .from('applicants')
      .select('id, last_name, first_name, email, phone_number, created_at, status, result')
      .eq('company_id', user.companyId)
      .order('created_at', { ascending: false })
    if (appError) {
      return apiError('INTERNAL_ERROR', 'データの取得に失敗しました')
    }

    // Step 2: interview_results（detail_json.recommendation_rank=推薦度）
    const { data: resultsData } = await supabase
      .from('interview_results')
      .select('applicant_id, detail_json')
    const recommendationMap: Record<string, string | null> = {}
    ;(resultsData ?? []).forEach((r: { applicant_id: string; detail_json: unknown }) => {
      const dj = (r.detail_json ?? {}) as { recommendation_rank?: string | null }
      recommendationMap[r.applicant_id] = dj?.recommendation_rank ?? null
    })

    // Step 3: 最新 interview.status（現在状況の導出用・自社・created_at 降順で先頭=最新）
    const { data: interviewsData } = await supabase
      .from('interviews')
      .select('applicant_id, status, created_at')
      .eq('company_id', user.companyId)
      .order('created_at', { ascending: false })
    const latestInterviewStatus: Record<string, string> = {}
    ;(interviewsData ?? []).forEach((iv: { applicant_id: string; status: string | null }) => {
      if (iv.applicant_id && !(iv.applicant_id in latestInterviewStatus)) {
        latestInterviewStatus[iv.applicant_id] = iv.status ?? ''
      }
    })

    // 日付境界は画面（ブラウザ JST ローカル）と一致させるため Asia/Tokyo の日境界で比較
    const fromMs = dateFrom ? new Date(`${dateFrom}T00:00:00+09:00`).getTime() : null
    const toMs = dateTo ? new Date(`${dateTo}T23:59:59+09:00`).getTime() : null

    // Step 4: マッピング＋フィルタ（画面の filtered と同一順序・同一条件）
    type Row = { name: string; email: string; phone: string; interviewAt: string; currentStatus: CurrentStatusKey; statusKey: ReturnType<typeof resultToStatusKey>; rank: string }
    const rows: Row[] = (applicants ?? [])
      .map((a): Row => {
        const name = `${a.last_name || ''} ${a.first_name || ''}`.trim() || '名前未設定'
        const interviewAt = a.created_at
          ? new Date(a.created_at).toLocaleString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tokyo' })
          : ''
        return {
          name,
          email: a.email || '',
          phone: a.phone_number || '',
          interviewAt,
          currentStatus: deriveCurrentStatus(a.status, latestInterviewStatus[a.id] ?? null),
          statusKey: resultToStatusKey(a.result),
          rank: recommendationMap[a.id] ?? '',
          // フィルタ用に created_at を保持
          ...(a.created_at ? { _ms: new Date(a.created_at).getTime() } : {}),
        } as Row & { _ms?: number }
      })
      .filter((r) => {
        const ms = (r as Row & { _ms?: number })._ms ?? 0
        if (search && !r.name.toLowerCase().includes(search)) return false
        if (fromMs !== null && ms < fromMs) return false
        if (toMs !== null && ms > toMs) return false
        if (statusFilter !== 'all') {
          if (statusFilter === 'pending') {
            if (r.statusKey !== null) return false
          } else if (r.statusKey !== statusFilter) {
            return false
          }
        }
        if (currentStatusFilter !== 'all' && r.currentStatus !== currentStatusFilter) return false
        return true
      })

    // --- CSV 生成（画面のブラウザ生成と同一: BOM + CRLF + 条件付きクォート）---
    const escapeCsvField = (v: string): string => {
      const s = v ?? ''
      if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
        return '"' + s.replace(/"/g, '""') + '"'
      }
      return s
    }
    const header = '応募者名,メールアドレス,電話番号,面接日時,現在状況,推薦度,結果'
    const lines = rows.map((r) =>
      [
        r.name,
        r.email,
        r.phone,
        r.interviewAt,
        CURRENT_STATUS_LABEL[r.currentStatus],
        r.rank ?? '',
        statusLabel(r.statusKey),
      ].map(escapeCsvField).join(','),
    )
    const csv = '﻿' + [header, ...lines].join('\r\n')

    const today = new Date()
    const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`

    return new Response(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="applicants_${dateStr}.csv"`,
      },
    })
  } catch {
    return apiError('INTERNAL_ERROR')
  }
}
