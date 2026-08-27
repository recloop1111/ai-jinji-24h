# AI面接官 キャラクター仕様（Interviewer Character Specification）

本書は AI面接官の**人格・表現の仕様（SoT）**を固定する。**最終 voice 選定・最終顔画像の確定・OpenAI 接続は行わない**
（それらは R1 の実音声を聞いた後）。P7 の会話挙動 SoT（`lib/interview/conversation-policy.ts`）と矛盾しない。

## 方針（確定）: 全企業共通の 1 キャラクターに統一
- AIMEN24 は**企業ごとにキャラクター/声/話し方をカスタムしない**。**全企業共通の「AIMEN24 標準AI面接官」1 体**に統一する（ブランド統一・管理/テスト工数削減・不具合切り分け容易化のため）。
- 企業ごとに変わるのは **company name / logo / job・questions・interview content** のみ。面接官そのもの（表示名・画像・基本 persona・基本トーン・基本 voice 方針）は共通。
- **企業別のキャラクター設定 UI / 声設定 UI / 話し方設定 UI は不要**（運営管理画面の企業「アバター設定」タブは廃止済み）。
- **共通 SoT（グローバル資産・唯一の入口）= `lib/interview/interviewer-identity.ts`（`AI_INTERVIEWER`）**。表示名・**3 状態画像パス**・voice 方針・短い説明を集約。ここ 1 箇所を変えれば全画面に反映される。
- **voice**: 実 Realtime voice は共通（`REALTIME_VOICE`）。企業別 voice 選択は廃止（未配線だった `avatar_config.voice` も UI から除去）。

## 正式キャラクター（視覚状態写像・現行は Lower-Face Overlay 方式）
> **注記（更新）: 旧「静止画 3 状態（neutral/speaking/listening の全身写真切替）」は廃止。** 現行の正式方式は
> **neutral 固定 base ＋ Lower-Face Overlay**（下記 Task 13）。旧 `ai-interviewer-speaking.webp` / `-listening.webp` は
> リポジトリから削除済み（listening は neutral を使い、speaking は neutral base ＋ 口 overlay で表現するため不要）。
> 以下の「状態写像」は**視覚状態の判定ロジック**として現行も有効（画像そのものの切替ではなく overlay の on/off に用いる）。
- **状態写像（唯一の権威）= `lib/interview/interviewer-visual.ts`**:
  - `interviewerVisualForPhase(phase)`: presence の `speaking`→speaking / `listening`→listening / それ以外→neutral。
  - `resolveInterviewerVisual({aiSpeaking, applicantListening})`: **優先順位 = speaking > listening > neutral**（AI 発話中に listening にならない）。
  - 描画写像 = `interviewerFrameSrc`（base: blink>neutral・非 speaking は必ず neutral）＋ `interviewerOverlaySrc`（speaking のみ overlay）。
- **画面反映**: session（`InterviewerAvatar` が phase→visualState→base＋overlay を選択）/ practice（既定 neutral）。session の realtime は
  turn ベースで speaking/listening を近似切替（精緻なタイミングは R1 で確認）。mock は presence driver が speaking/listening/thinking を駆動
  → API なしで 3 状態（＋breathing/nod/blink）を確認可能（remote audio が無いので口 overlay は動かない＝正常。実 LipSync は R1）。
- **画像差し替え = 1 箇所**: `public/images/interviewer/` のファイル置換、または `AI_INTERVIEWER.images` / `.lowerFaceOverlays` の path 変更。
- **animation 境界**: 現行は **neutral base ＋ Lower-Face overlay ＋ breathing/nod/blink**（下記 Task 13）。動画 avatar / Live2D / 顔変形（full-frame）/
  生成 AI リアルタイム表情 / 手振り生成 / 音素 Viseme は**未実装（別 scope・将来 R1 後に判断）**。

## AIMEN24 標準AI面接官（後で画像生成/voice選定に使える Character Spec）
- 役割: AIMEN24 の**標準AI面接官**（全企業共通）。応募者を評価するが評価内容は本人に伝えない。
- 印象: 清潔感・信頼感・中立性・**威圧感なし**。
- 目的: 応募者が**安心して受けられる**面接体験。
- 表情: 自然・穏やか・**過剰に笑いすぎない**。
- 服装: 面接官として違和感のない清潔な服装（ビジネス寄り）。
- 背景: ノイズ少なめ・面接 UI に馴染む。
- 話し方: 丁寧・簡潔・中立・**感情過多にしない**。
- 口調: 敬語・押しつけない・**過度にフレンドリーにしない**。
- AI であること: **人間偽装しない**（UI は「AI面接官」と明示）。
- 汎用性: 特定企業に依らず全企業共通で使える中立デザイン。


## Task 10 — 人格仕様（personality）
| 項目 | 仕様 |
|---|---|
| 役割 | 企業の採用面接官（中立・公平）。応募者を評価するが、評価内容は本人に伝えない。 |
| 推定年齢感 | 30代前後の「落ち着いた社会人」を想起させる程度。年齢を強調せず、年齢を話題にしない。 |
| 性別表現 | 中立寄り。特定の性別役割・性差を強調しない。現行 placeholder は女性画像だが確定ではない（下記 Task 11）。 |
| 服装方向性 | ビジネスカジュアル〜オフィス。清潔感重視。派手さ・露出・制服感を避ける。 |
| 表情 | 穏やかで自然。過剰な笑顔・無表情のどちらも避ける。 |
| 視線 | 正面・自然。凝視や伏し目にしない。 |
| 背景 | 無地〜控えめなオフィス。情報量の多い/生活感のある背景は避ける。 |
| 話し方 | 敬語。簡潔。結論から。前置きを長くしない。 |
| 敬語レベル | 標準的な丁寧語（過度な尊敬/謙譲の多用はしない）。 |
| 話す速度（目標） | ゆっくりめ〜標準。早口にしない（最終調整は R1）。 |
| 相槌頻度 | 控えめ（「はい」「なるほど」等を多用しない）。 |
| 感情表現 | 抑制的。大げさな感嘆・共感の演出をしない。 |
| 中立性 | 応募者を否定も過度に称賛もしない。誘導しない。模範解答を教えない。 |
| 採用担当者らしさ | プロフェッショナル。雑談に流れず面接進行を保つ。 |
| 人間偽装 | 過度に人間のふりをしない。 |
| AI 明示 | **AI面接官であることを隠さない**（UI バッジ「AI面接」＋ 開始時の案内）。 |

> これらは P7 の `INTERVIEW_PRINCIPLES` / `INTERVIEW_TONE` と一致。矛盾する演出（過剰フレンドリー・長い相槌・感情過多）は禁止。

## Task 11 — ビジュアル要件（visual requirements・最終画像は R1 後）
現行の女性 interviewer 画像は **placeholder**。本 PR では新規 AI 画像生成・最終顔決定・asset 差し替えを**行わない**。
最終 Character 制作時の要件のみ固定:
- 正面中心・自然な目線（凝視しない）
- 過剰な笑顔を避ける・穏やかな表情
- 清潔感のある服装（採用担当らしいビジネス寄り）
- 背景ノイズが少ない（無地〜控えめ）
- 人物の切れ方が不自然でない（首元/肩で自然にフレームイン）
- session UI 向け比率（縦長 9:16 固定ではなく、mobile portrait と desktop の両方で中央クロップに耐える）
- mobile / desktop 双方の crop 耐性（顔が端で切れない safe area を確保）
- 1 枚の静止画で「話している/聞いている」を UI 状態（ラベル/アニメ）側で表現できること（画像自体に口パクを要求しない）

## Task 12 — voice-independent 要件（最終 voice は R1 で決定）
特定 OpenAI voice 名は**finalize しない**。voice に依存しない要件のみ:
- 自然な日本語・聞き取りやすい
- 速すぎない/遅すぎない
- 過剰なアニメ声を避ける
- 感情過多を避ける・冷たすぎない
- 面接官として中立
- 長い相槌をしない

## Task 13 — アニメーション境界（Lightweight Realtime Avatar・実装済み）
- **base アセット = 5 枚**（同一人物・同一 pose・1024×1536・WebP 各~55KB・`public/images/interviewer/`）:
  `ai-interviewer-neutral`（口閉じ/目開き・既定）/ `-mouth-small` / `-mouth-medium` / `-mouth-large`（発話・full-frame 用）/ `-blink`（目閉じ）。
- **overlay アセット = 2 方式 × 3 段階**（透過 WebP・full-canvas 1024×1536・`public/images/interviewer/`・offline 生成／生成 AI 不使用）:
  - mouth-only（従来）: `ai-interviewer-mouth-{small,medium,large}-overlay.webp`（各~16KB・口中心 x0.50 y0.38 の楕円 feather・唇/開口のみ）。
  - **lower-face（採用候補・color-matched）: `ai-interviewer-lowerface-{small,medium,large}-overlay.webp`（各~18KB）**。
    「人中〜顎・口角外側少し・下頬最小限」の下顔面 ROI（楕円 feather）を neutral へ並進登録し、ROI 内 skin を
    **Lab/mean-std 統計で neutral へ color-match**（口＝唇/歯/口腔は補正対象外＝保持）。口だけでなく顎/口角/下頬の動きを取り込む。
- **有効（追加アセット不要・原価 0）**:
  - 呼吸 breathing（全状態・ごく僅か）／listening 頷き nod（随時・機械的でない）／瞬き blink（randomized・短い・稀にダブル）。
  - reduced-motion で breathing/nod/blink を無効化。
- **口パク = overlay 方式を採用（`AVATAR_OVERLAY_LIPSYNC_ENABLED=true`・既定 ON）。overlay の種類は `AVATAR_LIPSYNC_MODE` で切替**
  （`'lowerface'`（既定・採用候補）/ `'mouth'`。Human QA 後に正式確定するための feature flag）:
  full-frame swap（顔全体差替）ではなく「**neutral 固定 base ＋ 下顔面/口領域の透過 overlay**」を重ねる。base は常に neutral
  （目/髪/鼻上部/顔上半分/肩/背景は不動＝顔全体モーフが起きない）。speaking かつ mouthState=small/medium/large のときだけ、
  有効 mode の overlay を base と同 object-cover/object-position で絶対座標に重ねる（画素一致＝位置合わせ不要）。breathing/nod は
  base+overlay を含む **wrapper に適用**＝下顔面が顔に対してズレない。
  - synthetic 定量 QA（neutral vs rendered lower-face）: **ROI 外の顔＝画素差 0**（目/髪/鼻/額は完全固定）／**lower-face skin ΔE≈1.3–1.6**
    （知覚困難＝肌色安定）／**口 region は state ごとに |Δ| 9→18→23 と明確変化**／feather 帯 |Δ|≈3–5（seam なし）。
    3 方式比較（full-frame / mouth-only / lower-face）で **lower-face が最良**（顎/口角が自然に動き「同一人物が話している」印象）＝判定 A。
- **full-frame 口パクは不採用・既定 OFF（`AVATAR_FULLFRAME_LIPSYNC_ENABLED=false`）— synthetic visual QA の判定 C を反映**:
  base 5 枚は independently-generated で、フレーム間で**頭部/髪/視線/表情が口より大きくドリフト**する（可視顔域で
  非口(額/目/髪)≈口帯の約 3 倍変化）。full-frame swap すると「口」より「顔全体がモーフ」して見えるため不採用。
  **audio-analyzer / mouthState / interviewerFrameSrc のロジックは温存**（フラグ ON で full-frame 実験へ復帰可）。
  - ロジック SoT = `lib/interview/avatar/`（audio-analyzer / avatar-motion / avatar-config）＋描画写像 = `interviewerFrameSrc`
    （base）／ `interviewerOverlaySrc`（mode 追従 overlay）。QA 比較用に `interviewerMouthOverlaySrc` / `interviewerLowerFaceOverlaySrc`
    （mode 明示 helper）も提供。生成スクリプト = `scripts/avatar/generate-{mouth,lowerface}-overlays.mjs`（再実行で同一出力）。
- **描画（v2）**: wrapper（breathing/nod/head 微動）＞ base neutral ＞ 口 overlay（speaking の small/中/大）＞ **独立 Eye Layer
  overlay（eyesClosedOverlay・瞬き）**。base は常に neutral（v2 では base を blink 差替しない）。口と目は独立 overlay＝
  **speaking 中でも mouth=open ＋ eyes=closed を同時成立**（「口だけ動いて目が固定」を構造的に解消）。
  setState は「離散変化時のみ」（~20fps 間引き・GPU 合成 transform）。
- **独立 Eye Layer**: `ai-interviewer-eyes-closed-overlay.webp`（透過・neutral vs blink の目領域を offline 登録＋楕円 feather・
  生成 AI 不使用・`scripts/avatar/generate-eyes-overlay.mjs`）。blink scheduler は全状態で許可（speaking blink 復活）。
- **Synthetic Avatar Driver v2（demo 限定・音声なし QA）**: v1 は mouthState を 110–240ms で直接ランダム＝「パパパ」高速・機械的。
  v2 は **synthetic speech energy envelope（phrase/pause モデル）→ 本番 actual と同じ smoothLevel→mouthStateForLevel** へ通す
  （`synthetic-lipsync.ts`）。small/medium 中心・large 稀・pause で closed・可視最小保持で保持時間を長く。head 微動は speaking の
  phrase 境界で稀に（一定周期にしない）。**demo=synthetic envelope / actual=real audio envelope で mouth mapping/smoothing を共有**
  ＝demo を「実 Realtime 接続後に近い見た目」へ寄せる。ただし **actual 完全再現ではない**（threshold/smoothing/hold は R1 で実音声を聞いて再調整しうる）。
- **禁止（本 scope 外）**: 音素完全一致 viseme / 動画 avatar / Live2D / Wav2Lip server / 外部 Talking Avatar API /
  リアルタイム表情生成 / 手振り生成。すべてブラウザ内処理のみ・**1 面接あたり追加外部 API 原価 0**。
- **fallback（HARD）**: AudioContext/Analyser 不可・Safari 制約・権限問題・remote stream 無し・overlay load 失敗・barge-in・
  AI 音声停止でも、**neutral base ＋ blink ＋ breathing ＋ listening nod** へ安全退避（口 overlay を出さない）。アバター障害で面接本体を止めない。

## 正式仕様の境界（今回入れないもの・将来 R1 後に判断）
- **口形は音量連動の 4 段階（closed / small / medium / large）のみ**。O/E/A 等の**音素 Viseme は今回入れない**（現状は audio 音量連動
  LipSync＝音素解析なし）。R1 で実音声と合わせ評価し、必要なら将来 audio-driven Viseme へアップグレード。
- **追加の手振り（gesture）animation は今回入れない**。まず Lower-Face ＋ blink ＋ breathing ＋ nod を実音声と合わせて評価するため。
  旧 speaking/listening 全身画像を**手振り目的で full-frame 切替しない**。R1 後に「身体が静止しすぎる」と Human QA で判断した場合のみ、
  別 Phase で gesture layer / short motion を検討する。

## R1 acceptance（Lower-Face Avatar・実 Realtime 接続時に確認）
1. AI 音声開始 → 口パク開始（極端な遅延なし）。
2. AI 音声停止 → 口 closed（overlay 消える）。
3. small / medium / large が自然（段階が滑らか）。
4. 肌色変化なし（overlay ON/OFF で下顔面の肌色が変わって見えない）。
5. seam なし（overlay 楕円境界が頬/顎/人中で見えない）。
6. 顔全体モーフなし（目/髪/鼻上部/額が動かない）。
7. audio と口の遅延が不自然でない。
8. noise で mouth jitter しない（noise floor + smoothing）。
9. barge-in で口が即停止。
10. listening への遷移が自然（口 closed・nod）。
11. blink 自然（固定周期でない）。
12. breathing 自然（ほぼ気付かない程度）。
13. listening nod が時々・自然。
14. iPhone Safari で重くならない・電池を過剰消費しない。
15. **audio latency/品質を悪化させない**。
- R1 で違和感があった場合、次 Phase で: mouth threshold 調整 / smoothing 調整 / Viseme 検討 / 手振り(gesture)検討（今回は先行実装しない）。
- animation 障害でも面接継続（neutral base ＋ blink ＋ breathing ＋ nod fallback）。

## R1 acceptance（Avatar・実接続時に確認）
- AI 音声開始と口の開始が自然（極端な遅延なし）／音声停止・barge-in で口が即閉じる。
- lip movement が激しすぎない・noise で口が jitter しない（noise floor + smoothing）。
- blink 自然（固定周期でない）／breathing がほぼ気付かない程度／listening nod が時々・自然。
- iPhone Safari で重くならない・電池を過剰消費しない・**audio latency/品質を悪化させない**。
- animation 障害でも面接継続（静止 3 状態 fallback）。
