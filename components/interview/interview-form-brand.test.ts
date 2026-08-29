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

describe('性別: 任意（未回答可）＝ no_answer を含む選択肢', () => {
  // Phase C: gender は任意入力。male/female/other/no_answer を選べ、未選択（空）も許容。
  it('GENDER_OPTIONS に male/female/other/no_answer がある', () => {
    expect(FORM).toContain("{ value: 'male', label: '男性' }")
    expect(FORM).toContain("{ value: 'female', label: '女性' }")
    expect(FORM).toContain("{ value: 'no_answer', label: '回答しない' }")
  })
  it('性別ラベルは任意表記（必須にしない）', () => {
    expect(FORM).toContain('label="性別（任意）"')
  })
})
