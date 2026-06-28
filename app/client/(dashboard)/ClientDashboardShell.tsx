'use client'

import ClientLayout from '../components/ClientLayout'
import { TemplatesProvider } from '../contexts/TemplatesContext'

// 企業管理画面の UI シェル（Client Component）。サイドバー等の UI/状態は ClientLayout 側にある。
// 認可（企業所属）はサーバ側 layout.tsx（getClientUser→redirect）で確定済みのため、
// ここに到達ガードは持たない（二重リクエスト回避）。
export default function ClientDashboardShell({ children }: { children: React.ReactNode }) {
  return (
    <ClientLayout>
      <TemplatesProvider>{children}</TemplatesProvider>
    </ClientLayout>
  )
}
