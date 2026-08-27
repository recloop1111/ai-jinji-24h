# AI面接官 キャラクター仕様（Interviewer Character Specification）

本書は AI面接官の**人格・表現の仕様（SoT）**を固定する。**最終 voice 選定・最終顔画像の確定・OpenAI 接続は行わない**
（それらは R1 の実音声を聞いた後）。P7 の会話挙動 SoT（`lib/interview/conversation-policy.ts`）と矛盾しない。

## 方針（確定）: 全企業共通の 1 キャラクターに統一
- AIMEN24 は**企業ごとにキャラクター/声/話し方をカスタムしない**。**全企業共通の「AIMEN24 標準AI面接官」1 体**に統一する（ブランド統一・管理/テスト工数削減・不具合切り分け容易化のため）。
- 企業ごとに変わるのは **company name / logo / job・questions・interview content** のみ。面接官そのもの（表示名・画像・基本 persona・基本トーン・基本 voice 方針）は共通。
- **企業別のキャラクター設定 UI / 声設定 UI / 話し方設定 UI は不要**（運営管理画面の企業「アバター設定」タブは廃止済み）。
- **共通 SoT（グローバル資産・唯一の入口）= `lib/interview/interviewer-identity.ts`（`AI_INTERVIEWER`）**。表示名・**3 状態画像パス**・voice 方針・短い説明を集約。ここ 1 箇所を変えれば全画面に反映される。
- **voice**: 実 Realtime voice は共通（`REALTIME_VOICE`）。企業別 voice 選択は廃止（未配線だった `avatar_config.voice` も UI から除去）。

## 正式キャラクター 3 状態（静止画像切替）
- **正式アセット = 3 枚**（全企業共通・`public/images/interviewer/`・Web 配信は **WebP 最適化**＝同寸法 1086×1448・構図/顔/色不変・各 ~50KB）:
  - `neutral` = `ai-interviewer-neutral.webp` … 待機/接続/処理/再接続/終了/エラー/idle（既定）
  - `speaking` = `ai-interviewer-speaking.webp` … **AI 発話中**
  - `listening` = `ai-interviewer-listening.webp` … **応募者の回答待ち/回答中**
  - **配信最適化**: 元 PNG（各 ~1.7MB）を WebP q82（同寸法・目視上不変）へ変換し各 ~50KB に削減。`InterviewerAvatar` マウント時に 3 枚を preload（`AI_INTERVIEWER_IMAGE_LIST`）してキャッシュへ入れ、切替の network 待ちを排除。img は key を付けず src のみ差替＝白フラッシュ/レイアウトシフトなし。
- **状態写像（唯一の権威）= `lib/interview/interviewer-visual.ts`**:
  - `interviewerVisualForPhase(phase)`: presence の `speaking`→speaking / `listening`→listening / それ以外→neutral。
  - `resolveInterviewerVisual({aiSpeaking, applicantListening})`: **優先順位 = speaking > listening > neutral**（AI 発話中に listening にならない）。
  - 画像取得 = `interviewerImageForState(state)`（未知/エラーは neutral フォールバック）。
- **画面反映**: session（`InterviewerAvatar` が phase→visual→画像を選択）/ practice（既定 neutral）。session の realtime は turn ベースで speaking/listening を近似切替（精緻なタイミングは R1 で確認）。mock は presence driver が speaking/listening/thinking を駆動 → API なしで 3 状態を確認可能。
- **画像差し替え = 1 箇所**: `public/images/interviewer/` のファイル置換、または `AI_INTERVIEWER.images` の path 変更。旧 `public/images/ai-interviewer.jpg` は未参照（削除候補）。
- **animation 境界**: 今回は**静止画 3 状態の切替のみ**。lip sync / 動画 avatar / Live2D / 顔変形 / 生成 AI リアルタイム表情 / 手振り生成は**未実装（別 scope）**。本構造は将来の animation 実装を妨げない（visual state を差し替え点にできる）。

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
- **口 overlay アセット = 3 枚**（透過 WebP・full-canvas 1024×1536・各~16KB・`public/images/interviewer/`）:
  `ai-interviewer-mouth-{small,medium,large}-overlay.webp`。offline で neutral へ登録（生成 AI 不使用・sharp の並進登録）＋
  楕円 feather マスク（唇/開口のみ・矩形の継ぎ目なし。口中心＝顔クロップの diff 重心 x0.50 y0.38）で作成。
- **有効（追加アセット不要・原価 0）**:
  - 呼吸 breathing（全状態・ごく僅か）／listening 頷き nod（随時・機械的でない）／瞬き blink（randomized・短い・稀にダブル）。
  - reduced-motion で breathing/nod/blink を無効化。
- **口パク = overlay 方式を採用（`AVATAR_OVERLAY_LIPSYNC_ENABLED=true`・既定 ON）**:
  full-frame swap（顔全体差替）ではなく「**neutral 固定 base ＋ 口領域だけの透過 overlay**」を重ねる。base は常に neutral
  （目/髪/顔/肩/背景は不動＝顔全体モーフが起きない）。speaking かつ mouthState=small/medium/large のときだけ、対応 overlay を
  base と同 object-cover/object-position で絶対座標に重ねる（画素一致＝位置合わせ不要）。breathing/nod は base+overlay を含む
  **wrapper に適用**＝口が顔に対してズレない。synthetic visual QA（顔クロップ比較）で「目/髪/輪郭は neutral と同一・口だけ自然に
  変化・矩形の継ぎ目なし」を確認（判定 A 相当）。
- **full-frame 口パクは不採用・既定 OFF（`AVATAR_FULLFRAME_LIPSYNC_ENABLED=false`）— synthetic visual QA の判定 C を反映**:
  base 5 枚は independently-generated で、フレーム間で**頭部/髪/視線/表情が口より大きくドリフト**する（可視顔域で
  非口(額/目/髪)≈口帯の約 3 倍変化）。full-frame swap すると「口」より「顔全体がモーフ」して見えるため不採用。
  **audio-analyzer / mouthState / interviewerFrameSrc のロジックは温存**（フラグ ON で full-frame 実験へ復帰可）。
  - ロジック SoT = `lib/interview/avatar/`（audio-analyzer / avatar-motion / avatar-config）＋描画写像 = `interviewerFrameSrc`
    （base）／ `interviewerMouthOverlaySrc`（口 overlay）。
- **描画**: base = blink > neutral（非 speaking は必ず neutral）。口 overlay = speaking かつ small/中/大 のときだけ重ねる
  （closed/未解析/非 speaking は null＝base の口閉じ）。speaking 中は blink 抑制（口開き×目閉じ overlay を持たないため）。
  setState は「離散 mouthState 変化時のみ」＝毎 frame 再 render しない（~20fps 間引き・rAF・GPU 合成 transform）。
- **禁止（本 scope 外）**: 音素完全一致 viseme / 動画 avatar / Live2D / Wav2Lip server / 外部 Talking Avatar API /
  リアルタイム表情生成 / 手振り生成。すべてブラウザ内処理のみ・**1 面接あたり追加外部 API 原価 0**。
- **fallback（HARD）**: AudioContext/Analyser 不可・Safari 制約・権限問題・mock（remote stream 無し）でも、静止 neutral へ安全退避。
  アバター障害で面接本体を止めない。実 audio 連動の体感は R1 で確認。

## R1 acceptance（Avatar・実接続時に確認）
- AI 音声開始と口の開始が自然（極端な遅延なし）／音声停止・barge-in で口が即閉じる。
- lip movement が激しすぎない・noise で口が jitter しない（noise floor + smoothing）。
- blink 自然（固定周期でない）／breathing がほぼ気付かない程度／listening nod が時々・自然。
- iPhone Safari で重くならない・電池を過剰消費しない・**audio latency/品質を悪化させない**。
- animation 障害でも面接継続（静止 3 状態 fallback）。
