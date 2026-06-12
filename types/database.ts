// types/database.ts
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

// ============================================
// AI人事24h 共通型定義（Supabase テーブル対応）
// ============================================
// 【注意】本ファイルは参照用であり、実DBスキーマと一部ドリフトがある。
// - 正は Supabase の実スキーマ（snake_case）。本ファイルの型はコードから型として import されておらず（実際の利用は PRICE_PER_INTERVIEW / MIN_INTERVIEW_LIMIT 定数のみ）、API/画面は inline 型注釈で実DB列を直接扱う。
// - 一部の型は実DBに該当テーブルが無い、または列名・列構成がズレている（各型のコメント参照）。
// - 新規実装でテーブルを扱う際は、本ファイルではなく実DBの列・CHECK制約を確認すること。

export type Company = {
  id: string
  name: string
  email: string
  industry: string
  plan: 'pay_per_use' | 'custom'
  /** 1面接あたりの単価（税抜）。通常=4000 / 特別契約(custom)=3000 等。会社ごとに保持 */
  pricePerInterview: number
  maxInterviews: number
  monthlyInterviewLimit: number
  /** 翌月から適用する上限予約（null=予約なし） */
  nextMonthInterviewLimit: number | null
  /** 翌月上限の適用開始月（その月の1日。例 2026-07-01）。null=予約なし */
  nextMonthLimitEffectiveMonth: string | null
  /** 企業設定変更用パスワードの hash（ログインPWとは別。平文保存禁止） */
  companySettingPasswordHash: string | null
  autoUpgrade: boolean
  isActive: boolean
  isPaused: boolean
  isDemo: boolean
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
  /** 面接体験の満足度評価（1〜5・任意）。実DB列 applicants.satisfaction_rating。null=未回答 */
  satisfactionRating: number | null
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
  questionsSnapshot: { sort_order: number; question_text: string }[] | null
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

// 【ドリフト】`invoices` テーブルは実DBに存在しない。実在は `billing_records`（列: billing_month / amount_jpy / tax_jpy / total_jpy / payment_status 等）。billing 参照コードの是正は別タスク。
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

// 実DB suspension_requests に整合（CHECK: request_type=temporary|emergency / status=pending|approved|rejected|cancelled）
export type SuspensionRequest = {
  id: string
  companyId: string
  requestType: 'temporary' | 'emergency'
  status: 'pending' | 'approved' | 'rejected' | 'cancelled'
  reason: string | null
  /** 実DBに存在する監査/予定列（現コードは未使用。承認/却下の監査記録は別タスク） */
  requestedStartDate: string | null
  reviewedBy: string | null
  reviewedAt: string | null
  reviewComment: string | null
  createdAt: string
}

// 【ドリフト】`admin_users` テーブルは実DBに存在しない。admin 判定は `profiles.role`（admin / super_admin）で行う。
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

// 【ドリフト】`audit_logs` テーブルは実DBに存在しない（監査ログ用テーブル未整備）。
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

// 【ドリフト】`question_bank` テーブルは実DBに存在しない。実在は `questions` / `question_patterns`（質問は job_questions / common_questions にも保持）。
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

/** 1面接あたりの単価（税別） */
export const PRICE_PER_INTERVIEW = 4000

/** 月間面接上限の最小値 */
export const MIN_INTERVIEW_LIMIT = 5
