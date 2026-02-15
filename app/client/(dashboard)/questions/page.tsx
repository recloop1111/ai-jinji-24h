'use client'

import { useState } from 'react'

// TODO: 実データに差替え
type CommonQuestionItem = { id: string; label: string; category: string; question: string }

// TODO: 実データに差替え
const COMMON_QUESTIONS: CommonQuestionItem[] = [
  { id: 'ice-1', label: '冒頭1', category: 'アイスブレイク', question: '本日はお時間をいただきありがとうございます。これから約30〜40分の面接を行います。途中で聞き取りにくい点があれば遠慮なくお知らせください。本日の体調は問題ありませんか？' },
  { id: 'ice-2', label: '冒頭2', category: 'アイスブレイク', question: 'ありがとうございます。面接を始める前に、最近あった嬉しかったことや、ちょっとした楽しみにしていることがあれば気軽に教えてください。' },
  { id: 'close-1', label: 'クロージング', category: 'クロージング', question: '面接は以上となります。最後に、何かご質問や伝えておきたいことはありますか？本日はお忙しい中、ありがとうございました。' },
]

// TODO: 実データに差替え
type QuestionItem = { id: number; category: string; question: string; followUp: boolean; followUpMax: number; axes: string[] }

// TODO: 実データに差替え
const QUESTIONS_BY_PATTERN: Record<string, QuestionItem[]> = {
  'fulltime-new-graduate': [
    { id: 1, category: '自己紹介', question: '自己紹介をお願いします。大学での専攻や、学生時代に力を入れてきたことを中心に教えてください。', followUp: true, followUpMax: 1, axes: ['コミュニケーション力', '論理的思考力'] },
    { id: 2, category: '志望動機', question: 'この業界や職種に興味を持ったきっかけと、志望された理由を教えてください。', followUp: true, followUpMax: 2, axes: ['主体性・意欲', '組織適合性'] },
    { id: 3, category: 'ガクチカ', question: '学生時代に最も力を入れたことについて、目標・取り組み・結果を具体的に教えてください。', followUp: true, followUpMax: 2, axes: ['主体性・意欲', '論理的思考力'] },
    { id: 4, category: '困難な経験', question: 'これまでに困難や壁にぶつかった経験と、それをどのように乗り越えたか教えてください。', followUp: true, followUpMax: 1, axes: ['コミュニケーション力', '主体性・意欲'] },
    { id: 5, category: 'チームワーク', question: 'グループやチームで取り組んだ経験について教えてください。その中であなたはどんな役割を担いましたか？', followUp: true, followUpMax: 1, axes: ['組織適合性', 'コミュニケーション力'] },
    { id: 6, category: '自己分析', question: 'ご自身の強みと弱みをそれぞれ教えてください。弱みに対してどのような改善を心がけていますか？', followUp: true, followUpMax: 1, axes: ['コミュニケーション力', '論理的思考力'] },
    { id: 7, category: '研究・学び', question: '大学の授業やゼミ、研究の中で、特に興味を持って取り組んだテーマがあれば教えてください。', followUp: false, followUpMax: 0, axes: ['論理的思考力', '業界適性・経験値'] },
    { id: 8, category: '働く価値観', question: '社会人として働く上で、大切にしたいと考えている価値観や、理想の働き方を教えてください。', followUp: false, followUpMax: 0, axes: ['組織適合性', '主体性・意欲'] },
    { id: 9, category: 'キャリアビジョン', question: '入社後、3年後・5年後にどのように成長していきたいですか？目指す姿を教えてください。', followUp: false, followUpMax: 0, axes: ['主体性・意欲'] },
  ],
  'fulltime-mid-experienced': [
    { id: 1, category: '自己紹介', question: 'まず自己紹介をお願いします。これまでのご経歴と、直近の業務内容を中心に教えてください。', followUp: true, followUpMax: 1, axes: ['コミュニケーション力', '論理的思考力'] },
    { id: 2, category: '転職理由', question: '今回転職を考えられた理由と、この職種に応募された動機を教えてください。', followUp: true, followUpMax: 2, axes: ['主体性・意欲', '組織適合性'] },
    { id: 3, category: '過去の実績', question: 'これまでの業務で最も成果を上げた経験について、課題・アプローチ・結果を具体的に教えてください。', followUp: true, followUpMax: 2, axes: ['論理的思考力', '業界適性・経験値'] },
    { id: 4, category: '困難な経験', question: '仕事で困難に直面した経験と、それをどのように乗り越えたか教えてください。', followUp: true, followUpMax: 1, axes: ['コミュニケーション力', '主体性・意欲'] },
    { id: 5, category: 'マネジメント', question: 'チームやプロジェクトをリードした経験があれば教えてください。何名規模で、どのような役割でしたか？', followUp: true, followUpMax: 1, axes: ['組織適合性', 'コミュニケーション力'] },
    { id: 6, category: '専門スキル', question: '現在お持ちの専門スキルや知識の中で、この職種で最も活かせると考えているものは何ですか？', followUp: true, followUpMax: 1, axes: ['業界適性・経験値', '論理的思考力'] },
    { id: 7, category: '働き方', question: '仕事を進める上で大切にしているスタイルや、こだわりがあれば教えてください。', followUp: false, followUpMax: 0, axes: ['組織適合性'] },
    { id: 8, category: '自己課題', question: 'ご自身の課題や、今後伸ばしていきたいスキルがあれば教えてください。', followUp: false, followUpMax: 0, axes: ['主体性・意欲', '論理的思考力'] },
    { id: 9, category: 'キャリアビジョン', question: '3年後、5年後にどのようなキャリアを描いていますか？この会社で実現したいことを教えてください。', followUp: false, followUpMax: 0, axes: ['主体性・意欲'] },
  ],
  'fulltime-mid-inexperienced': [
    { id: 1, category: '自己紹介', question: 'まず自己紹介をお願いします。これまでの経歴や、現在取り組んでいることを教えてください。', followUp: true, followUpMax: 1, axes: ['コミュニケーション力', '論理的思考力'] },
    { id: 2, category: '志望動機', question: '未経験の分野に挑戦しようと思ったきっかけや理由を教えてください。', followUp: true, followUpMax: 2, axes: ['主体性・意欲', '組織適合性'] },
    { id: 3, category: '前職経験', question: '前職ではどのような業務をされていましたか？そこで得たスキルや経験を教えてください。', followUp: true, followUpMax: 1, axes: ['論理的思考力', '業界適性・経験値'] },
    { id: 4, category: '学習意欲', question: '新しいスキルや知識を身につけるために、これまでどのような取り組みをしてきましたか？', followUp: true, followUpMax: 1, axes: ['主体性・意欲', '論理的思考力'] },
    { id: 5, category: '困難な経験', question: 'これまでの仕事や人生で、困難を乗り越えた経験を教えてください。', followUp: true, followUpMax: 1, axes: ['コミュニケーション力', '主体性・意欲'] },
    { id: 6, category: '転用スキル', question: 'これまでの経験の中で、この仕事に活かせると感じているスキルや経験があれば教えてください。', followUp: true, followUpMax: 1, axes: ['業界適性・経験値', '組織適合性'] },
    { id: 7, category: '適応力', question: '新しい環境に馴染む際に、ご自身が意識していることや心がけていることはありますか？', followUp: false, followUpMax: 0, axes: ['組織適合性', 'コミュニケーション力'] },
    { id: 8, category: '自己分析', question: 'ご自身の強みと、それをこの仕事でどう活かせると考えていますか？', followUp: false, followUpMax: 0, axes: ['コミュニケーション力'] },
    { id: 9, category: 'キャリアビジョン', question: 'この仕事を通じて、将来どのように成長していきたいですか？', followUp: false, followUpMax: 0, axes: ['主体性・意欲'] },
  ],
  'parttime-experienced': [
    { id: 1, category: '自己紹介', question: '簡単に自己紹介をお願いします。これまでのアルバイト経験や、現在の状況を教えてください。', followUp: true, followUpMax: 1, axes: ['コミュニケーション力'] },
    { id: 2, category: '志望動機', question: '今回応募された理由と、これまでの経験で活かせることを教えてください。', followUp: true, followUpMax: 1, axes: ['主体性・意欲', '業界適性・経験値'] },
    { id: 3, category: '過去の経験', question: '以前のアルバイトで、自分なりに工夫して取り組んだことや、成果を出した経験があれば教えてください。', followUp: true, followUpMax: 1, axes: ['論理的思考力', '業界適性・経験値'] },
    { id: 4, category: '対応力', question: '接客や業務中にトラブルやクレームがあった場合、どのように対応しますか？過去の経験があれば教えてください。', followUp: true, followUpMax: 1, axes: ['コミュニケーション力', '論理的思考力'] },
    { id: 5, category: 'チームワーク', question: '職場の仲間と協力して仕事を進める上で、大切にしていることは何ですか？', followUp: false, followUpMax: 0, axes: ['組織適合性', 'コミュニケーション力'] },
    { id: 6, category: '勤務条件', question: '希望する勤務日数や時間帯を教えてください。また、いつから勤務開始可能ですか？', followUp: false, followUpMax: 0, axes: ['組織適合性'] },
    { id: 7, category: 'ストレス対処', question: '忙しい時間帯や大変な場面で、ご自身がどのように気持ちを切り替えているか教えてください。', followUp: false, followUpMax: 0, axes: ['主体性・意欲'] },
    { id: 8, category: '長所', question: 'ご自身の長所や、周囲から評価されていると感じる点を教えてください。', followUp: false, followUpMax: 0, axes: ['コミュニケーション力', '組織適合性'] },
    { id: 9, category: '目標', question: 'このアルバイトを通じて達成したいことや、身につけたいスキルがあれば教えてください。', followUp: false, followUpMax: 0, axes: ['主体性・意欲'] },
  ],
  'parttime-inexperienced': [
    { id: 1, category: '自己紹介', question: '簡単に自己紹介をお願いします。普段どのような生活をされているか教えてください。', followUp: true, followUpMax: 1, axes: ['コミュニケーション力'] },
    { id: 2, category: '志望動機', question: '今回このお仕事に応募しようと思った理由を教えてください。', followUp: true, followUpMax: 1, axes: ['主体性・意欲'] },
    { id: 3, category: '日常の経験', question: '学校生活や日常の中で、自分なりに頑張った経験や、工夫して取り組んだことがあれば教えてください。', followUp: true, followUpMax: 1, axes: ['主体性・意欲', '論理的思考力'] },
    { id: 4, category: 'コミュニケーション', question: '人と接する時に心がけていることや、意識していることはありますか？', followUp: false, followUpMax: 0, axes: ['コミュニケーション力', '組織適合性'] },
    { id: 5, category: '勤務条件', question: '希望する勤務日数や時間帯を教えてください。また、いつから勤務開始可能ですか？', followUp: false, followUpMax: 0, axes: ['組織適合性'] },
    { id: 6, category: '適応力', question: '新しい場所や環境に慣れるために、自分なりに工夫していることはありますか？', followUp: false, followUpMax: 0, axes: ['組織適合性', 'コミュニケーション力'] },
    { id: 7, category: '自己PR', question: 'ご自身の長所や、周りの人からよく言われることを教えてください。', followUp: false, followUpMax: 0, axes: ['コミュニケーション力'] },
    { id: 8, category: '困った場面', question: 'もし仕事中に分からないことがあった場合、どのように行動しますか？', followUp: false, followUpMax: 0, axes: ['コミュニケーション力', '論理的思考力'] },
    { id: 9, category: '意欲', question: 'このお仕事を通じて、どんなことを学びたい、身につけたいと考えていますか？', followUp: false, followUpMax: 0, axes: ['主体性・意欲'] },
  ],
}

const PATTERN_CONFIG = [
  { id: 'fulltime-new-graduate' as const, label: '正社員 × 新卒', count: 9 },
  { id: 'fulltime-mid-experienced' as const, label: '正社員 × 中途 × 経験者', count: 9 },
  { id: 'fulltime-mid-inexperienced' as const, label: '正社員 × 中途 × 未経験', count: 9 },
  { id: 'parttime-experienced' as const, label: 'アルバイト × 経験者', count: 9 },
  { id: 'parttime-inexperienced' as const, label: 'アルバイト × 未経験', count: 9 },
]

function InfoIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="16" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12.01" y2="8" />
    </svg>
  )
}

type RequestModalState = { isOpen: boolean; questionId: string | null; category: string; questionText: string }

export default function QuestionsPage() {
  const [activePattern, setActivePattern] = useState<'fulltime-new-graduate' | 'fulltime-mid-experienced' | 'fulltime-mid-inexperienced' | 'parttime-experienced' | 'parttime-inexperienced'>('fulltime-new-graduate')
  const [requestModal, setRequestModal] = useState<RequestModalState>({ isOpen: false, questionId: null, category: '', questionText: '' })
  const [requestContent, setRequestContent] = useState('')
  const [toast, setToast] = useState<string | null>(null)

  const showToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 2000)
  }

  const openRequestModal = (questionId: string, category: string, questionText: string) => {
    setRequestModal({ isOpen: true, questionId, category, questionText })
    setRequestContent('')
  }

  const closeRequestModal = () => {
    setRequestModal({ isOpen: false, questionId: null, category: '', questionText: '' })
    setRequestContent('')
  }

  const handleSubmitRequest = () => {
    // TODO: Resend APIで運営に通知メール送信
    // TODO: Supabaseにリクエストレコード保存
    showToast('リクエストを送信しました。運営チームが確認次第、反映いたします。')
    closeRequestModal()
  }

  return (
    <div className="min-w-0 max-w-[100vw] pb-10">
      <h1 className="text-2xl font-bold text-slate-900">面接質問設定</h1>
      <p className="text-sm text-gray-500 mt-1">現在設定されている面接質問の一覧です。変更をご希望の場合は「変更リクエスト」からご連絡ください。</p>

      <div className="mt-8 space-y-10">
        {/* セクション1: 共通質問 */}
        <section>
          <h2 className="text-lg font-semibold text-slate-900">共通質問</h2>
          <p className="text-xs text-gray-400 mt-0.5">すべてのパターンで共通して使用される質問です</p>
          <div className="mt-4 space-y-3">
            {COMMON_QUESTIONS.map((cq) => (
              <div key={cq.id} className="bg-white border border-gray-200 rounded-xl p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-2">
                      <span className="text-sm font-semibold text-gray-600">{cq.label}</span>
                      <span className="text-xs bg-gray-100 text-gray-500 rounded px-2 py-0.5">評価対象外</span>
                    </div>
                    <p className="text-sm text-gray-700 leading-relaxed">{cq.question}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => openRequestModal(cq.id, cq.category, cq.question)}
                    className="shrink-0 text-xs text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 rounded-lg px-3 py-1.5 transition-all cursor-pointer"
                  >
                    変更リクエスト
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* セクション2: パターン別質問 */}
        <section>
          <h2 className="text-lg font-semibold text-slate-900">パターン別質問</h2>
          <p className="text-sm text-gray-500 mt-0.5 mb-4">応募者が入力フォームで選択した「雇用形態」「新卒/中途」「業界経験」に応じて、以下のいずれかのパターンが自動的に使用されます。</p>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-2 mb-6">
            {PATTERN_CONFIG.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setActivePattern(p.id)}
                className={`rounded-xl p-4 text-left transition-all border ${
                  activePattern === p.id
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-200 bg-white hover:bg-gray-50'
                }`}
              >
                <p className={`text-sm font-medium ${activePattern === p.id ? 'text-blue-700' : 'text-gray-700'}`}>{p.label}</p>
                <p className="text-xs text-gray-500 mt-1">{p.count}問</p>
              </button>
            ))}
          </div>
          <div className="space-y-3">
            {(QUESTIONS_BY_PATTERN[activePattern] ?? []).map((q, i) => (
              <div key={`${activePattern}-${q.id}`} className="bg-white border border-gray-200 rounded-xl p-5 mb-3">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <span className="text-sm font-semibold text-gray-400">Q{i + 1}</span>
                  <span className="text-sm font-medium text-gray-600">{q.category}</span>
                  <span className="text-xs text-gray-400">
                    {q.followUp ? `深掘り: あり（最大${q.followUpMax}回）` : '深掘り: なし'}
                  </span>
                </div>
                <p className="text-sm text-gray-800 leading-relaxed mt-2">{q.question}</p>
                <div className="flex items-center justify-between gap-3 mt-4">
                  <p className="text-xs text-gray-400">{q.axes.join('、')}</p>
                  <button
                    type="button"
                    onClick={() => openRequestModal(`${activePattern}-${q.id}`, q.category, q.question)}
                    className="shrink-0 text-xs text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 rounded-lg px-3 py-1.5 transition-all cursor-pointer"
                  >
                    変更リクエスト
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* 下部の案内カード */}
        <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 mt-8 flex gap-3">
          <InfoIcon className="text-blue-400 w-5 h-5 shrink-0 mt-0.5" />
          <p className="text-sm text-blue-700 leading-relaxed">質問の変更リクエストは、運営チームが内容を確認し、評価精度を保った上で反映いたします。通常1〜2営業日以内に対応いたします。お急ぎの場合はお問い合わせください。</p>
        </div>
      </div>

      {/* 変更リクエストモーダル */}
      {requestModal.isOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={(e) => e.target === e.currentTarget && closeRequestModal()}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-lg shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-slate-900">変更リクエスト</h3>
            <div className="mt-4 bg-gray-50 rounded-xl p-4">
              <p className="text-xs font-medium text-gray-500 mb-1">{requestModal.category}</p>
              <p className="text-sm text-gray-700 leading-relaxed">{requestModal.questionText}</p>
            </div>
            <div className="mt-4">
              <textarea
                rows={4}
                value={requestContent}
                onChange={(e) => setRequestContent(e.target.value)}
                placeholder="例：「チームワークの経験」を「弊社のチーム開発を想定した協調性の経験」に変えたいです"
                className="bg-gray-50 border border-gray-200 rounded-xl p-3 text-sm w-full resize-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20 outline-none"
              />
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <button type="button" onClick={closeRequestModal} className="bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-xl px-5 py-2.5 text-sm transition-colors">キャンセル</button>
              <button type="button" onClick={handleSubmitRequest} className="bg-blue-600 hover:bg-blue-700 text-white rounded-xl px-5 py-2.5 text-sm transition-colors">送信</button>
            </div>
          </div>
        </div>
      )}

      {/* トースト */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 bg-white border border-gray-200 rounded-xl shadow-lg px-5 py-3 text-sm text-gray-700">
          {toast}
        </div>
      )}
    </div>
  )
}
