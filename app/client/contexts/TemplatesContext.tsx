'use client'

import { createContext, useContext, useState, useCallback } from 'react'

// TODO: 実データに差替え
export type Template = {
  id: string
  name: string
  updatedAt: string
  subject: string
  description: string
  body: string
}

// TODO: 実データに差替え
const DEFAULT_TEMPLATES: Template[] = [
  {
    id: '1',
    name: '二次面接のご案内',
    updatedAt: '2025-02-08',
    subject: '【AI人事24h】二次面接のご案内',
    description: 'AI面接通過者に二次面接の日程を案内するメール',
    body: `この度はAI面接にご参加いただき、誠にありがとうございました。
厳正なる選考の結果、二次面接へお進みいただくこととなりました。

■ 二次面接の詳細
日時：{{面接日時}}
場所：{{企業名}} 本社オフィス
所要時間：約30分

ご不明な点がございましたら、お気軽にお問い合わせください。`,
  },
  {
    id: '2',
    name: '不採用通知メール',
    updatedAt: '2025-02-03',
    subject: '【AI人事24h】選考結果のお知らせ',
    description: '不採用となった応募者に結果を通知するメール',
    body: `この度はAI面接にご参加いただき、誠にありがとうございました。
慎重に選考を進めさせていただきましたが、誠に残念ながら今回はご期待に沿えない結果となりました。

今後のご活躍を心よりお祈り申し上げます。`,
  },
]

type TemplatesContextValue = {
  templates: Template[]
  setTemplates: React.Dispatch<React.SetStateAction<Template[]>>
  addTemplate: (t: Omit<Template, 'id' | 'updatedAt'>) => void
  updateTemplate: (id: string, t: Partial<Template>) => void
  deleteTemplate: (id: string) => void
}

const TemplatesContext = createContext<TemplatesContextValue | null>(null)

export function TemplatesProvider({ children }: { children: React.ReactNode }) {
  const [templates, setTemplates] = useState<Template[]>(DEFAULT_TEMPLATES)

  const addTemplate = useCallback((t: Omit<Template, 'id' | 'updatedAt'>) => {
    setTemplates((prev) => [
      ...prev,
      { ...t, id: String(Date.now()), updatedAt: '2025-02-14' },
    ])
  }, [])

  const updateTemplate = useCallback((id: string, updates: Partial<Template>) => {
    setTemplates((prev) =>
      prev.map((t) => (t.id === id ? { ...t, ...updates, updatedAt: '2025-02-14' } : t))
    )
  }, [])

  const deleteTemplate = useCallback((id: string) => {
    setTemplates((prev) => prev.filter((t) => t.id !== id))
  }, [])

  return (
    <TemplatesContext.Provider
      value={{ templates, setTemplates, addTemplate, updateTemplate, deleteTemplate }}
    >
      {children}
    </TemplatesContext.Provider>
  )
}

export function useTemplates() {
  const ctx = useContext(TemplatesContext)
  if (!ctx) throw new Error('useTemplates must be used within TemplatesProvider')
  return ctx
}
