'use client'

import { Suspense } from 'react'
import QuestionEditor from '@/components/shared/QuestionEditor'

function QuestionsContent() {
  return <QuestionEditor companyId="current" theme="light" />
}

export default function QuestionsPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center py-24"><div className="animate-spin h-10 w-10 border-2 border-blue-500 border-t-transparent rounded-full" /></div>}>
      <QuestionsContent />
    </Suspense>
  )
}
