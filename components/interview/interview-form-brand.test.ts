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

describe('#1 form: 企業名を public-config から再利用して InterviewLayout に渡す', () => {
  it('company.name / logo_url を state にセット（新規解決ロジックを作らない=同じ public-config を使用）', () => {
    expect(FORM).toContain('setCompanyName(company.name')
    expect(FORM).toContain('setCompanyLogo(company.logo_url')
    expect(FORM).toContain('/api/interview/${slug}/public-config') // /interview/[slug] と同じ情報源
  })
  it('ヘッダーに companyName を表示（AIMEN24 直書きでない）', () => {
    // UI 刷新で InterviewLayout 依存を撤去し、開始画面と統一のインラインヘッダーで会社名を表示する。
    //（会社名を最優先で表示する＝AIMEN24 を company 位置に直書きしない・企業名ハードコードもしない、という intent は不変）
    expect(FORM).toContain('{companyName}</span>')
    expect(FORM).not.toContain('AIMEN24')
  })
  it('企業名をハードコードしていない（テスト株式会社を直書きしない）', () => {
    expect(FORM).not.toContain('テスト株式会社')
    expect(FORM).not.toContain('株式会社</')
  })
})

describe('#2 form: 「次へ進む」が silent に失敗しない', () => {
  it('companyId 無しの silent early-return を撤去し honest error を出す', () => {
    // 旧: `if (!companyId) return`（silent no-op）が残っていない。
    expect(FORM).not.toMatch(/if \(!companyId\) return\s*$/m)
    expect(FORM).toContain('企業情報を取得できませんでした')
  })
  it('validation 失敗時にボタン付近へ要約メッセージを出す（不足理由が分かる）', () => {
    expect(FORM).toContain('未入力またはエラーの項目があります')
    // handleSubmit の validate 失敗分岐で submit 要約をセットしている。
    expect(FORM).toMatch(/if \(!validate\(\)\) \{[\s\S]*submit: prev\.submit \|\|/)
  })
  it('API 失敗時の honest error（保存失敗）と /verify への遷移は維持', () => {
    expect(FORM).toContain('情報の保存に失敗しました')
    expect(FORM).toContain('/interview/${slug}/verify')
  })
  it('二重 submit 防止（submitting）と captcha 検証は維持（無効化しない）', () => {
    expect(FORM).toContain('setSubmitting(true)')
    expect(FORM).toContain('TURNSTILE_SITE_KEY && !captchaToken') // captcha を弱めない
  })
  it('API のエラーメッセージを honest に表示（captcha 失敗を「保存失敗」で覆い隠さない）', () => {
    // json.error.message を優先表示し、無い場合のみ汎用文言に fallback。
    expect(FORM).toContain("json?.error?.message || '情報の保存に失敗しました")
  })
})

describe('性別: 男性 / 女性 の 2 択（その他 は撤去）', () => {
  // 性別 InputField ブロックだけを抜き出して検証（EDUCATION_OPTIONS の その他 と混同しない）。
  const start = FORM.indexOf('label="性別"')
  const genderBlock = FORM.slice(start, FORM.indexOf('</InputField>', start))
  it('男性・女性 の選択肢がある', () => {
    expect(start).toBeGreaterThan(0)
    expect(genderBlock).toContain("{ value: 'male', label: '男性' }")
    expect(genderBlock).toContain("{ value: 'female', label: '女性' }")
  })
  it('その他（other）は性別の選択肢から撤去されている', () => {
    expect(genderBlock).not.toContain("value: 'other'")
    expect(genderBlock).not.toContain('その他')
  })
})
