'use client'

import { useRouter, useParams } from 'next/navigation'

export default function TermsPage() {
  const router = useRouter()
  const params = useParams()
  const slug = params.slug as string

  return (
    <div className="bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 min-h-screen">
      {/* メインカード */}
      <div className="bg-white rounded-2xl shadow-xl mx-4 sm:max-w-2xl sm:mx-auto p-6 sm:p-10 my-6">
        {/* 利用規約セクション */}
        <section>
          <button
            onClick={() => router.push(`/interview/${slug}`)}
            className="inline-flex items-center gap-0.5 text-xs text-gray-400 mb-4 cursor-pointer hover:text-gray-600 transition-colors"
          >
            ← 戻る
          </button>
          <h1 className="text-2xl font-bold text-gray-800 mb-6">利用規約</h1>

          <div>
            <h2 className="text-base font-bold text-gray-800 mt-6 mb-2">第1条（サービスの概要）</h2>
            <p className="text-sm text-gray-600 leading-relaxed">
              本サービス「AI人事24h」（以下「本サービス」）は、人工知能（AI）技術を活用したオンライン面接システムです。応募者様は、インターネットに接続された端末を通じて、AIによる面接を受けることができます。本サービスを利用することにより、応募者様は本利用規約に同意したものとみなされます。
            </p>
          </div>

          <div>
            <h2 className="text-base font-bold text-gray-800 mt-6 mb-2">第2条（利用条件）</h2>
            <p className="text-sm text-gray-600 leading-relaxed">
              本サービスの利用にあたっては、カメラおよびマイクが正常に動作する端末と、安定したインターネット接続環境が必要です。面接中は、静かな環境で顔全体が映る状態を維持してください。面接の内容は録画・録音され、採用選考の判断材料として使用されます。
            </p>
          </div>

          <div>
            <h2 className="text-base font-bold text-gray-800 mt-6 mb-2">第3条（面接データの取得）</h2>
            <p className="text-sm text-gray-600 leading-relaxed">
              面接中に取得するデータには、映像データ（カメラを通じた応募者様の顔映像）、音声データ（マイクを通じた応募者様の発話内容）、テキストデータ（音声を変換した文字情報）、回答内容の分析データ（AIによる評価結果）、端末情報（ブラウザの種類、OS、IPアドレス等）が含まれます。
            </p>
          </div>

          <div>
            <h2 className="text-base font-bold text-gray-800 mt-6 mb-2">第4条（データの利用目的）</h2>
            <p className="text-sm text-gray-600 leading-relaxed">
              取得したデータは、採用選考における応募者様の評価および判断、面接内容の記録および保管、本サービスの品質向上およびAIモデルの改善、採用業務に関連する統計分析の目的で利用いたします。
            </p>
          </div>

          <div>
            <h2 className="text-base font-bold text-gray-800 mt-6 mb-2">第5条（第三者への情報提供）</h2>
            <p className="text-sm text-gray-600 leading-relaxed">
              当社は、応募者様の面接データおよび評価結果を、採用活動の一環として、応募先企業の関連会社、グループ企業、または業務提携先の企業（以下「提携先企業」）に提供する場合があります。また、応募者様の適性やスキルが他の求人案件にも適合すると判断した場合、当社が提携する第三者の企業に対して、応募者様の情報（氏名、連絡先、面接データ、評価結果等）を提供し、当該企業からの採用選考のご案内をお届けすることがあります。なお、情報の提供先は、当社が個人情報の取り扱いについて適切な管理体制を有すると認めた企業に限定いたします。応募者様は、本サービスの利用をもって、上記の第三者提供に同意したものとみなされます。第三者提供を希望されない場合は、面接開始前にその旨をお申し出ください。
            </p>
          </div>

          <div>
            <h2 className="text-base font-bold text-gray-800 mt-6 mb-2">第6条（禁止事項）</h2>
            <p className="text-sm text-gray-600 leading-relaxed">
              応募者様は、本サービスの利用にあたり、第三者になりすまして面接を受ける行為、面接内容を録画・録音・撮影し外部に公開する行為、不正なプログラムやツールを使用して回答する行為、本サービスの運営を妨害する行為を行ってはなりません。
            </p>
          </div>

          <div>
            <h2 className="text-base font-bold text-gray-800 mt-6 mb-2">第7条（免責事項）</h2>
            <p className="text-sm text-gray-600 leading-relaxed">
              当社は、通信環境の不具合によるサービスの中断、AIによる評価結果の正確性、面接データの漏洩（当社の故意または重大な過失による場合を除く）、本サービスの利用に起因する間接的損害について、一切の責任を負いません。
            </p>
          </div>

          <div>
            <h2 className="text-base font-bold text-gray-800 mt-6 mb-2">第8条（サービスの変更・終了）</h2>
            <p className="text-sm text-gray-600 leading-relaxed">
              当社は、応募者様への事前通知なく、本サービスの内容を変更、または提供を終了することがあります。
            </p>
          </div>

          <div>
            <h2 className="text-base font-bold text-gray-800 mt-6 mb-2">第9条（準拠法・管轄裁判所）</h2>
            <p className="text-sm text-gray-600 leading-relaxed">
              本規約の解釈および適用は日本法に準拠するものとし、本サービスに関する紛争については、東京地方裁判所を第一審の専属的合意管轄裁判所とします。
            </p>
          </div>
        </section>

        {/* 区切り線 */}
        <hr className="my-10 border-gray-200" />

        {/* プライバシーポリシーセクション */}
        <section>
          <h1 className="text-2xl font-bold text-gray-800 mb-6">プライバシーポリシー</h1>

          <div>
            <h2 className="text-base font-bold text-gray-800 mt-6 mb-2">個人情報の収集</h2>
            <p className="text-sm text-gray-600 leading-relaxed">
              当社は、本サービスの提供にあたり、氏名、フリガナ、メールアドレス、電話番号、生年月日、性別、住所、応募職種、面接中の映像・音声データ、AIによる評価結果を収集いたします。
            </p>
          </div>

          <div>
            <h2 className="text-base font-bold text-gray-800 mt-6 mb-2">個人情報の利用</h2>
            <p className="text-sm text-gray-600 leading-relaxed">
              収集した個人情報は、採用選考の実施および結果のご連絡、本サービスの提供および運営、サービスの改善および新機能の開発、お問い合わせへの対応、法令に基づく対応のために利用いたします。
            </p>
          </div>

          <div>
            <h2 className="text-base font-bold text-gray-800 mt-6 mb-2">第三者提供</h2>
            <p className="text-sm text-gray-600 leading-relaxed">
              当社は、応募者様の個人情報を、利用規約第5条に定める場合のほか、法令に基づく場合、人の生命・身体または財産の保護のために必要な場合、公衆衛生の向上または児童の健全な育成の推進のために特に必要がある場合に、第三者に提供することがあります。
            </p>
          </div>

          <div>
            <h2 className="text-base font-bold text-gray-800 mt-6 mb-2">個人情報の安全管理</h2>
            <p className="text-sm text-gray-600 leading-relaxed">
              当社は、個人情報の漏洩、滅失、毀損を防止するために、適切な安全管理措置を講じます。データの暗号化、アクセス制限、従業員への教育等の対策を実施しています。
            </p>
          </div>

          <div>
            <h2 className="text-base font-bold text-gray-800 mt-6 mb-2">個人情報の開示・訂正・削除</h2>
            <p className="text-sm text-gray-600 leading-relaxed">
              応募者様は、当社に対して、ご自身の個人情報の開示、訂正、追加、削除、利用停止を請求することができます。ご請求の際は、本人確認をさせていただいたうえで、合理的な期間内に対応いたします。
            </p>
          </div>

          <div>
            <h2 className="text-base font-bold text-gray-800 mt-6 mb-2">お問い合わせ窓口</h2>
            <p className="text-sm text-gray-600 leading-relaxed">
              個人情報の取り扱いに関するお問い合わせは、下記までご連絡ください。<br />
              メールアドレス：<a href="mailto:privacy@ai-jinji24h.com" className="text-blue-600 underline hover:text-blue-700">privacy@ai-jinji24h.com</a>
            </p>
          </div>
        </section>
      </div>
    </div>
  )
}
