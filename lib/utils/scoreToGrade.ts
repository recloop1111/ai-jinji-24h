export function scoreToGrade(score: number): string {
  if (score >= 80) return 'A'
  if (score >= 65) return 'B'
  if (score >= 50) return 'C'
  if (score >= 35) return 'D'
  return 'E'
}

export function gradeColor(grade: string): string {
  switch (grade) {
    case 'A': return 'bg-emerald-500 text-white'
    case 'B': return 'bg-sky-500 text-white'
    case 'C': return 'bg-amber-500 text-white'
    case 'D': return 'bg-orange-500 text-white'
    case 'E': return 'bg-rose-500 text-white'
    default: return 'bg-gray-500 text-white'
  }
}
