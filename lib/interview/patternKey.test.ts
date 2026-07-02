import { describe, it, expect } from 'vitest'
import { derivePatternKey } from './patternKey'

// 5区分モデル: 正社員(fulltime)=新卒/中途経験者/中途未経験、その他=経験者/未経験。
// 新卒区分を持つのは fulltime のみ（contract/temporary は持たない＝branch B）。
describe('derivePatternKey', () => {
  describe('正社員(fulltime) = 3区分', () => {
    it('新卒 → fulltime-new-graduate', () => {
      expect(
        derivePatternKey({
          jobEmploymentType: 'fulltime',
          applicantEmploymentType: 'new_graduate',
          industryExperience: 'inexperienced', // 新卒では無視される
        }),
      ).toBe('fulltime-new-graduate')
    })

    it('中途 × 経験あり → fulltime-mid-career-experienced', () => {
      expect(
        derivePatternKey({
          jobEmploymentType: 'fulltime',
          applicantEmploymentType: 'mid_career',
          industryExperience: 'experienced',
        }),
      ).toBe('fulltime-mid-career-experienced')
    })

    it('中途 × 未経験 → fulltime-mid-career-inexperienced', () => {
      expect(
        derivePatternKey({
          jobEmploymentType: 'fulltime',
          applicantEmploymentType: 'mid_career',
          industryExperience: 'inexperienced',
        }),
      ).toBe('fulltime-mid-career-inexperienced')
    })
  })

  describe('パート(parttime) = 2区分（新卒/中途は無視）', () => {
    it('経験あり → parttime-experienced', () => {
      expect(
        derivePatternKey({
          jobEmploymentType: 'parttime',
          applicantEmploymentType: 'new_graduate', // B では使わない
          industryExperience: 'experienced',
        }),
      ).toBe('parttime-experienced')
    })

    it('未経験 → parttime-inexperienced', () => {
      expect(
        derivePatternKey({
          jobEmploymentType: 'parttime',
          applicantEmploymentType: 'mid_career',
          industryExperience: 'inexperienced',
        }),
      ).toBe('parttime-inexperienced')
    })
  })

  describe('contract / temporary は新卒区分を持たない（fulltime-only 正規化の核心）', () => {
    it('contract × new_graduate でも 新卒キーにならず contract-experienced', () => {
      expect(
        derivePatternKey({
          jobEmploymentType: 'contract',
          applicantEmploymentType: 'new_graduate',
          industryExperience: 'experienced',
        }),
      ).toBe('contract-experienced')
    })

    it('contract × 未経験 → contract-inexperienced', () => {
      expect(
        derivePatternKey({
          jobEmploymentType: 'contract',
          applicantEmploymentType: 'mid_career',
          industryExperience: 'inexperienced',
        }),
      ).toBe('contract-inexperienced')
    })

    it('temporary × new_graduate でも temporary-experienced（新卒キーは生成されない）', () => {
      expect(
        derivePatternKey({
          jobEmploymentType: 'temporary',
          applicantEmploymentType: 'new_graduate',
          industryExperience: 'experienced',
        }),
      ).toBe('temporary-experienced')
    })

    it('新卒キーは fulltime 以外では絶対に生成されない', () => {
      for (const jobET of ['parttime', 'contract', 'temporary', 'freelance', 'intern', 'other']) {
        const key = derivePatternKey({
          jobEmploymentType: jobET,
          applicantEmploymentType: 'new_graduate',
          industryExperience: 'experienced',
        })
        expect(key).not.toContain('new-graduate')
      }
    })
  })

  describe('fallback 既定', () => {
    it('fulltime × applicantEmploymentType=null → 中途扱い（mid-career）', () => {
      expect(
        derivePatternKey({
          jobEmploymentType: 'fulltime',
          applicantEmploymentType: null,
          industryExperience: 'experienced',
        }),
      ).toBe('fulltime-mid-career-experienced')
    })

    it('industryExperience=null → inexperienced 扱い', () => {
      expect(
        derivePatternKey({
          jobEmploymentType: 'fulltime',
          applicantEmploymentType: 'mid_career',
          industryExperience: null,
        }),
      ).toBe('fulltime-mid-career-inexperienced')
    })

    it('jobEmploymentType=null → other 扱い（B・経験有無で2区分）', () => {
      expect(
        derivePatternKey({
          jobEmploymentType: null,
          applicantEmploymentType: 'mid_career',
          industryExperience: 'experienced',
        }),
      ).toBe('other-experienced')
    })

    it('想定外の jobEmploymentType → B（safe fallback）', () => {
      expect(
        derivePatternKey({
          jobEmploymentType: 'unknown_type',
          applicantEmploymentType: 'new_graduate',
          industryExperience: null,
        }),
      ).toBe('unknown_type-inexperienced')
    })
  })
})
