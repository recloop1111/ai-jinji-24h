import Link from 'next/link'

export default function QuestionBankPage() {
  return (
    <div className="space-y-6 min-w-0 max-w-[100vw] pb-10">
      <div>
        <h1 className="text-2xl font-bold text-white">質問バンク</h1>
        <p className="text-sm text-gray-400 mt-1">この画面は準備中です</p>
      </div>
      <div className="bg-white/[0.04] backdrop-blur-xl border border-white/[0.06] rounded-2xl p-10 text-center">
        <p className="text-base font-medium text-white">この画面は準備中です</p>
        <p className="text-sm text-gray-400 mt-2">
          質問バンクは
          <Link href="/admin/questions" className="text-blue-400 hover:text-blue-300 mx-1">
            質問バンク
          </Link>
          メニューをご利用ください。
        </p>
      </div>
    </div>
  )
}
