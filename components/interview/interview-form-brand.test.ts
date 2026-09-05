import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// 応募フォームの2不具合修正のガード（node-only=RTL 不使用のため source-level 検証）:
//   #1 /form 上部が「応募先企業名」を表示（AIMEN24 は company-name 位置に出さない・footer の Powered by は維持）。
//   #2 「次へ進む」が silent に進めない状態を作らない（companyId 無し=honest error / validation 失敗=要約表示）。

const LAYOUT = readFileSync(join(process.cwd(), 'components/interview/InterviewLayout.tsx'), 'utf8')
const FORM = readFileSync(join(process.cwd(), 'app/interview/[slug]/form/page.tsx'), 'utf8')

describe('#1 InterviewLayout: 上部は company 名（AIMEN24 は fallback のみ）', () => {
  it('companyName が渡されたら company 名を header に表示する分岐がある', () => {
    // companyName の三項分岐で <h1>{companyName}</h1> を出す（logo が無い場合）。
    expect(LAYOUT).toMatch(/\)\s*:\s*companyName\s*\?\s*\(/) // ...) : companyName ? (
    expect(LAYOUT).toContain('<h1 className="text-xl font-bold text-gray-900">{companyName}</h1>')
  })
  it('APP_NAME は「企業を解決できない場合の fallback」位置のみ（company-name 位置ではない）', () => {
    // APP_NAME の span は companyName 三項の else 側にある（＝company 名が最優先）。
    const idxCompanyTernary = LAYOUT.indexOf(': companyName ? (')
    const idxAppNameSpan = LAYOUT.indexOf('text-lg font-bold text-blue-600">{APP_NAME}')
    expect(idxCompanyTernary).toBeGreaterThan(0)
    expect(idxAppNameSpan).toBeGreaterThan(idxCompanyTernary) // fallback は後段
  })
  it('footer の Powered by {APP_NAME} は維持', () => {
    expect(LAYOUT).toContain('Powered by {APP_NAME}')
  })
})

describe('#1 form: 企業名を public-config から再利用（デジタル履歴書 v1 で 6ステップ化）', () => {
  it('company.name を state にセット（同じ public-config を情報源に使用）', () => {
    expect(FORM).toContain('setCompanyName(company.name')
    expect(FORM).toContain('/api/interview/${slug}/public-config') // /interview/[slug] と同じ情報源
  })
  it('ヘッダーに companyName を表示（AIMEN24 直書きでない）', () => {
    expect(FORM).toContain('{companyName}</span>')
    expect(FORM).not.toContain('AIMEN24')
  })
  it('応募者画面に企業ロゴを出さない（会社名テキストのみ・ロゴ描画は撤去）', () => {
    // Phase C: applicant-facing 画面では企業ロゴを描画しない（会社名テキストは可）。
    expect(FORM).not.toContain('setCompanyLogo')
    expect(FORM).not.toContain('company.logo_url')
    expect(FORM).not.toContain('companyLogo')
  })
  it('企業名をハードコードしていない（テスト株式会社を直書きしない）', () => {
    expect(FORM).not.toContain('テスト株式会社')
    expect(FORM).not.toContain('株式会社</')
  })
})

describe('#2 form: 「次へ進む」「応募する」が silent に失敗しない', () => {
  it('companyId 無しの silent early-return を撤去し honest error を出す', () => {
    expect(FORM).not.toMatch(/if \(!companyId\) return\s*$/m)
    expect(FORM).toContain('企業情報を取得できませんでした')
  })
  it('validation 失敗時に要約メッセージを出す（不足理由が分かる）', () => {
    expect(FORM).toContain('未入力またはエラーの項目があります')
  })
  it('API 失敗時の honest error（保存失敗）と /verify への遷移は維持', () => {
    expect(FORM).toContain('応募情報を保存できませんでした')
    expect(FORM).toContain('/interview/${slug}/verify')
  })
  it('二重 submit 防止（submitting）と captcha 検証は維持（無効化しない）', () => {
    expect(FORM).toContain('setSubmitting(true)')
    expect(FORM).toContain('TURNSTILE_SITE_KEY && !captchaToken') // captcha を弱めない
  })
  it('API のエラーメッセージを honest に表示（原因を汎用文言で覆い隠さない）', () => {
    expect(FORM).toContain("json?.error?.message || '応募情報を保存できませんでした")
  })
})

describe('デジタル履歴書 v1: 6ステップ＋履歴書送信の骨格', () => {
  it('6サブステップ（基本情報/住所/学歴/職歴/資格・自己PR/確認）を持つ', () => {
    expect(FORM).toContain("const SUB_STEPS = ['基本情報', '住所', '学歴', '職歴', '資格・自己PR', '確認']")
  })
  it('年齢の手入力欄を撤去し birth_date から age を算出（client age を送らない）', () => {
    expect(FORM).toContain('computeAge(birthDate)')
    expect(FORM).toContain('birth_date: birthDate')
    // 旧: 年齢テキスト入力（age state）は撤去
    expect(FORM).not.toContain("label=\"年齢\"")
  })
  it('resume payload を /applicant に送る（子テーブルへ atomic 保存）', () => {
    expect(FORM).toContain('resume: buildResumeInput()')
    expect(FORM).toContain('normalizeResumeInput(buildResumeInput())')
  })
  it('郵便番号検索は専用 route 経由（client が日本郵便を直接叩かない）', () => {
    expect(FORM).toContain('/api/postal/lookup?zip=')
  })
  it('下書きは sessionStorage のみ（localStorage に PII を置かない）', () => {
    expect(FORM).toContain('interview_${slug}_resume_draft')
    // localStorage への実アクセス（get/set/removeItem）が無い（コメントでの言及は可）。
    expect(FORM).not.toMatch(/localStorage\s*\.\s*(get|set|remove)Item/)
  })
})

describe('性別: 必須・男性/女性のみ（Human QA 反映）', () => {
  // Human QA: gender は必須の radio。male/female のみ。other/no_answer/選択しない は新フォームから撤去。
  it('GENDER_OPTIONS は male/female のみ（other/no_answer 撤去）', () => {
    // GENDER_OPTIONS 定義ブロックだけを抽出（SCHOOL_TYPE_OPTIONS の その他 と混同しない）。
    const start = FORM.indexOf('const GENDER_OPTIONS = [')
    const genderBlock = FORM.slice(start, FORM.indexOf(']', start))
    expect(start).toBeGreaterThan(0)
    expect(genderBlock).toContain("{ value: 'male', label: '男性' }")
    expect(genderBlock).toContain("{ value: 'female', label: '女性' }")
    expect(genderBlock).not.toContain("no_answer")
    expect(genderBlock).not.toContain("その他")
    expect(genderBlock).not.toContain("回答しない")
  })
  it('性別は必須・radio（select ではない）', () => {
    expect(FORM).toContain('<InputField label="性別" required error={errors.gender}>')
    expect(FORM).toContain('<RadioGroup value={gender} onChange={setGender} options={GENDER_OPTIONS} />')
  })
  it('性別未選択（male/female 以外）は step1 で reject', () => {
    expect(FORM).toContain("if (gender !== 'male' && gender !== 'female') e.gender = '性別を選択してください'")
  })
})

describe('Human QA 反映: draft 通知 / 学歴 visibility / 職歴なし / 任意 PR', () => {
  it('draft 復元通知は新文言・初回のみ・3.5s 自動消滅', () => {
    expect(FORM).toContain('前回の入力内容を引き継ぎました')
    expect(FORM).not.toContain('入力途中の内容を復元しました') // 旧文言は撤去
    expect(FORM).toContain('setTimeout(() => setDraftRestored(false), 3500)')
  })
  it('学歴は school_type で 入学年月/学部学科 を出し分け', () => {
    expect(FORM).toContain('vis.showEnteredYearMonth')
    expect(FORM).toContain('vis.showFacultyDepartment')
  })
  it('職歴は「職歴あり/職歴なし」を明示選択（radio）', () => {
    expect(FORM).toContain("options={[{ value: 'has', label: '職歴あり' }, { value: 'none', label: '職歴なし（新卒・未就業）' }]}")
  })
  it('確認画面: 職歴なしは「職歴なし」表示・資格/PR 空は「未入力」', () => {
    expect(FORM).toContain('value="職歴なし"')
    expect(FORM).toContain('<PreviewRow label="資格・自己PR" value="未入力" />')
  })
  it('資格・自己PR step に「すべて任意」の明示がある', () => {
    expect(FORM).toContain('すべて任意です。入力せず次へ進むこともできます。')
  })
  it('住所自動取得失敗の文言が自然（エラー感を弱める）', () => {
    expect(FORM).toContain('住所を自動取得できなかったため、続けて住所をご入力ください。')
  })
})
