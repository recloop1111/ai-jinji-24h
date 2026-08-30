# Zero-Cost 2D Rig + Viseme Avatar — Technical Spike（実装ではない・判断用）

> **結論（先出し）: C（費用対効果が悪く見送り）／ ただし将来の条件付き再検討は B。**
> 現行 **Lower-Face Overlay のまま R1 へ進むことを推奨**。2D Rig / Viseme は R1 の実音声 Human QA で
> 「amplitude 口パクが明確に不十分」と判定された場合のみ、**方式C（local-audio formant viseme）＋実写Viseme口形アセット**で再検討する。
> 本 spike は Production コードを一切変更しない。ローカル QA prototype は `public/_avatar-qa/`（gitignore 済・dev only）。

- spike branch: `spike/avatar-2d-rig-viseme`（main HEAD `eca47f5` から派生・main merge しない）
- ローカル prototype: `public/_avatar-qa/rig-prototype.html`（`http://localhost:3000/_avatar-qa/rig-prototype.html`・gitignore 済＝Production 非出力）

---

## 0. 現行 Avatar 再利用可能部分（STEP1 監査）
| 要素 | 現状 | 2D Rig でも再利用 |
|---|---|---|
| `InterviewerAvatar.tsx`（base+overlay 合成・wrapper transform） | 有 | ◎ そのまま拡張点 |
| Audio Analyzer（`audio-analyzer.ts`: MediaStream→AnalyserNode→RMS→level→state） | 有 | ◎ Viseme driver の入口を差し替えるだけ |
| breathing / blink / listening nod（`avatar-motion.ts` + CSS） | 有 | ◎ 完全再利用 |
| Synthetic Driver（`synthetic-lipsync.ts`・demo QA） | 有 | ◎ 擬似 Viseme 供給に流用可 |
| mouthState 4 段階（closed/small/medium/large） | 有 | ○ amplitude としては再利用可（Viseme とは別軸） |
| fail-safe（neutral+blink+breathing+nod） | 有 | ◎ そのまま |
| 実写 base/overlay 資産（neutral/blink/lowerface×3/mouth×3） | 有 | △ **Viseme 口形（あ/い/う/え/お）は不在** |

→ **driver・motion・fail-safe・合成器はすべて再利用可能。不足は「実写 Viseme 口形アセット」だけ。これが本件の律速。**

---

## 1. 最重要の技術的事実（写実キャラ × 2D Rig）
本アバターは**アニメ絵ではなく写実的な実在人物写真**。ここが判断の核心。

1. **2D 幾何リグは「開いた口」を生成できない。** transform（jaw 回転/scaleY/頬伸ばし）は既存画素を移動/伸縮するだけで、
   **口腔内部（歯・舌・暗部）を新規に作れない**。spike 実測（neutral の下顔面を scaleY×1.08〜1.16 で jaw 開口を模擬）では、
   **口は閉じたまま顎だけが伸びて顔が長くなる＝発話に見えない・不自然**（`_avatar-qa/rig-jaw-x1{08,16}.png`）。
   → 「喋る口」には**実写の口形フレーム**が必須。これは現行 Lower-Face が既に採用している方式そのもの。
2. **写実写真への幾何変形は uncanny を増やす。** 頬・唇・顎の非剛体変形は写真の陰影/質感と整合せず伸びて見える。
   アニメのセル絵なら破綻しないが、実写では x1.08 でも下顔面の間延びが視認できる。
3. **現行 Lower-Face Overlay は「実写画素＋color-match＋楕円feather」＝“良い 2D Rig”の到達点**（実写口形を使い、
   幾何変形を避けている）。amplitude 4 段階は粗いが**自然さは既に高い**（定量 QA: ROI 外 画素差0 / skin ΔE≈1.5 / 口Δ 9→18→23）。

---

## 2. 3 方式比較（STEP2）
### 方式A: 2D Rig + 音量ベース（Viseme なし）
- 既存 closed/small/medium/large ＋ jaw/head/cheek を CSS transform で別レイヤー制御。
- **評価**: 口形は現行と同じ実写4段階のまま。追加されるのは「顎/頭の微動」だが、写実では幾何変形が uncanny 化しやすく、
  自然さの上積みは小さい（頭の微揺れは既に breathing/nod で表現済み）。**現行との差が小さい**。
- 追加アセット: ほぼ不要。原価0。工数小。**が改善も小＝やる価値が薄い**。

### 方式B: 2D Rig + Transcript 近似 Viseme
- Realtime の transcript(text) から日本語かな/音節を推定し A/I/U/E/O へ変換。
- **同期精度の厳格評価**: gpt-realtime の text デルタは**音声波形と音素単位で時刻同期していない**（TTS 側の per-viseme
  timestamp は提供されない）。text は音声とほぼ並行して届くが「どの口形がいつ」を波形に合わせられない＝**ズレ/ドリフトが不可避**。
  「文字列があるから同期は簡単」とは判断しない。→ **同期は近似どまり。実用にはリスク**。
- さらに Viseme 口形の**実写アセットが必要**（下記 §3）。**条件付き**。

### 方式C: 2D Rig + Local Audio Viseme（外部APIなし）
- remote AI audio をブラウザ内解析 → 母音推定 → Viseme。**外部API 0**。
- 現実的な実装: **フォルマント解析（F1/F2）**。Web Audio + 軽量 DSP（自己相関/LPC or FFT ピーク）で F1/F2 を推定し、
  日本語母音空間（あ:F1高 / い:F1低F2高 / う:F1低F2低 / え:中 / お:F1中F2低）へ写像。**ONNX 音素モデルは bundle/mobile 負荷が重く不採用寄り**。
  フォルマントは軽量で「あいうえお」の粗い判別は可能（子音/破裂は弱いが Viseme では closed で吸収）。
- **評価**: driver は 0 円で実装可能な最有力。**ただし Viseme 口形の実写アセットが必須**（§3）＋mobile CPU 増。**driver は解けるがアセットが律速**。

---

## 3. 日本語 Viseme とアセット（STEP3/4/7）
- **推奨 Viseme 数 = 6**: `closed / あ / い / う / え / お`（＋任意で `ん・M/B/P`＝closed 系に統合可）。
  20〜30 は過剰。写実では細分しても質感差の方が目立ち改善しない。**最小口形数で自然さ最大化**が正。
- **必要な追加実写アセット（本実装時・人手制作 or 人が用意。Claude は生成しない）**:
  | filename | 変える部分 | 一致必須 |
  |---|---|---|
  | `ai-interviewer-vis-a-overlay.webp`（あ・大きく開く） | 口/顎/下唇のみ | 頭/目/鼻上部/髪/背景/顔位置/口位置が neutral と完全一致 |
  | `ai-interviewer-vis-i-overlay.webp`（い・横に引く） | 同上 | 同上 |
  | `ai-interviewer-vis-u-overlay.webp`（う・すぼめる） | 同上 | 同上 |
  | `ai-interviewer-vis-e-overlay.webp`（え・中） | 同上 | 同上 |
  | `ai-interviewer-vis-o-overlay.webp`（お・丸め開く） | 同上 | 同上 |
  | （closed は既存 neutral を流用） | — | — |
  - 各 透過WebP・1024×1536 full-canvas・~18KB 目標・**同一人物/同一 pose/同一ライティング**。
  - **制作難度が高い**: full-frame で失敗した「フレーム間の頭部/視線/肌ドリフト（判定C）」と同じ問題が Viseme でも再発する。
    lower-face の color-match/registration で吸収する前提でも、**口形の“形”を正しく5種類そろえる**のは amplitude 4 枚より難しい。

---

## 4. 2D Rig 構造・renderer（STEP5）
- 推奨は**現行の DOM image overlay 構造を踏襲**（base `<img>` + 透過 overlay `<img>`・wrapper に transform）。
  最小・写実に安全・現行と同一の crop/object-position で位置合わせ不要。
- CSS mask/clip-path・SVG・Canvas2D・WebGL は**不要**（写実写真では層分割より実写差分の方が自然。WebGL 大規模導入は避ける方針とも一致）。
- Viseme を足す場合の差分は「overlay の写像を amplitude→viseme に替える」だけ＝renderer は据え置き。

---

## 5. 素材再利用（STEP8）
| 既存 | 2D Rig 再利用 |
|---|---|
| neutral / blink | ◎ base / 瞬き |
| lowerface small/medium/large | ○ amplitude fallback（Viseme が無い時の退避） |
| mouth small/medium/large（full-frame） | △ 実験用に温存（既定 OFF） |
| 旧 speaking / listening（gitignore 済 source PNG） | △ **将来 gesture layer の素材候補**（今回 gesture 本実装しない）。ただし別 pose のため rig 化は困難 |

---

## 6. Realtime seam / barge-in / latency（STEP13/14）
- **seam**: `audio-analyzer` の `createRemoteAudioAnalyzer(stream)` の後段に **viseme 推定器**を差し込み、出力を
  `mouthState` ではなく `visemeState` として `interviewerOverlaySrc` の写像へ渡すだけ。現行 amplitude と競合させず、
  **mode（amplitude / viseme）で分岐**（feature flag）。remoteStream が実 audio の単一入口なのは不変。
- **barge-in**: 現行と同一（AI audio 停止/`resolveMouthLevel` の silence→closed）で **即 closed→listening** が成立。Viseme でも closed へ倒すだけ。
- **latency 概算**（方式C）: capture(≈0) + 解析窓 20–40ms + フォルマント推定 <5ms + smoothing 50–90ms + render 1 frame ≈
  **合計 ~80–150ms**。人が「口が遅れている」と感じ始めるのは概ね >200ms なので**許容内だが余裕は小**。方式A は解析不要で最小、方式B は
  text 到達タイミング依存で**ズレが読めない（最悪）**。

---

## 7. 性能 / コスト（STEP15/16）
- **iPhone Safari**: 方式C のフォルマント解析は AnalyserNode+軽量 DSP で概ね可だが、20–60 分面接での常時解析は**CPU/発熱/電池**が
  amplitude(RMS のみ)より重い。**Avatar のために Realtime 音声品質を悪化させない**制約と衝突しうる（要実機検証）。
- **bundle/model**: フォルマントは JS/軽量 WASM で数十KB 追加で可。**ONNX 音素モデルは数 MB＋mobile 推論負荷で不採用寄り**（CDN帯域も増）。
- **1 面接あたり追加 API 原価**: 方式A/B/C いずれも**0 円**（全てブラウザ内・外部Avatar/lip-sync API 不使用）。
  → コスト面は 3 方式とも 0 円で並ぶ＝**差別化要因はコストではなく「自然さの上積み」と「工数/リスク」**。

---

## 8. 工数内訳（STEP17・Claude Code ベース）
| 項目 | 方式A | 方式B | 方式C |
|---|---|---|---|
| driver/logic spike | 0.5d | 1d | 2–3d（フォルマント DSP＋母音写像＋検証） |
| **実写 Viseme アセット制作**（人手・Claude不可） | 0 | 5–6枚 | 5–6枚 |
| renderer 拡張（overlay 写像＋flag） | 0.5d | 0.5d | 0.5d |
| viseme driver 実装 | – | 1d | 1.5d |
| mobile QA（iPhone 実機・発熱/電池/latency） | 0.5d | 1d | 1.5–2d |
| R1 integration seam | 0.5d | 1d | 1d |
| fallback/tests | 0.5d | 1d | 1–1.5d |
| **計（アセット制作を除く Claude 作業）** | **~2–3d** | **~5–6d** | **~8–10d** |
- 方式B/C は上記に加え**実写口形5–6枚の人手制作＋整合（drift対策）**が前段に必要（見た目品質の律速・失敗すると判定C相当）。

---

## 9. Lower-Face との比較（STEP18）
| 軸 | 現行 Lower-Face | 2D Rig+Viseme（方式C） |
|---|---|---|
| 自然さ | 高（実写口形・color-match・seam無） | 理論上やや上だが**写実では上積み不確実・uncanny リスク** |
| 追加API原価 | 0 | 0 |
| 実装工数 | 完了済 | +8–10d（Claude）＋人手アセット |
| 故障リスク | 低（実装済・fallback有） | 中（DSP/mobile/アセット整合） |
| mobile 性能 | 良（RMS のみ） | 悪化方向（常時フォルマント解析） |
| 保守性 | 高 | 低下（driver＋アセット増） |
| 質問自由度 | ◎（内容非依存） | ◎（audio 由来なら非依存） |
| Realtime latency | 良 | 80–150ms（許容内・余裕小） |
| 将来拡張性 | overlay 写像を差し替え可能＝**将来 Viseme へ拡張する seam は既にある** | — |

→ **現行 Lower-Face は「安い・自然・実装済・低リスク」。Viseme の上積みは写実では不確実で、工数/mobile/アセットの代償が大きい。**

---

## 10. Exit Criteria 判定（STEP19）→ 最終 A/B/C
**進む条件**の充足状況:
- 現在より明確に自然 → **未達（不確実）**：実写では幾何リグ uncanny＋Viseme 上積みが amplitude 比で小さい見込み。
- 追加API原価0 → 達成（全方式0）。
- iPhone 実用 → **懸念**：常時フォルマント解析の発熱/電池。
- 工数許容 → **超過気味**：方式C 8–10d＋人手アセット。
- R1 を大幅に遅らせない → **未達**：R1 前に入れると R1 が遅れる。
- fallback 成立 → 達成（Lower-Face を保持）。

**見送り条件**の該当:
- 写実人物では uncanny／アセット制作過大／local phoneme が重い／mobile 負荷高い／**Lower-Face との差が小さい** → **複数該当**。

### 最終判定
- **方式A = C（見送り）**：改善が小さすぎる。
- **方式B = C 寄りの条件付き**：transcript 同期が近似どまりでリスク大。
- **方式C = B（条件付きあり）だが“今は C（見送り）”**：driver は 0 円で作れるが、**実写Viseme口形アセット（人手・drift リスク）**と
  **mobile 常時解析コスト**が律速で、**Lower-Face 比の商品価値の上積みが不確実**。R1 を遅らせてまで先行する価値は現時点で乏しい。

---

## 11. 推奨アクション
1. **R1（実 Realtime 音声）は現行 Lower-Face のまま進める。** amplitude 口パクの実音声での見え方を Human QA する。
2. R1 QA で「口パクが明確に不自然/不十分」と判断された場合に限り、**方式C（local formant viseme）＋実写Viseme口形6枚**を再スパイク。
   その際も geometric 幾何リグ（顎伸ばし）は採用しない（uncanny）。
3. renderer は既に `interviewerOverlaySrc` の mode 写像で **Viseme へ拡張できる seam** を持つ（今回の spike で確認）。将来拡張は非破壊で可能。

（禁止事項遵守: main merge / Production deploy / env / DB / SQL / #67 / R1-B / OpenAI・Realtime・SMS actual / gate / allowlist は一切なし。）
