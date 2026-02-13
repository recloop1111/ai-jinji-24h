'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'

type Applicant = {
  id: string
  last_name: string
  first_name: string
  job_type_name: string | null
  selection_status: string
  created_at: string
  duplicate_flag: boolean
  inappropriate_flag: boolean
}

const statusBadge = (status: string) => {
  switch (status) {
    case 'pending': return <span className="inline-block px-2 py-0.5 text-xs font-medium rounded bg-yellow-100 text-yellow-800">未対応</span>
    case 'second_interview': return <span className="inline-block px-2 py-0.5 text-xs font-medium rounded bg-green-100 text-green-800">二次面接へ</span>
    case 'rejected': return <span className="inline-block px-2 py-0.5 text-xs font-medium rounded bg-gray-100 text-gray-600">不採用</span>
    default: return null
  }
}

const statusLabel = (status: string) => {
  switch (status) {
    case 'pending': return '未対応'
    case 'second_interview': return '二次面接へ'
    case 'rejected': return '不採用'
    default: return status
  }
}

export default function ApplicantsPage() {
  const [applicants, setApplicants] = useState<Applicant[]>([])
  const [loading, setLoading] = useState(true)
  const [totalCount, setTotalCount] = useState(0)
  const [currentPage, setCurrentPage] = useState(1)
  const [filterStatus, setFilterStatus] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [exporting, setExporting] = useState(false)
  const perPage = 20
  const supabase = createClient()

  useEffect(() => {
    fetchApplicants()
  }, [currentPage, filterStatus, searchQuery])

  const fetchApplicants = async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data: company } = await supabase
      .from('companies')
      .select('id')
      .eq('auth_user_id', user.id)
      .single()
    if (!company) return

    let query = supabase
      .from('applicants')
      .select('id, last_name, first_name, selection_status, duplicate_flag, inappropriate_flag, created_at, job_type_id', { count: 'exact' })
      .eq('company_id', company.id)
      .order('created_at', { ascending: false })
      .range((currentPage - 1) * perPage, currentPage * perPage - 1)

    if (filterStatus !== 'all') {
      query = query.eq('selection_status', filterStatus)
    }

    if (searchQuery) {
      query = query.or(`last_name.ilike.%${searchQuery}%,first_name.ilike.%${searchQuery}%`)
    }

    const { data, count } = await query

    if (data) {
      const jobTypeIds = [...new Set(data.map((a: any) => a.job_type_id).filter(Boolean))]
      let jobTypeMap: Record<string, string> = {}

      if (jobTypeIds.length > 0) {
        const { data: jobTypes } = await supabase
          .from('job_types')
          .select('id, name')
          .in('id', jobTypeIds)
        if (jobTypes) {
          jobTypeMap = Object.fromEntries(jobTypes.map((jt: any) => [jt.id, jt.name]))
        }
      }

      const mapped: Applicant[] = data.map((a: any) => ({
        id: a.id,
        last_name: a.last_name,
        first_name: a.first_name,
        job_type_name: jobTypeMap[a.job_type_id] || null,
        selection_status: a.selection_status,
        created_at: a.created_at,
        duplicate_flag: a.duplicate_flag,
        inappropriate_flag: a.inappropriate_flag,
      }))

      setApplicants(mapped)
      setTotalCount(count || 0)
    }
    setLoading(false)
  }

  const handleCsvExport = async () => {
    setExporting(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setExporting(false); return }

      const { data: company } = await supabase
        .from('companies')
        .select('id')
        .eq('auth_user_id', user.id)
        .single()
      if (!company) { setExporting(false); return }

      let query = supabase
        .from('applicants')
        .select('id, last_name, first_name, email, phone_number, selection_status, duplicate_flag, inappropriate_flag, created_at, job_type_id')
        .eq('company_id', company.id)
        .order('created_at', { ascending: false })

      if (filterStatus !== 'all') {
        query = query.eq('selection_status', filterStatus)
      }

      if (searchQuery) {
        query = query.or(`last_name.ilike.%${searchQuery}%,first_name.ilike.%${searchQuery}%`)
      }

      const { data } = await query

      if (!data || data.length === 0) {
        alert('エクスポート対象の応募者がいません。')
        setExporting(false)
        return
      }

      const jobTypeIds = [...new Set(data.map((a: any) => a.job_type_id).filter(Boolean))]
      let jobTypeMap: Record<string, string> = {}

      if (jobTypeIds.length > 0) {
        const { data: jobTypes } = await supabase
          .from('job_types')
          .select('id, name')
          .in('id', jobTypeIds)
        if (jobTypes) {
          jobTypeMap = Object.fromEntries(jobTypes.map((jt: any) => [jt.id, jt.name]))
        }
      }

      var header = '登録日,姓,名,メールアドレス,電話番号,希望職種,ステータス,重複フラグ,不適切フラグ'
      var rows = data.map((a: any) => {
        var date = a.created_at ? new Date(a.created_at).toLocaleString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : ''
        var jobName = jobTypeMap[a.job_type_id] || ''
        var escapeCsv = (val: string) => {
          if (val.includes(',') || val.includes('"') || val.includes('\n')) {
            return '"' + val.replace(/"/g, '""') + '"'
          }
          return val
        }
        return [
          escapeCsv(date),
          escapeCsv(a.last_name || ''),
          escapeCsv(a.first_name || ''),
          escapeCsv(a.email || ''),
          escapeCsv(a.phone_number || ''),
          escapeCsv(jobName),
          escapeCsv(statusLabel(a.selection_status)),
          a.duplicate_flag ? 'はい' : 'いいえ',
          a.inappropriate_flag ? 'はい' : 'いいえ',
        ].join(',')
      })

      var csvContent = '\uFEFF' + header + '\n' + rows.join('\n')
      var blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
      var url = URL.createObjectURL(blob)
      var link = document.createElement('a')
      var now = new Date()
      var fileName = '応募者一覧_' + now.getFullYear() + (now.getMonth() + 1).toString().padStart(2, '0') + now.getDate().toString().padStart(2, '0') + '.csv'
      link.href = url
      link.download = fileName
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
    } catch (e) {
      alert('CSVエクスポートに失敗しました。')
    }
    setExporting(false)
  }

  const totalPages = Math.ceil(totalCount / perPage)

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '—'
    return new Date(dateStr).toLocaleString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-gray-900">応募者一覧</h1>
        <button
          onClick={handleCsvExport}
          disabled={exporting}
          className={'px-3 py-1.5 border border-gray-300 text-sm text-gray-700 rounded-md hover:bg-gray-50' + (exporting ? ' opacity-50 cursor-not-allowed' : '')}
        >
          {exporting ? 'ダウンロード中...' : 'CSVエクスポート'}
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <select value={filterStatus} onChange={e => { setFilterStatus(e.target.value); setCurrentPage(1) }} className="text-sm border border-gray-300 rounded-md px-3 py-1.5">
          <option value="all">ステータス: すべて</option>
          <option value="pending">未対応</option>
          <option value="second_interview">二次面接へ</option>
          <option value="rejected">不採用</option>
        </select>
        <input
          type="text"
          placeholder="氏名で検索"
          value={searchQuery}
          onChange={e => { setSearchQuery(e.target.value); setCurrentPage(1) }}
          className="text-sm border border-gray-300 rounded-md px-3 py-1.5 w-64"
        />
      </div>

      {loading ? (
        <div className="bg-white rounded-lg shadow p-8 text-center text-gray-500">読み込み中...</div>
      ) : applicants.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-8 text-center">
          <p className="text-gray-500 mb-2">まだ応募者がいません。</p>
          <p className="text-sm text-gray-400">面接URLを応募者に共有して始めましょう。</p>
        </div>
      ) : (
        <>
          <div className="bg-white rounded-lg shadow overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-gray-50 text-left text-gray-600">
                  <th className="px-4 py-3">登録日</th>
                  <th className="px-4 py-3">氏名</th>
                  <th className="px-4 py-3">希望職種</th>
                  <th className="px-4 py-3">ステータス</th>
                </tr>
              </thead>
              <tbody>
                {applicants.map((a) => (
                  <tr key={a.id} className="border-b hover:bg-gray-50 cursor-pointer">
                    <td className="px-4 py-3 text-gray-600">{formatDate(a.created_at)}</td>
                    <td className="px-4 py-3">
                      <Link href={`/client/applicants/${a.id}`} className="text-blue-600 hover:text-blue-500 font-medium">
                        {a.last_name}{a.first_name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{a.job_type_name || '—'}</td>
                    <td className="px-4 py-3">{statusBadge(a.selection_status)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <p className="text-sm text-gray-500">全{totalCount}件中 {(currentPage - 1) * perPage + 1}〜{Math.min(currentPage * perPage, totalCount)}件を表示</p>
              <div className="flex items-center gap-2">
                <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="px-3 py-1 text-sm border rounded-md disabled:opacity-50 hover:bg-gray-50">前へ</button>
                <span className="text-sm text-gray-600">{currentPage} / {totalPages}</span>
                <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className="px-3 py-1 text-sm border rounded-md disabled:opacity-50 hover:bg-gray-50">次へ</button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
