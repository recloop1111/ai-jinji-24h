// Phase I-2: 面接官アバターの「phase → 見た目バリアント」写像（純粋関数・UI非依存＝単体テスト可能）。
// 実際の Tailwind クラス/キーフレームは components/interview/InterviewerAvatar.tsx が semantic 値から解決する。
// 状態ソースは PR I-1 の InterviewPhase 一本（Realtime 非依存）。

import type { InterviewPhase } from './presence'

// リングのモーション種別。reduced-motion 時は CSS 側で停止（意味はラベル＋形で担保）。
export type AvatarMotion =
  | 'none' // 静止（ending 等・活動状態に見せない）
  | 'breathing' // idle: ごく弱い呼吸
  | 'speaking' // speaking: リング pulse
  | 'listening' // listening: 傾聴リング
  | 'thinking' // thinking: 思考リング
  | 'connecting' // connecting: 控えめな接続表示

// アバター下のインジケータ（装飾・aria-hidden）。形で状態を区別できるようにする（色だけに依存しない）。
export type AvatarIndicator =
  | 'none'
  | 'waveform' // speaking: 音声バー（イコライザ風）
  | 'listening' // listening: マイク/傾聴の波
  | 'dots' // thinking: … ドット

// リング/ラベルの色トーン（色は補助。意味はラベルテキストと形で担保）。
export type AvatarTone = 'slate' | 'blue' | 'green' | 'indigo'

export type AvatarVariant = {
  motion: AvatarMotion
  indicator: AvatarIndicator
  tone: AvatarTone
  active: boolean // 活動中（speaking/listening/thinking）＝リングを強調
}

export function avatarVariantForPhase(phase: InterviewPhase): AvatarVariant {
  switch (phase) {
    case 'connecting':
      return { motion: 'connecting', indicator: 'none', tone: 'slate', active: false }
    case 'idle':
      return { motion: 'breathing', indicator: 'none', tone: 'blue', active: false }
    case 'speaking':
      return { motion: 'speaking', indicator: 'waveform', tone: 'blue', active: true }
    case 'listening':
      return { motion: 'listening', indicator: 'listening', tone: 'green', active: true }
    case 'thinking':
      return { motion: 'thinking', indicator: 'dots', tone: 'indigo', active: true }
    case 'ending':
      return { motion: 'none', indicator: 'none', tone: 'slate', active: false }
  }
}
