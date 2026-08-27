import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { canProceedToInterview } from './prepare-gate'

// 正式仕様: カメラ・マイクともに必須。進行条件を純ロジックで固定＋ソースから旧「カメラ任意」を排除。

describe('canProceedToInterview: カメラ・マイク必須のゲート', () => {
  it('1. camera ok + mic ok + micTestPassed → 進行可', () => {
    expect(canProceedToInterview({ micStatus: 'ok', cameraStatus: 'ok', micTestPassed: true })).toBe(true)
  })
  it('2. camera error + mic ok + micTestPassed → 進行不可（マイクだけ正常では進めない）', () => {
    expect(canProceedToInterview({ micStatus: 'ok', cameraStatus: 'error', micTestPassed: true })).toBe(false)
  })
  it('3. camera ok + mic ok + micTestPassed=false → 進行不可（マイクテスト未完了）', () => {
    expect(canProceedToInterview({ micStatus: 'ok', cameraStatus: 'ok', micTestPassed: false })).toBe(false)
  })
  it('4. audio-only（mic ok / camera error）で micTestPassed でも進行しない', () => {
    // video+audio 失敗→audio確立でマイクテストが通っても、camera が ok でない限り進めない。
    expect(canProceedToInterview({ micStatus: 'ok', cameraStatus: 'error', micTestPassed: true })).toBe(false)
    expect(canProceedToInterview({ micStatus: 'ok', cameraStatus: 'loading', micTestPassed: true })).toBe(false)
  })
  it('5. camera retry 成功後（camera ok）＋ micTestPassed 済み → 進行可', () => {
    expect(canProceedToInterview({ micStatus: 'ok', cameraStatus: 'ok', micTestPassed: true })).toBe(true)
  })
  it('camera だけ ok で mic error は不可', () => {
    expect(canProceedToInterview({ micStatus: 'error', cameraStatus: 'ok', micTestPassed: false })).toBe(false)
  })
})

describe('prepare/page.tsx: 旧「カメラ任意」を排除し必須 UI にする', () => {
  const PAGE = readFileSync(join(process.cwd(), 'app/interview/[slug]/prepare/page.tsx'), 'utf8')

  it('6. 「カメラは任意」「カメラなしでも面接を続けられます」「カメラなしで…進む」が残っていない', () => {
    expect(PAGE).not.toContain('カメラは任意')
    expect(PAGE).not.toContain('カメラなしでも面接を続けられます')
    expect(PAGE).not.toContain('カメラなしで面接練習へ進む')
    expect(PAGE).not.toContain('なくても面接を続けられます')
    expect(PAGE).not.toContain('カメラを使う場合は')
    expect(PAGE).not.toContain('カメラ なし（任意）')
  })
  it('7. 「顔全体が映るようにしてください」を表示', () => {
    expect(PAGE).toContain('顔全体が映るようにしてください')
  })
  it('進行ゲートは canProceedToInterview（camera 必須）を使用', () => {
    expect(PAGE).toContain('canProceedToInterview')
    expect(PAGE).toContain("cameraStatus")
  })
})
