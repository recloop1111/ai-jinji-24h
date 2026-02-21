'use client'

import { Suspense } from 'react'
import JobManager from '@/components/shared/JobManager'

function JobsContent() {
  return <JobManager companyId="current" theme="light" />
}

export default function JobsPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-64"><div className="text-gray-500">読み込み中...</div></div>}>
      <JobsContent />
    </Suspense>
  )
}
