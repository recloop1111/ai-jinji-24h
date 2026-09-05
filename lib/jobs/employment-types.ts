// 求人の雇用形態（DB 値）。jobs.employment_type の許可集合。server route の validation で共有。
export const EMPLOYMENT_TYPES_DB = ['fulltime', 'contract', 'temporary', 'parttime', 'freelance', 'intern', 'other'] as const
export type EmploymentTypeDb = (typeof EMPLOYMENT_TYPES_DB)[number]

export function isEmploymentTypeDb(v: unknown): v is EmploymentTypeDb {
  return typeof v === 'string' && (EMPLOYMENT_TYPES_DB as readonly string[]).includes(v)
}
