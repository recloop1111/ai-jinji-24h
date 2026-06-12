import Link from 'next/link'

export default function ApplicantDataPage() {
  return (
    <div className="space-y-6 min-w-0 max-w-[100vw] pb-10">
      <div>
        <h1 className="text-2xl font-bold text-white">応募者データ</h1>
        <p className="text-sm text-gray-400 mt-1">応募者データの専用画面は準備中です</p>
      </div>
      <div className="bg-white/[0.04] backdrop-blur-xl border border-white/[0.06] rounded-2xl p-10 text-center">
        <p className="text-base font-medium text-white">この画面は準備中です</p>
        <p className="text-sm text-gray-400 mt-2">
          応募者データは
          <Link href="/admin/applicants" className="text-blue-400 hover:text-blue-300 mx-1">
            応募者管理
          </Link>
          からご確認いただけます。
        </p>
      </div>
    </div>
  )
}
