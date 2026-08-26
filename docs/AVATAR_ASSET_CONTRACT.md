# Lightweight Realtime Avatar — 追加アセット仕様（人間側で用意）

本 PR（`feature/lightweight-realtime-avatar`）は **追加アセット不要の部分**（Audio Analyzer / Motion Controller /
呼吸 breathing / 頷き nod / fallback / config SoT）を実装済み。**自然な口パク(lip-sync)と瞬き(blink)は同一人物・同一 pose の
差分アセットが必須**（現在の 3 枚は各々「別 pose の全身写真」で、全フレーム高速切替は不自然な“パカパカ”になり不可）。

このため **口パク/瞬きの描画は「必要アセット待ち」**。以下の仕様でアセットを用意いただければ、続き（Analyzer 配線 +
mouth/eye 描画）を最小差分で実装します。**Claude 側でキャラクター画像を生成/加工しません**（顔が変わるため）。

## 最重要制約（全アセット共通）
- **現在の共通 AI 面接官と同一人物・同一顔・同一髪型・同一服装・同一背景・同一ライティング・同一フレーミング**。
- 変えてよいのは **口の開き** と **目の開閉** の**その部分だけ**。他は 1px も動かさない（全フレームで body/hands/hair/背景が同一）。
- **寸法は現行と同一 = 1086 × 1448 px**（縦 3:4）。中心・crop・顔位置を全フレームで完全一致させる（ズレると切替でガタつく）。
- 配信は **WebP**（各 ~50KB 目標・q80 前後）。背景は現行同様「不透明・同一背景」。
- 顔位置が全フレームで一致していること（重ね合わせ前提のため最重要）。

## 方式（どちらか。推奨 = A）
### A. フルフレーム差分（推奨・実装が最も安全）
「同一 pose・mouth/eyes だけ違う」全身フレームを複数用意。現行の `<img src>` 差替と同じ描画で自然に動く。
必要ファイル（`public/images/interviewer/` に配置・命名固定）:

| 用途 | filename | eyes | mouth | 備考 |
|---|---|---|---|---|
| 待機/基準 | `ai-interviewer-neutral.webp`（既存を再利用可・**同一 pose 化**） | open | closed | 既定 |
| 口 小 | `ai-interviewer-mouth-small.webp` | open | 少し開く | speaking low |
| 口 中 | `ai-interviewer-mouth-medium.webp` | open | 中程度 | speaking medium |
| 口 大 | `ai-interviewer-mouth-large.webp` | open | しっかり開く（過大でない） | speaking high |
| 瞬き | `ai-interviewer-blink.webp` | closed | closed | 130ms だけ表示 |

- 合計 **5 枚**（neutral 含む）。listening は neutral（口閉じ）を使用。
- ※ 「発話中の瞬き」を完全再現するには eyes-closed × 各 mouth (計 +3) が必要だが、**まずは上記 5 枚で開始可**
  （発話中の瞬きは頻度が低く、mouth と同時の一瞬なので省略しても自然）。より高品質にするなら後追いで追加。

### B. レイヤー/オーバーレイ（アセット効率は良いが位置合わせが厳密）
単一 base（neutral・eyes open・mouth closed）＋ **透過 PNG/WebP のオーバーレイ**（口領域・目領域）を base に重ねる。

| レイヤー | filename | 透過 | 内容 |
|---|---|---|---|
| base | `ai-interviewer-neutral.webp` | 不透明 | 既存（eyes open / mouth closed） |
| 口 overlay | `overlay-mouth-{small,medium,large}.webp` | **透過必須** | 口領域のみ・base と画素完全一致で重なる位置 |
| 目 overlay | `overlay-eyes-closed.webp` | **透過必須** | 目領域のみ・閉じた目 |

- オーバーレイは base と **同一 1086×1448 キャンバス**（口/目以外は完全透過）＝絶対座標で重なる。position 計算不要。
- 利点: 口と瞬きが独立（発話中の瞬きも自然）・各 overlay は数 KB。欠点: 口/目の描き込みが base と完全に一致している必要。

## 実装済み（本 PR・アセット不要部分）
- `lib/interview/avatar/audio-analyzer.ts`: Realtime remote audio(MediaStream)→AudioContext+Analyser で RMS→mouth level(0..1)。
  外部送信なし。`computeRms`/`energyToMouthLevel`/`smoothLevel`(attack速・release遅)/`mouthStateForLevel`/`resolveMouthLevel`
  (非発話/barge-in/無音→closed の fail-safe)。`createRemoteAudioAnalyzer`（feature-detect・失敗時 null）。
- `lib/interview/avatar/avatar-motion.ts`: blink/nod スケジューラ（randomized interval + 確率＝機械的でない）。
- `lib/interview/avatar/avatar-config.ts`: 全 magic number の SoT。
- `components/interview/InterviewerAvatar.tsx`: **呼吸 breathing（全状態・CSS transform・ごく僅か）** ＋
  **listening 頷き nod（JS 随時スケジュール・whole-body 微動＝顔差分不要）**。reduced-motion で無効化。3 状態切替は維持。

## アセット到着後に実装する残り（別 PR・最小差分）
1. session の `onRemoteStream` MediaStream → `createRemoteAudioAnalyzer` を接続（user gesture で AudioContext resume）。
2. `smoothLevel` を rAF で更新（setState を毎 frame しない・ref + 20fps 間引き）。
3. speaking 時 `resolveMouthLevel`→`mouthStateForLevel`→mouth 画像（A）or overlay（B）を切替。
4. blink スケジューラで eyes-closed（A: blink フレーム / B: eyes overlay）を 130ms 表示。
5. barge-in（session state）＋無音（level=0）で即 mouth closed（両者で fail-safe）。
