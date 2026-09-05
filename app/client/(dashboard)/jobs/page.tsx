'use client'

import { Suspense } from 'react'
import JobManager from '@/components/shared/JobManager'
import { useCompanyPermissions } from '@/lib/rbac/useCompanyPermissions'

function JobsContent() {
  // 企業RBAC（E-5-2）: VIEWER は求人 CRUD 不可。閲覧は可能。
  const { can } = useCompanyPermissions()
  return <JobManager companyId="current" theme="light" canWrite={can('job.manage')} />
}

export default function JobsPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-64"><div className="text-gray-500">読み込み中...</div></div>}>
      <JobsContent />
    </Suspense>
  )
}
