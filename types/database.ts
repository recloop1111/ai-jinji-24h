// types/database.ts
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

// ============================================
// AI人事24h 共通型定義（Supabase テーブル対応）
// ============================================

export type Company = {
  id: string
  name: string
  email: string
  industry: string
  plan: 'light' | 'standard' | 'pro' | 'custom'
  maxInterviews: number
  autoUpgrade: boolean
  isActive: boolean
  isPaused: boolean
  interviewSlug: string
  createdAt: string
  updatedAt: string
}

export type Applicant = {
  id: string
  companyId: string
  name: string
  nameKana: string
  email: string
  phone: string
  dateOfBirth: string
  gender: string
  prefecture: string
  education: string
  employmentType: string
  industryExperience: string
  desiredRole: string
  workHistory: string
  qualifications: string
  currentStatus: 'preparing' | 'in_progress' | 'completed' | 'error'
  status: 'pending' | 'second_interview' | 'rejected' | null
  createdAt: string
  updatedAt: string
}

export type Interview = {
  id: string
  applicantId: string
  companyId: string
  startedAt: string | null
  endedAt: string | null
  durationMinutes: number | null
  questionCount: number
  isBillable: boolean
  recordingUrl: string | null
  recordingExpiresAt: string | null
  status: 'waiting' | 'in_progress' | 'completed' | 'error' | 'cancelled'
  errorReason: string | null
  createdAt: string
}

export type Report = {
  id: string
  interviewId: string
  applicantId: string
  companyId: string
  overallScore: number
  grade: 'A' | 'B' | 'C' | 'D' | 'E'
  summary: string
  strengths: string[]
  weaknesses: string[]
  isPartial: boolean
  generatedAt: string
}

export type AxisScore = {
  id: string
  reportId: string
  axisName: string
  score: number
  maxScore: number
  comment: string
}

export type EvaluationAxis = 'communication' | 'logical_thinking' | 'desire' | 'stress_tolerance' | 'integrity' | 'initiative'

export type QuestionScore = {
  id: string
  reportId: string
  questionId: string
  questionText: string
  answer: string
  score: number
  feedback: string
}

export type EmailTemplate = {
  id: string
  companyId: string
  name: string
  subject: string
  body: string
  createdAt: string
  updatedAt: string
}

export type SentEmail = {
  id: string
  companyId: string
  templateId: string
  applicantId: string
  subject: string
  body: string
  sentAt: string
  status: 'sent' | 'failed'
}

export type Memo = {
  id: string
  applicantId: string
  companyId: string
  content: string
  createdBy: string
  createdAt: string
}

export type Invoice = {
  id: string
  companyId: string
  stripeInvoiceId: string | null
  amount: number
  taxAmount: number
  totalAmount: number
  status: 'draft' | 'billed' | 'paid' | 'overdue' | 'cancelled'
  billingPeriodStart: string
  billingPeriodEnd: string
  dueDate: string
  paidAt: string | null
  createdAt: string
}

export type JobType = {
  id: string
  companyId: string
  name: string
  description: string
  isActive: boolean
  createdAt: string
}

export type SuspensionRequest = {
  id: string
  companyId: string
  type: 'normal' | 'emergency'
  reason: string | null
  status: 'pending' | 'approved' | 'rejected' | 'cancelled'
  requestedAt: string
  scheduledDate: string | null
  processedAt: string | null
  processedBy: string | null
}

export type AdminUser = {
  id: string
  email: string
  name: string
  role: 'super_admin' | 'admin'
  is2faEnabled: boolean
  createdAt: string
  lastLoginAt: string | null
}

export type SecurityAlert = {
  id: string
  type: 'brute_force' | 'suspicious_access' | 'rate_limit' | 'duplicate_phone' | 'device_anomaly'
  severity: 'low' | 'medium' | 'high' | 'critical'
  description: string
  sourceIp: string | null
  relatedEntityId: string | null
  relatedEntityType: string | null
  isResolved: boolean
  resolvedAt: string | null
  resolvedBy: string | null
  createdAt: string
}

export type AuditLog = {
  id: string
  userId: string | null
  userType: 'admin' | 'company' | 'system'
  action: string
  targetType: string | null
  targetId: string | null
  details: Record<string, unknown> | null
  ipAddress: string | null
  createdAt: string
}

export type QuestionBank = {
  id: string
  category: string
  questionText: string
  followUpText: string | null
  evaluationAxis: EvaluationAxis
  difficulty: 'easy' | 'medium' | 'hard'
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export const PLAN_CONFIG = {
  light: { name: 'ライト', price: 40000, maxInterviews: 10, csvDownload: false, dataRetentionDays: 180 },
  standard: { name: 'スタンダード', price: 80000, maxInterviews: 20, csvDownload: true, dataRetentionDays: null },
  pro: { name: 'プロ', price: 120000, maxInterviews: 30, csvDownload: true, dataRetentionDays: null },
} as const

export const SETUP_FEE = 200000

export type PlanKey = keyof typeof PLAN_CONFIG
