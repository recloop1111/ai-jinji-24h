// Phase I-4: 面接完了サマリーの受け渡し（純ロジック・UI非依存＝単体テスト可能）。
// session が「正常完了時」に実データ（interview_id・所要秒・質問数）を sessionStorage へ保存し、
// complete が読み出す。別面接/stale の誤表示を防ぐため、必ず現在の interview_id と一致確認して使う。
// 新API・DB変更は増やさない（既存の session 保持データのみ）。

export type InterviewSummary = {
  interviewId: string
  durationSeconds: number // 面接の実所要秒（session の elapsedSeconds）
  questionCount: number // 面接の質問数（session の totalQuestions＝設問数。発話/ターン数ではない＝Realtime でも虚偽にならない）
}

// sessionStorage キー（既存キーと衝突しない）。
export function summaryStorageKey(slug: string): string {
  return `interview_${slug}_summary`
}

// 保存する summary を組み立てる（値をクランプ）。
export function buildInterviewSummary(input: {
  interviewId: string
  durationSeconds: number
  questionCount: number
}): InterviewSummary {
  const dur = Number.isFinite(input.durationSeconds) && input.durationSeconds > 0 ? Math.floor(input.durationSeconds) : 0
  const q = Number.isFinite(input.questionCount) && input.questionCount > 0 ? Math.floor(input.questionCount) : 0
  return { interviewId: input.interviewId, durationSeconds: dur, questionCount: q }
}

export function serializeSummary(s: InterviewSummary): string {
  return JSON.stringify(s)
}

// 生文字列を安全にパース。malformed / 欠落 / 型不正は null（crash しない・ダミーを出さない）。
export function parseInterviewSummary(raw: string | null | undefined): InterviewSummary | null {
  if (!raw) return null
  let o: unknown
  try {
    o = JSON.parse(raw)
  } catch {
    return null
  }
  if (!o || typeof o !== 'object') return null
  const rec = o as Record<string, unknown>
  const interviewId = typeof rec.interviewId === 'string' && rec.interviewId ? rec.interviewId : null
  if (!interviewId) return null
  const durationSeconds = typeof rec.durationSeconds === 'number' && Number.isFinite(rec.durationSeconds)
    ? Math.max(0, Math.floor(rec.durationSeconds))
    : null
  const questionCount = typeof rec.questionCount === 'number' && Number.isFinite(rec.questionCount)
    ? Math.max(0, Math.floor(rec.questionCount))
    : null
  if (durationSeconds === null || questionCount === null) return null
  return { interviewId, durationSeconds, questionCount }
}

// 現在の面接（interview_id）と一致する summary だけ使う（別面接/前回の残りを誤表示しない）。
export function summaryMatchesInterview(s: InterviewSummary | null, interviewId: string | null | undefined): boolean {
  return !!s && !!interviewId && s.interviewId === interviewId
}

// 所要秒 → 「分」表示用の値。取得不能/0以下は null（呼び出し側で「—」/非表示にする）。
// 実データが 1分未満でも「0分」表示にならないよう最小 1 に丸める（虚偽ではなく端数繰り上げ）。
export function durationToMinutes(durationSeconds: number): number | null {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) return null
  return Math.max(1, Math.round(durationSeconds / 60))
}

// 質問数の表示値。取得不能/0以下は null（非表示）。推測値は返さない。
export function questionCountDisplay(questionCount: number): number | null {
  if (!Number.isFinite(questionCount) || questionCount <= 0) return null
  return Math.floor(questionCount)
}
