export const CULTURE_FIT_QUESTIONS = [
  {
    id: 'culture-1',
    label: '社風分析用質問 1',
    traits: '外向性・協調性を測定',
    question: 'チームで困難な課題に直面した際、あなたはどのような役割を担い、どのように解決に貢献しましたか？具体的なエピソードを交えてお聞かせください。',
  },
  {
    id: 'culture-2',
    label: '社風分析用質問 2',
    traits: '誠実性・開放性を測定',
    question: 'これまでの経験の中で、自ら主体的に新しい取り組みを始めたことはありますか？そのきっかけと、どのように進めたかを教えてください。',
  },
  {
    id: 'culture-3',
    label: '社風分析用質問 3',
    traits: '協調性・情緒安定性を測定',
    question: '周囲と意見が対立した経験について教えてください。その状況をどのように受け止め、どのように対処しましたか？',
  },
]

/**
 * 社風分析質問をカスタム質問の間にバランスよく分散配置する
 * 前半〜中盤に社風分析質問を配置し、最後はカスタム質問で締める自然な流れにする
 * 
 * @param customQuestions カスタム質問の配列
 * @param cultureQuestions 社風分析質問の配列
 * @returns 分散配置された質問の配列
 * 
 * @example
 * カスタム7問 + 社風3問 = 10問の場合:
 * カスタム1, カスタム2, 社風1, カスタム3, カスタム4, 社風2, カスタム5, 社風3, カスタム6, カスタム7
 */
export function distributeQuestionsSimple(
  customQuestions: string[],
  cultureQuestions: string[]
): string[] {
  if (cultureQuestions.length === 0) return customQuestions
  if (customQuestions.length === 0) return cultureQuestions

  const result: string[] = []
  const customCount = customQuestions.length
  const cultureCount = cultureQuestions.length
  const totalSlots = customCount + cultureCount

  // 社風分析質問を挿入する位置を計算
  // 全体の中で均等に分散させるが、最初と最後は避ける
  // 例: カスタム7問 + 社風3問 = 10問の場合
  // 社風質問を3番目、6番目、8番目あたりに配置（0-indexed: 2, 5, 7）
  const positions: number[] = []
  for (let i = 0; i < cultureCount; i++) {
    // 最初の1問目は避け、2問目以降から配置開始
    // 均等配置: (i+1) * (totalSlots / (cultureCount+1)) の位置に挿入
    const pos = Math.round((i + 1) * totalSlots / (cultureCount + 1))
    positions.push(pos)
  }

  let customIdx = 0
  let cultureIdx = 0

  for (let i = 0; i < totalSlots; i++) {
    if (positions.includes(i) && cultureIdx < cultureCount) {
      result.push(cultureQuestions[cultureIdx])
      cultureIdx++
    } else if (customIdx < customCount) {
      result.push(customQuestions[customIdx])
      customIdx++
    } else if (cultureIdx < cultureCount) {
      result.push(cultureQuestions[cultureIdx])
      cultureIdx++
    }
  }

  return result
}
