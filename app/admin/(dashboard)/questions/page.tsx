'use client'

import { useState } from 'react'
import { Plus } from 'lucide-react'

// TODO: 実データに差替え
type QuestionItem = {
  id: string
  category: string
  question: string
  followUp: boolean
  followUpMax: number
  axes: string[]
}

// TODO: 実データに差替え
const COMMON_QUESTIONS = [
  { id: 'ice-1', label: '冒頭1', category: 'アイスブレイク', question: '本日はお時間をいただきありがとうございます。これから約30〜40分の面接を行います。途中で聞き取りにくい点があれば遠慮なくお知らせください。本日の体調は問題ありませんか？' },
  { id: 'ice-2', label: '冒頭2', category: 'アイスブレイク', question: 'ありがとうございます。面接を始める前に、最近あった嬉しかったことや、ちょっとした楽しみにしていることがあれば気軽に教えてください。' },
  { id: 'close-1', label: 'クロージング', category: 'クロージング', question: '面接は以上となります。最後に、何かご質問や伝えておきたいことはありますか？本日はお忙しい中、ありがとうございました。' },
]

// TODO: 実データに差替え
const QUESTION_BANK: Record<string, Record<string, QuestionItem[]>> = {
  'fulltime-new-graduate': {
    A: [
      { id: 'fng-a-1', category: '自己紹介', question: '自己紹介をお願いします。大学での専攻や、学生時代に力を入れてきたことを中心に教えてください。', followUp: true, followUpMax: 1, axes: ['コミュニケーション力', '論理的思考力'] },
      { id: 'fng-a-2', category: '志望動機', question: 'この業界や職種に興味を持ったきっかけと、志望された理由を教えてください。', followUp: true, followUpMax: 1, axes: ['主体性・意欲', '業界適性'] },
      { id: 'fng-a-3', category: 'ガクチカ', question: '学生時代に最も力を入れたことについて、目標・取り組み・結果を具体的に教えてください。', followUp: true, followUpMax: 2, axes: ['主体性・意欲', '論理的思考力'] },
      { id: 'fng-a-4', category: '困難な経験', question: 'これまでに困難や壁にぶつかった経験と、それをどのように乗り越えたか教えてください。', followUp: true, followUpMax: 1, axes: ['ストレス耐性', '主体性・意欲'] },
      { id: 'fng-a-5', category: 'チームワーク', question: 'グループやチームで取り組んだ経験について教えてください。その中であなたはどんな役割を担いましたか？', followUp: true, followUpMax: 1, axes: ['組織適合性', 'コミュニケーション力'] },
      { id: 'fng-a-6', category: '強みと弱み', question: 'ご自身の強みと弱みをそれぞれ教えてください。弱みに対してどのように向き合っていますか？', followUp: false, followUpMax: 0, axes: ['コミュニケーション力', '主体性・意欲'] },
      { id: 'fng-a-7', category: 'ストレス対処', question: 'プレッシャーのかかる状況やストレスを感じた経験があれば、そのときどう対処したか教えてください。', followUp: true, followUpMax: 1, axes: ['ストレス耐性'] },
      { id: 'fng-a-8', category: 'キャリアビジョン', question: '入社後、どのようなキャリアを築いていきたいと考えていますか？3〜5年後の目標があれば教えてください。', followUp: false, followUpMax: 0, axes: ['主体性・意欲', '組織適合性'] },
      { id: 'fng-a-9', category: '会社への貢献', question: 'もし採用された場合、あなたのどのような力を活かして会社に貢献したいと考えていますか？', followUp: true, followUpMax: 1, axes: ['業界適性', '組織適合性'] },
    ],
    B: [
      { id: 'fng-b-1', category: '自己紹介', question: '自己紹介をお願いします。ご自身の性格やどんな人と言われることが多いかも含めて教えてください。', followUp: true, followUpMax: 1, axes: ['コミュニケーション力', '組織適合性'] },
      { id: 'fng-b-2', category: '志望動機', question: 'この仕事に興味を持った理由と、どのような働き方をしたいと考えているか教えてください。', followUp: true, followUpMax: 2, axes: ['主体性・意欲', '業界適性'] },
      { id: 'fng-b-3', category: '人と接する経験', question: 'アルバイトやサークルなどで、多くの人と関わった経験はありますか？その中で心がけていたことを教えてください。', followUp: true, followUpMax: 2, axes: ['コミュニケーション力', '組織適合性'] },
      { id: 'fng-b-4', category: '相手の立場に立った経験', question: '相手の気持ちや立場を考えて行動した経験があれば、具体的に教えてください。', followUp: true, followUpMax: 1, axes: ['コミュニケーション力', '組織適合性'] },
      { id: 'fng-b-5', category: '意見の食い違い', question: '周囲と意見が合わなかったとき、あなたはどのように対処しましたか？具体的なエピソードを教えてください。', followUp: true, followUpMax: 1, axes: ['ストレス耐性', 'コミュニケーション力'] },
      { id: 'fng-b-6', category: '感謝された経験', question: '誰かから感謝されたり、「助かった」と言われた経験はありますか？それはどんな場面でしたか？', followUp: false, followUpMax: 0, axes: ['主体性・意欲', '組織適合性'] },
      { id: 'fng-b-7', category: '失敗からの学び', question: 'うまくいかなかった経験や失敗した経験について、そこから何を学んだか教えてください。', followUp: true, followUpMax: 1, axes: ['ストレス耐性', '主体性・意欲'] },
      { id: 'fng-b-8', category: '理想の職場', question: 'あなたにとって働きやすい職場とはどのような環境ですか？大切にしたい価値観を教えてください。', followUp: false, followUpMax: 0, axes: ['組織適合性', '主体性・意欲'] },
      { id: 'fng-b-9', category: '入社後の目標', question: '入社してから最初の1年間で、どのようなことに挑戦したいと考えていますか？', followUp: false, followUpMax: 0, axes: ['主体性・意欲', '業界適性'] },
    ],
    C: [
      { id: 'fng-c-1', category: '自己紹介', question: '自己紹介をお願いします。学業や研究で取り組んできたテーマ、身につけたスキルを中心に教えてください。', followUp: true, followUpMax: 1, axes: ['論理的思考力', '業界適性'] },
      { id: 'fng-c-2', category: '志望動機', question: 'この業界を志望する理由と、ご自身のスキルや知識がどのように活かせると考えているか教えてください。', followUp: true, followUpMax: 2, axes: ['主体性・意欲', '業界適性'] },
      { id: 'fng-c-3', category: '課題解決経験', question: '学業・研究・課外活動の中で、複雑な課題に取り組んだ経験はありますか？どのように分析し、解決に導いたか教えてください。', followUp: true, followUpMax: 2, axes: ['論理的思考力', '主体性・意欲'] },
      { id: 'fng-c-4', category: 'データ・情報活用', question: 'データや情報を調べて判断を下した経験はありますか？どのような情報をもとに、どのように結論を出したか教えてください。', followUp: true, followUpMax: 1, axes: ['論理的思考力', '業界適性'] },
      { id: 'fng-c-5', category: 'チームでの役割', question: 'チームやプロジェクトで活動した経験の中で、あなたが担った具体的な役割と、そこで発揮した強みを教えてください。', followUp: true, followUpMax: 1, axes: ['組織適合性', 'コミュニケーション力'] },
      { id: 'fng-c-6', category: '自主学習', question: '授業以外で自主的に学んだことや取り組んだことはありますか？そのきっかけと、どのように学びを深めたか教えてください。', followUp: false, followUpMax: 0, axes: ['主体性・意欲', '業界適性'] },
      { id: 'fng-c-7', category: 'プレッシャー下での成果', question: '締め切りや高い目標など、プレッシャーのかかる状況で成果を出した経験はありますか？どのように取り組んだか教えてください。', followUp: true, followUpMax: 1, axes: ['ストレス耐性', '論理的思考力'] },
      { id: 'fng-c-8', category: '改善提案', question: '既存のやり方に対して「こうすればもっと良くなる」と改善を提案した経験はありますか？その内容と結果を教えてください。', followUp: false, followUpMax: 0, axes: ['論理的思考力', '主体性・意欲'] },
      { id: 'fng-c-9', category: '5年後のビジョン', question: '5年後にどのような専門性を身につけ、どのような仕事をしていたいと考えていますか？', followUp: false, followUpMax: 0, axes: ['主体性・意欲', '組織適合性'] },
    ],
  },
  'fulltime-mid-experienced': {
    A: [
      { id: 'fme-a-1', category: '自己紹介・経歴', question: '自己紹介をお願いします。これまでのご経歴と、現在の専門分野について教えてください。', followUp: true, followUpMax: 1, axes: ['コミュニケーション力', '論理的思考力'] },
      { id: 'fme-a-2', category: '転職理由', question: '転職を考えた理由と、次の職場に求めているものを教えてください。', followUp: true, followUpMax: 1, axes: ['主体性・意欲', '組織適合性'] },
      { id: 'fme-a-3', category: '最大の成果', question: '前職での最も大きな成果について、状況・あなたの行動・結果を具体的に教えてください。', followUp: true, followUpMax: 2, axes: ['論理的思考力', '業界適性'] },
      { id: 'fme-a-4', category: '困難なプロジェクト', question: '仕事上で最も困難だったプロジェクトや課題について、どのように乗り越えたか教えてください。', followUp: true, followUpMax: 1, axes: ['ストレス耐性', '主体性・意欲'] },
      { id: 'fme-a-5', category: 'チームマネジメント', question: 'チームやメンバーと協力して進めた仕事の中で、あなたが意識していたことや果たした役割を教えてください。', followUp: true, followUpMax: 1, axes: ['組織適合性', 'コミュニケーション力'] },
      { id: 'fme-a-6', category: '業界知識・スキル', question: 'これまでの経験で培った専門知識やスキルのうち、転職先でも活かせると考えているものを教えてください。', followUp: false, followUpMax: 0, axes: ['業界適性', '論理的思考力'] },
      { id: 'fme-a-7', category: '失敗と改善', question: '仕事上で失敗やミスをした経験と、そこからどのように改善・学習したか教えてください。', followUp: true, followUpMax: 1, axes: ['ストレス耐性', '論理的思考力'] },
      { id: 'fme-a-8', category: 'メンバーサポート', question: 'チームの中で後輩やメンバーをサポートした経験はありますか？立場を問わず、誰かの成長に関わったエピソードがあれば教えてください。', followUp: false, followUpMax: 0, axes: ['組織適合性', 'コミュニケーション力'] },
      { id: 'fme-a-9', category: '入社後の貢献', question: '入社後、ご自身の経験をどのように活かし、どのような成果を出したいと考えていますか？', followUp: false, followUpMax: 0, axes: ['主体性・意欲', '業界適性'] },
    ],
    B: [
      { id: 'fme-b-1', category: '自己紹介・人柄', question: '自己紹介をお願いします。ご経歴に加えて、周囲からどんな人だと言われることが多いかも教えてください。', followUp: true, followUpMax: 1, axes: ['コミュニケーション力', '組織適合性'] },
      { id: 'fme-b-2', category: '転職理由', question: '転職を考えた背景と、新しい環境でどのような働き方をしたいか教えてください。', followUp: true, followUpMax: 2, axes: ['主体性・意欲', '組織適合性'] },
      { id: 'fme-b-3', category: '顧客・社外対応', question: 'お客様や取引先との対応で、信頼関係を築くために心がけていたことを教えてください。', followUp: true, followUpMax: 2, axes: ['コミュニケーション力', '業界適性'] },
      { id: 'fme-b-4', category: '人間関係の課題', question: '職場の人間関係で難しい状況に直面したことはありますか？そのときどのように対処しましたか？', followUp: true, followUpMax: 1, axes: ['ストレス耐性', 'コミュニケーション力'] },
      { id: 'fme-b-5', category: 'チームへの貢献', question: 'チームの雰囲気を良くするために、あなたが自発的に取り組んだことがあれば教えてください。', followUp: true, followUpMax: 1, axes: ['組織適合性', '主体性・意欲'] },
      { id: 'fme-b-6', category: '感謝・やりがい', question: '仕事をしている中で、最もやりがいを感じた瞬間や、感謝された経験を教えてください。', followUp: false, followUpMax: 0, axes: ['主体性・意欲', '組織適合性'] },
      { id: 'fme-b-7', category: '価値観の変化', question: '仕事を通じて、ご自身の価値観や考え方が変わった経験はありますか？', followUp: true, followUpMax: 1, axes: ['ストレス耐性', '論理的思考力'] },
      { id: 'fme-b-8', category: '理想のチーム', question: 'あなたにとって理想のチームや職場環境とはどのようなものですか？', followUp: false, followUpMax: 0, axes: ['組織適合性', 'コミュニケーション力'] },
      { id: 'fme-b-9', category: '長期的なビジョン', question: '今後のキャリアで大切にしたいことと、3〜5年後にどのような役割を担いたいか教えてください。', followUp: false, followUpMax: 0, axes: ['主体性・意欲', '業界適性'] },
    ],
    C: [
      { id: 'fme-c-1', category: '自己紹介・専門性', question: '自己紹介をお願いします。これまでのキャリアで最も深めてきた専門領域と、その実績を中心に教えてください。', followUp: true, followUpMax: 1, axes: ['論理的思考力', '業界適性'] },
      { id: 'fme-c-2', category: '転職理由', question: '転職を決意した理由と、キャリアにおいて次に達成したい目標を教えてください。', followUp: true, followUpMax: 2, axes: ['主体性・意欲', '論理的思考力'] },
      { id: 'fme-c-3', category: '数値で見る成果', question: '前職で達成された成果について教えてください。可能であれば、具体的な数値も交えていただけると助かります。', followUp: true, followUpMax: 2, axes: ['論理的思考力', '業界適性'] },
      { id: 'fme-c-4', category: '複雑な意思決定', question: '複数の選択肢がある中で難しい判断を迫られた経験はありますか？何を基準にどう決断したか教えてください。', followUp: true, followUpMax: 1, axes: ['論理的思考力', 'ストレス耐性'] },
      { id: 'fme-c-5', category: 'プロジェクト推進', question: '関係者が多い中でプロジェクトを推進した経験があれば、調整や合意形成のために行ったことを教えてください。', followUp: true, followUpMax: 1, axes: ['組織適合性', 'コミュニケーション力'] },
      { id: 'fme-c-6', category: '専門領域の変化', question: 'ご自身の専門領域で最近変化を感じていることはありますか？その変化に対して、どのように対応していきたいと考えていますか？', followUp: false, followUpMax: 0, axes: ['業界適性', '主体性・意欲'] },
      { id: 'fme-c-7', category: '失敗の分析', question: '過去の失敗やうまくいかなかったプロジェクトについて、原因分析と再発防止策をどのように行ったか教えてください。', followUp: true, followUpMax: 1, axes: ['論理的思考力', 'ストレス耐性'] },
      { id: 'fme-c-8', category: '業務改善', question: '業務フローやプロセスを改善した経験はありますか？その課題認識から改善の結果まで教えてください。', followUp: false, followUpMax: 0, axes: ['論理的思考力', '主体性・意欲'] },
      { id: 'fme-c-9', category: '即戦力としての貢献', question: '入社初日から3ヶ月間で、具体的にどのような貢献ができると考えていますか？', followUp: false, followUpMax: 0, axes: ['業界適性', '組織適合性'] },
    ],
  },
  'fulltime-mid-inexperienced': {
    A: [
      { id: 'fmi-a-1', category: '自己紹介・経歴', question: '自己紹介をお願いします。これまでのご経歴と、新しい分野に挑戦しようと思ったきっかけを教えてください。', followUp: true, followUpMax: 1, axes: ['コミュニケーション力', '主体性・意欲'] },
      { id: 'fmi-a-2', category: '志望動機', question: '未経験のこの分野を志望された理由と、どのような準備や学習をされてきたか教えてください。', followUp: true, followUpMax: 1, axes: ['主体性・意欲', '業界適性'] },
      { id: 'fmi-a-3', category: '転用できるスキル', question: 'これまでの経験の中で、この仕事でも活かせると思うスキルや強みはありますか？具体的なエピソードとともに教えてください。', followUp: true, followUpMax: 2, axes: ['論理的思考力', '業界適性'] },
      { id: 'fmi-a-4', category: '学習・適応経験', question: '過去に全く新しい分野やスキルを短期間で習得した経験はありますか？そのときの取り組み方を教えてください。', followUp: true, followUpMax: 1, axes: ['主体性・意欲', '論理的思考力'] },
      { id: 'fmi-a-5', category: '困難の乗り越え方', question: '仕事やプライベートで困難に直面したとき、どのように乗り越えましたか？具体的に教えてください。', followUp: true, followUpMax: 1, axes: ['ストレス耐性', '主体性・意欲'] },
      { id: 'fmi-a-6', category: '多様な協働経験', question: 'これまでの職場で、自分とは異なるタイプの人と協力して仕事を進めた経験はありますか？そのとき意識していたことを教えてください。', followUp: false, followUpMax: 0, axes: ['組織適合性', 'コミュニケーション力'] },
      { id: 'fmi-a-7', category: '前職での成長', question: '前職で最も成長できたと感じる経験は何ですか？その成長を次の仕事にどう活かしたいですか？', followUp: true, followUpMax: 1, axes: ['主体性・意欲', '論理的思考力'] },
      { id: 'fmi-a-8', category: 'キャリアチェンジの覚悟', question: '未経験の分野に飛び込むにあたり、不安に感じていることはありますか？それに対してどう向き合っていますか？', followUp: false, followUpMax: 0, axes: ['ストレス耐性', '主体性・意欲'] },
      { id: 'fmi-a-9', category: '入社後の目標', question: '入社後、最初の1年間でどのようなことを達成したいと考えていますか？', followUp: false, followUpMax: 0, axes: ['主体性・意欲', '組織適合性'] },
    ],
    B: [
      { id: 'fmi-b-1', category: '自己紹介・人柄', question: '自己紹介をお願いします。ご経歴に加えて、ご自身がどんなタイプの人間か、人からどう言われるかも教えてください。', followUp: true, followUpMax: 1, axes: ['コミュニケーション力', '組織適合性'] },
      { id: 'fmi-b-2', category: '志望動機', question: 'この仕事に惹かれた理由と、どんな気持ちで仕事に向き合いたいと考えているか教えてください。', followUp: true, followUpMax: 2, axes: ['主体性・意欲', '業界適性'] },
      { id: 'fmi-b-3', category: '人と関わる経験', question: '前職やこれまでの生活で、多くの人と関わる中で大切にしてきたことは何ですか？', followUp: true, followUpMax: 2, axes: ['コミュニケーション力', '組織適合性'] },
      { id: 'fmi-b-4', category: '相手に寄り添った経験', question: 'お客様や同僚の立場に立って行動した経験があれば、具体的に教えてください。', followUp: true, followUpMax: 1, axes: ['コミュニケーション力', '組織適合性'] },
      { id: 'fmi-b-5', category: '環境変化への適応', question: '新しい環境に飛び込んだ経験はありますか？そのときどのように馴染んでいきましたか？', followUp: true, followUpMax: 1, axes: ['ストレス耐性', '組織適合性'] },
      { id: 'fmi-b-6', category: 'やりがいの源泉', question: 'これまでの仕事や活動で、最もやりがいや喜びを感じた瞬間を教えてください。', followUp: false, followUpMax: 0, axes: ['主体性・意欲', '組織適合性'] },
      { id: 'fmi-b-7', category: '素直さ・吸収力', question: '周囲のアドバイスやフィードバックを受けて、自分を変えた経験はありますか？', followUp: true, followUpMax: 1, axes: ['主体性・意欲', 'コミュニケーション力'] },
      { id: 'fmi-b-8', category: '理想の働き方', question: 'あなたにとって理想の職場や働き方とはどのようなものですか？', followUp: false, followUpMax: 0, axes: ['組織適合性', '主体性・意欲'] },
      { id: 'fmi-b-9', category: '1年後の自分', question: '入社して1年後、どんな自分になっていたいですか？具体的なイメージがあれば教えてください。', followUp: false, followUpMax: 0, axes: ['主体性・意欲', '業界適性'] },
    ],
    C: [
      { id: 'fmi-c-1', category: '自己紹介・転用スキル', question: '自己紹介をお願いします。前職で身につけたスキルのうち、異分野でも通用すると考えているものを中心に教えてください。', followUp: true, followUpMax: 1, axes: ['論理的思考力', '業界適性'] },
      { id: 'fmi-c-2', category: '志望動機・分析', question: 'この業界に転身しようと決めた理由を、業界の特徴や将来性に対するご自身の分析を交えて教えてください。', followUp: true, followUpMax: 2, axes: ['論理的思考力', '業界適性'] },
      { id: 'fmi-c-3', category: '独学・自己研鑽', question: '新しい分野に向けて、具体的にどのような学習や準備を行ってきましたか？学習方法やスケジュール管理も含めて教えてください。', followUp: true, followUpMax: 2, axes: ['主体性・意欲', '論理的思考力'] },
      { id: 'fmi-c-4', category: '課題解決の思考プロセス', question: '前職で課題に直面したとき、どのように情報を整理し、解決策を導き出しましたか？具体例で教えてください。', followUp: true, followUpMax: 1, axes: ['論理的思考力', '主体性・意欲'] },
      { id: 'fmi-c-5', category: '数値目標と達成', question: '前職で数値目標を追った経験はありますか？目標に対するアプローチと結果を教えてください。', followUp: true, followUpMax: 1, axes: ['論理的思考力', 'ストレス耐性'] },
      { id: 'fmi-c-6', category: '協働と調整', question: '異なる立場の関係者と協力して物事を進めた経験について、あなたの調整方法を教えてください。', followUp: false, followUpMax: 0, axes: ['組織適合性', 'コミュニケーション力'] },
      { id: 'fmi-c-7', category: '失敗と論理的改善', question: 'うまくいかなかった経験について、原因をどう分析し、次にどう活かしたか教えてください。', followUp: true, followUpMax: 1, axes: ['論理的思考力', 'ストレス耐性'] },
      { id: 'fmi-c-8', category: '未経験の武器', question: '未経験だからこそ持ち込める視点や強みがあるとすれば、何だと考えますか？', followUp: false, followUpMax: 0, axes: ['主体性・意欲', '業界適性'] },
      { id: 'fmi-c-9', category: '3ヶ月のアクションプラン', question: '入社してから最初の3ヶ月間で、何を学び、どのような行動を取りたいと考えていますか？', followUp: false, followUpMax: 0, axes: ['主体性・意欲', '組織適合性'] },
    ],
  },
  'parttime-experienced': {
    A: [
      { id: 'pe-a-1', category: '自己紹介', question: '簡単に自己紹介をお願いします。これまでのお仕事の経験について教えてください。', followUp: true, followUpMax: 1, axes: ['コミュニケーション力'] },
      { id: 'pe-a-2', category: '応募理由', question: '今回このお仕事に応募された理由を教えてください。', followUp: true, followUpMax: 1, axes: ['主体性・意欲', '業界適性'] },
      { id: 'pe-a-3', category: '前職での経験', question: '以前のアルバイトや仕事で、特に頑張ったことや成果を出せたことを教えてください。', followUp: true, followUpMax: 1, axes: ['主体性・意欲', '業界適性'] },
      { id: 'pe-a-4', category: '接客・対応経験', question: 'お客様や利用者への対応で、工夫していたことや心がけていたことはありますか？', followUp: true, followUpMax: 1, axes: ['コミュニケーション力', '組織適合性'] },
      { id: 'pe-a-5', category: 'トラブル対応', question: '仕事中に困った状況やトラブルがあったとき、どう対処しましたか？具体的に教えてください。', followUp: true, followUpMax: 1, axes: ['ストレス耐性', 'コミュニケーション力'] },
      { id: 'pe-a-6', category: 'チームワーク', question: '一緒に働くスタッフとの関わり方で、大切にしていることはありますか？', followUp: false, followUpMax: 0, axes: ['組織適合性', 'コミュニケーション力'] },
      { id: 'pe-a-7', category: '勤務条件', question: '希望する勤務日数や時間帯、曜日の希望があれば教えてください。', followUp: false, followUpMax: 0, axes: ['組織適合性'] },
      { id: 'pe-a-8', category: '長期継続の意思', question: 'このお仕事はどのくらいの期間続けたいと考えていますか？', followUp: false, followUpMax: 0, axes: ['主体性・意欲', '組織適合性'] },
      { id: 'pe-a-9', category: '自己PR', question: '最後に、あなたの強みやアピールしたいポイントがあれば教えてください。', followUp: false, followUpMax: 0, axes: ['コミュニケーション力', '主体性・意欲'] },
    ],
    B: [
      { id: 'pe-b-1', category: '自己紹介', question: '自己紹介をお願いします。ご自身の性格や、人からよく言われる印象も含めて教えてください。', followUp: true, followUpMax: 1, axes: ['コミュニケーション力', '組織適合性'] },
      { id: 'pe-b-2', category: '応募理由', question: '今回のお仕事に興味を持った理由と、どんな気持ちで働きたいか教えてください。', followUp: true, followUpMax: 1, axes: ['主体性・意欲', '業界適性'] },
      { id: 'pe-b-3', category: '人と接する仕事の魅力', question: 'これまで人と接する仕事をしてきた中で、最もやりがいを感じた瞬間を教えてください。', followUp: true, followUpMax: 1, axes: ['コミュニケーション力', '主体性・意欲'] },
      { id: 'pe-b-4', category: 'お客様への気配り', question: 'お客様に喜んでもらうために、自分なりに工夫した経験があれば教えてください。', followUp: true, followUpMax: 1, axes: ['コミュニケーション力', '組織適合性'] },
      { id: 'pe-b-5', category: '仲間との助け合い', question: '忙しいときに同僚を助けたり、助けられたりした経験はありますか？', followUp: false, followUpMax: 0, axes: ['組織適合性', 'コミュニケーション力'] },
      { id: 'pe-b-6', category: 'クレーム・苦情対応', question: 'お客様から厳しい言葉を受けた経験はありますか？そのときどう対応しましたか？', followUp: true, followUpMax: 1, axes: ['ストレス耐性', 'コミュニケーション力', '論理的思考力'] },
      { id: 'pe-b-7', category: '勤務条件', question: '希望する勤務日数・時間帯・曜日を教えてください。繁忙期の対応についてはいかがですか？', followUp: false, followUpMax: 0, axes: ['組織適合性'] },
      { id: 'pe-b-8', category: '職場で大切にしたいこと', question: '一緒に働く仲間との関係で、大切にしたいことは何ですか？', followUp: false, followUpMax: 0, axes: ['組織適合性', '主体性・意欲'] },
      { id: 'pe-b-9', category: '意気込み', question: 'このお仕事を通じて、どんな自分でありたいですか？意気込みを教えてください。', followUp: false, followUpMax: 0, axes: ['主体性・意欲'] },
    ],
    C: [
      { id: 'pe-c-1', category: '自己紹介・スキル', question: '自己紹介をお願いします。これまでの仕事で身につけたスキルや得意なことを中心に教えてください。', followUp: true, followUpMax: 1, axes: ['コミュニケーション力', '業界適性'] },
      { id: 'pe-c-2', category: '応募理由', question: 'このお仕事に応募した理由と、ご自身の経験がどう活かせると考えているか教えてください。', followUp: true, followUpMax: 1, axes: ['主体性・意欲', '業界適性'] },
      { id: 'pe-c-3', category: '業務効率化', question: '以前の職場で、仕事のやり方を工夫して効率を上げた経験はありますか？具体的に教えてください。', followUp: true, followUpMax: 1, axes: ['論理的思考力', '主体性・意欲'] },
      { id: 'pe-c-4', category: '正確性・品質管理', question: 'ミスを防ぐために、仕事中に心がけていたことや工夫はありますか？', followUp: true, followUpMax: 1, axes: ['論理的思考力', 'ストレス耐性'] },
      { id: 'pe-c-5', category: '問題発見と報告', question: '仕事中に問題や普段と違う状況を発見したことはありますか？そのとき、どのように対処しましたか？具体的に教えてください。', followUp: true, followUpMax: 1, axes: ['論理的思考力', 'コミュニケーション力'] },
      { id: 'pe-c-6', category: 'マルチタスク', question: '複数の作業を同時に進めなければならない場面で、どのように優先順位をつけていましたか？', followUp: false, followUpMax: 0, axes: ['論理的思考力', 'ストレス耐性'] },
      { id: 'pe-c-7', category: '勤務条件', question: '希望する勤務条件を教えてください。急なシフト変更への対応は可能ですか？', followUp: false, followUpMax: 0, axes: ['組織適合性'] },
      { id: 'pe-c-8', category: '後輩・新人への指導', question: '新しく入った人に仕事を教えた経験はありますか？そのとき意識していたことを教えてください。', followUp: false, followUpMax: 0, axes: ['組織適合性', 'コミュニケーション力'] },
      { id: 'pe-c-9', category: '今後の目標', question: 'このお仕事を通じて、どのようなスキルや経験を得たいと考えていますか？', followUp: false, followUpMax: 0, axes: ['主体性・意欲', '業界適性'] },
    ],
  },
  'parttime-inexperienced': {
    A: [
      { id: 'pi-a-1', category: '自己紹介', question: '簡単に自己紹介をお願いします。普段どのように過ごしているか教えてください。', followUp: false, followUpMax: 0, axes: ['コミュニケーション力'] },
      { id: 'pi-a-2', category: '応募理由', question: '今回このお仕事に応募した理由を教えてください。', followUp: true, followUpMax: 1, axes: ['主体性・意欲', '業界適性'] },
      { id: 'pi-a-3', category: '興味を持ったきっかけ', question: 'この仕事やこの業界に興味を持ったきっかけはありますか？', followUp: true, followUpMax: 1, axes: ['主体性・意欲', '業界適性'] },
      { id: 'pi-a-4', category: '学校・日常での頑張り', question: '学校生活や普段の生活の中で、頑張っていることや力を入れていることはありますか？', followUp: true, followUpMax: 1, axes: ['主体性・意欲', '論理的思考力'] },
      { id: 'pi-a-5', category: '人との関わり', question: '友人や家族、周囲の人と関わる中で、大切にしていることはありますか？', followUp: false, followUpMax: 0, axes: ['コミュニケーション力', '組織適合性'] },
      { id: 'pi-a-6', category: '困難への対処', question: '学校や日常生活で困ったことがあったとき、どのように対処しましたか？', followUp: true, followUpMax: 1, axes: ['ストレス耐性', '主体性・意欲'] },
      { id: 'pi-a-7', category: '勤務条件', question: '希望する勤務日数や時間帯、曜日の希望があれば教えてください。', followUp: false, followUpMax: 0, axes: ['組織適合性'] },
      { id: 'pi-a-8', category: '不安なこと', question: '初めてのお仕事で不安に感じていることはありますか？それに対してどう向き合いたいですか？', followUp: false, followUpMax: 0, axes: ['ストレス耐性', '主体性・意欲'] },
      { id: 'pi-a-9', category: '自己PR', question: '最後に、あなたの良いところやアピールしたいことがあれば自由に教えてください。', followUp: false, followUpMax: 0, axes: ['コミュニケーション力', '主体性・意欲'] },
    ],
    B: [
      { id: 'pi-b-1', category: '自己紹介', question: '自己紹介をお願いします。あなたの性格や好きなことも含めて教えてください。', followUp: false, followUpMax: 0, axes: ['コミュニケーション力', '組織適合性'] },
      { id: 'pi-b-2', category: '応募理由', question: 'このお仕事に応募しようと思った理由と、どんな気持ちで働きたいか教えてください。', followUp: true, followUpMax: 1, axes: ['主体性・意欲', '業界適性'] },
      { id: 'pi-b-3', category: '人を喜ばせた経験', question: '友人や家族など、誰かを喜ばせたり助けたりした経験はありますか？そのとき嬉しかったですか？', followUp: true, followUpMax: 1, axes: ['コミュニケーション力', '組織適合性'] },
      { id: 'pi-b-4', category: '初めての挑戦', question: 'これまでに初めて挑戦したことで、印象に残っている経験はありますか？', followUp: true, followUpMax: 1, axes: ['主体性・意欲', 'ストレス耐性'] },
      { id: 'pi-b-5', category: 'グループでの経験', question: '学校の行事や部活、サークルなど、グループで何かに取り組んだ経験はありますか？', followUp: false, followUpMax: 0, axes: ['組織適合性', 'コミュニケーション力'] },
      { id: 'pi-b-6', category: '失敗したとき', question: '失敗してしまったことや、うまくいかなかった経験はありますか？そのときどう気持ちを切り替えましたか？', followUp: true, followUpMax: 1, axes: ['ストレス耐性', '主体性・意欲'] },
      { id: 'pi-b-7', category: '勤務条件', question: '希望する勤務条件を教えてください。テスト期間など、シフトが難しい時期はありますか？', followUp: false, followUpMax: 0, axes: ['組織適合性'] },
      { id: 'pi-b-8', category: 'どんな人になりたいか', question: 'このお仕事を通じて、どんな自分になりたいですか？', followUp: false, followUpMax: 0, axes: ['主体性・意欲', '組織適合性'] },
      { id: 'pi-b-9', category: '意気込み', question: '最後に、このお仕事への意気込みを教えてください。', followUp: false, followUpMax: 0, axes: ['主体性・意欲', 'コミュニケーション力'] },
    ],
    C: [
      { id: 'pi-c-1', category: '自己紹介', question: '自己紹介をお願いします。得意なことや、自信のあることがあれば教えてください。', followUp: false, followUpMax: 0, axes: ['コミュニケーション力', '主体性・意欲'] },
      { id: 'pi-c-2', category: '応募理由', question: 'このお仕事に応募した理由と、この仕事を通じて身につけたいスキルがあれば教えてください。', followUp: true, followUpMax: 1, axes: ['主体性・意欲', '業界適性'] },
      { id: 'pi-c-3', category: '計画的に取り組んだ経験', question: '学校の課題やテスト勉強など、計画を立てて取り組んだ経験はありますか？どのように進めましたか？', followUp: true, followUpMax: 1, axes: ['論理的思考力', '主体性・意欲'] },
      { id: 'pi-c-4', category: '工夫した経験', question: '何かを効率よく進めるために、自分なりに工夫した経験はありますか？', followUp: true, followUpMax: 1, axes: ['論理的思考力', '主体性・意欲'] },
      { id: 'pi-c-5', category: '正確さへの意識', question: '学校の課題や普段の生活で、正確さやミスをしないことを意識して取り組んだ経験があれば、どのように工夫したか教えてください。', followUp: false, followUpMax: 0, axes: ['論理的思考力', 'ストレス耐性'] },
      { id: 'pi-c-6', category: '新しいことの学び方', question: '新しいことを覚えるとき、あなたはどのような方法で学ぶのが得意ですか？', followUp: true, followUpMax: 1, axes: ['主体性・意欲', '論理的思考力'] },
      { id: 'pi-c-7', category: '勤務条件', question: '希望する勤務条件を教えてください。繁忙期や長期休暇中の勤務は可能ですか？', followUp: false, followUpMax: 0, axes: ['組織適合性'] },
      { id: 'pi-c-8', category: '責任感', question: '任されたことを最後までやり遂げた経験はありますか？そのとき大変だったことも含めて教えてください。', followUp: false, followUpMax: 0, axes: ['ストレス耐性', '主体性・意欲'] },
      { id: 'pi-c-9', category: '目標', question: 'このお仕事で、最初の1ヶ月でどんなことができるようになりたいですか？', followUp: false, followUpMax: 0, axes: ['主体性・意欲', '業界適性'] },
    ],
  },
}

const PATTERN_LABELS: Record<string, string> = {
  'fulltime-new-graduate': '正社員×新卒',
  'fulltime-mid-experienced': '正社員×中途×経験者',
  'fulltime-mid-inexperienced': '正社員×中途×未経験',
  'parttime-experienced': 'アルバイト×経験者',
  'parttime-inexperienced': 'アルバイト×未経験',
}

const SET_LABELS: Record<string, string> = {
  A: 'セットA：スタンダード',
  B: 'セットB：カルチャーフィット重視',
  C: 'セットC：スキル・論理性重視',
}

export default function QuestionsPage() {
  const [activePattern, setActivePattern] = useState<'fulltime-new-graduate' | 'fulltime-mid-experienced' | 'fulltime-mid-inexperienced' | 'parttime-experienced' | 'parttime-inexperienced'>('fulltime-new-graduate')
  const [activeSet, setActiveSet] = useState<'A' | 'B' | 'C'>('A')
  const [toastVisible, setToastVisible] = useState(false)
  const [toastMessage, setToastMessage] = useState('')

  const showToast = (msg: string) => {
    setToastMessage(msg)
    setToastVisible(true)
    setTimeout(() => setToastVisible(false), 2000)
  }

  const currentQuestions = QUESTION_BANK[activePattern]?.[activeSet] ?? []
  const patternLabel = PATTERN_LABELS[activePattern]
  const setLabel = SET_LABELS[activeSet]

  return (
    <>
      <div className="space-y-6 min-w-0 max-w-[100vw] pb-10">
        {/* セクション1: ページヘッダー */}
        <div>
          <h1 className="text-2xl font-bold text-white">質問バンク</h1>
          <p className="text-sm text-gray-400 mt-1">面接質問テンプレートの管理。企業セットアップ時にセットA・B・Cから最適なものを選び、割り当てます。</p>
        </div>

        {/* セクション2: セット説明カード3枚 */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-8">
          <div className="bg-white/[0.04] backdrop-blur-xl border border-white/[0.06] rounded-2xl p-5 border-t-2 border-t-blue-500">
            <p className="text-lg font-semibold text-white">セットA：スタンダード</p>
            <p className="text-sm text-gray-400 mt-2 leading-relaxed">バランス型。どの業界にも対応できる万能な質問構成。迷ったらまずこれを推奨。</p>
            <p className="text-xs text-blue-400 mt-3">おすすめ業界：全業界対応</p>
          </div>
          <div className="bg-white/[0.04] backdrop-blur-xl border border-white/[0.06] rounded-2xl p-5 border-t-2 border-t-emerald-500">
            <p className="text-lg font-semibold text-white">セットB：カルチャーフィット重視</p>
            <p className="text-sm text-gray-400 mt-2 leading-relaxed">人柄・対人スキル・ホスピタリティを深く見る構成。人と接する仕事に最適。</p>
            <p className="text-xs text-emerald-400 mt-3">おすすめ業界：飲食、小売、サービス、医療・介護、教育</p>
          </div>
          <div className="bg-white/[0.04] backdrop-blur-xl border border-white/[0.06] rounded-2xl p-5 border-t-2 border-t-purple-500">
            <p className="text-lg font-semibold text-white">セットC：スキル・論理性重視</p>
            <p className="text-sm text-gray-400 mt-2 leading-relaxed">思考力・課題解決力・専門性を深く見る構成。成果・論理を求められる仕事に最適。</p>
            <p className="text-xs text-purple-400 mt-3">おすすめ業界：IT、コンサル、金融、製造、専門職</p>
          </div>
        </div>

        {/* セクション3: 共通質問 */}
        <div className="mt-8">
          <h2 className="text-lg font-semibold text-white mb-2">共通質問（全パターン・全セット共通）</h2>
          <p className="text-xs text-gray-500 mb-4">すべての面接で冒頭とクロージングに自動挿入されます。評価対象外。</p>
          <div className="space-y-3">
            {COMMON_QUESTIONS.map((cq) => (
              <div key={cq.id} className="bg-white/[0.04] border border-white/[0.06] rounded-xl p-5 mb-3">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white">{cq.label}（{cq.category}）</p>
                    <p className="text-sm text-white leading-relaxed mt-2">{cq.question}</p>
                  </div>
                  <div className="flex items-center shrink-0">
                    <span className="text-xs bg-white/[0.04] text-gray-600 rounded-md px-2 py-0.5">評価対象外</span>
                    <button type="button" onClick={() => showToast('編集機能は今後実装予定です')} className="text-xs text-blue-400 hover:text-blue-300 ml-3">
                      編集
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* セクション4: パターン選択 */}
        <div className="h-px bg-gradient-to-r from-transparent via-white/[0.06] to-transparent my-8" />
        <h2 className="text-lg font-semibold text-white mb-2">パターン別テンプレート</h2>
        <p className="text-sm text-gray-400 mb-5">5つのパターンからパターンを選択し、セットA・B・Cの質問内容を確認・編集できます。</p>
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-6">
          {(['fulltime-new-graduate', 'fulltime-mid-experienced', 'fulltime-mid-inexperienced', 'parttime-experienced', 'parttime-inexperienced'] as const).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setActivePattern(p)}
              className={`rounded-xl p-4 text-left transition-all duration-200 ${
                activePattern === p
                  ? 'bg-white/[0.06] border border-white/[0.10] border-l-2 border-l-blue-500'
                  : 'bg-white/[0.03] border border-white/[0.06] hover:bg-white/[0.05] cursor-pointer'
              }`}
            >
              <p className={`text-sm font-medium ${activePattern === p ? 'text-white' : 'text-gray-400'}`}>{PATTERN_LABELS[p]}</p>
              <p className="text-xs text-gray-500 mt-1">各セット9問</p>
            </button>
          ))}
        </div>

        {/* セクション5: セット選択タブ */}
        <div className="flex gap-2 mb-6">
          {(['A', 'B', 'C'] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setActiveSet(s)}
              className={`rounded-xl px-5 py-2.5 text-sm transition-all ${
                activeSet === s
                  ? s === 'A'
                    ? 'bg-blue-500/10 border border-blue-500/30 text-blue-400'
                    : s === 'B'
                    ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-400'
                    : 'bg-purple-500/10 border border-purple-500/30 text-purple-400'
                  : 'bg-white/[0.03] border border-white/[0.06] text-gray-400 hover:bg-white/[0.05] cursor-pointer'
              }`}
            >
              {SET_LABELS[s]}
            </button>
          ))}
        </div>

        {/* セクション6: 質問リスト */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center">
            <h2 className="text-base font-semibold text-white">面接質問リスト</h2>
            <span className="text-sm text-gray-500 ml-3">{patternLabel} / {setLabel}</span>
          </div>
          <button
            type="button"
            onClick={() => showToast('質問追加機能は今後実装予定です')}
            className="inline-flex items-center gap-2 bg-white/[0.05] hover:bg-white/[0.08] border border-white/[0.08] text-gray-400 hover:text-white text-sm rounded-xl px-4 py-2 transition-all"
          >
            <Plus className="w-4 h-4" />
            質問を追加
          </button>
        </div>
        <div className="space-y-3">
          {currentQuestions.map((q, i) => (
            <div key={q.id} className="bg-white/[0.04] border border-white/[0.06] rounded-xl p-5 mb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="text-sm font-semibold text-gray-400">Q{i + 1}</span>
                  <span className="text-sm font-medium text-gray-300">{q.category}</span>
                  <span className="text-gray-600 mx-1">|</span>
                  <span className="text-xs text-gray-500">
                    {q.followUp ? `深掘り: あり（最大${q.followUpMax}回）` : '深掘り: なし'}
                  </span>
                </div>
                <div>
                  <button type="button" onClick={() => showToast('編集機能は今後実装予定です')} className="text-xs text-blue-400 hover:text-blue-300">
                    編集
                  </button>
                  <button type="button" onClick={() => showToast('削除機能は今後実装予定です')} className="text-xs text-red-400/60 hover:text-red-400 ml-3">
                    削除
                  </button>
                </div>
              </div>
              <p className="text-sm text-white leading-relaxed mt-3">{q.question}</p>
              <div className="mt-3">
                <span className="text-xs text-gray-600">評価軸: </span>
                <span className="text-xs text-gray-500">{q.axes.join(', ')}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* トースト */}
      {toastVisible && (
        <div className="fixed bottom-6 right-6 z-50 bg-white/[0.08] backdrop-blur-2xl border border-white/[0.10] rounded-xl shadow-lg px-5 py-3 text-sm text-gray-300">
          {toastMessage}
        </div>
      )}
    </>
  )
}
