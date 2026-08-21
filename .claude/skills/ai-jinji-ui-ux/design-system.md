# Design System — AI人事24h

Tailwind 4（CSS-first・`app/globals.css` の `@import "tailwindcss"`）。設定ファイルは無い。
追加 UI ライブラリなし（`lucide-react`, `clsx`, `tailwind-merge` のみ）。**新トークン/新ライブラリを勝手に増やさない。**
以下は「既存の de-facto トークン」を整理し、これから守る規約に落としたもの。

> **クラス文字列は「既定値・例」であり逐語コピーの義務ではない。** 守るべきは**トークンの一貫性**
> （色=slate/blue の役割、radius/shadow の段階、ボタン階層、余白リズム、色非依存 status）であって、
> 特定の px やクラスの丸暗記ではない。文脈に合えば `py-2.5` を `py-2` にする等の調整は自由。
> 逆に、**理由なくトークン体系から外れる**（別の neutral 色を持ち込む・radius を役割から外す・意味色を変える）ことをしない。
> 迷ったら「既存の近い画面/コンポーネントに合わせる」を優先する。

## 1. Color system

### Neutral（最重要の統一ポイント）
- **`slate` に統一**する。既存は `gray` と `slate` が混在（不統一）。**新規・改修は `slate`**。既存 `gray` の一括置換はしない（差分は「触る範囲」だけ slate 化）。
- 標準的な役割：
  - 本文 text: `text-slate-800`（強）/`text-slate-600`（標準）/`text-slate-500`（補助）
  - 見出し: `text-slate-900`
  - 罫線/境界: `border-slate-200`（標準）/`border-slate-100`（弱）
  - 面: `bg-white`（カード）/`bg-slate-50`（下地・淡いゾーン）/`bg-slate-100`（chip/hover）
  - プレースホルダ/disabled 文字: `text-slate-400`

### Brand / Primary
- Primary: **`blue-600`** / hover **`blue-700`** / active `blue-800`。リング `focus-visible:ring-blue-500`。
- Accent（淡）: `blue-50`（選択下地）, `blue-100`（badge 下地）, `text-blue-700`（リンク/強調）。
- **ブランドグラデ**（`from-blue-600 to-indigo-700`）は**大きな主要 CTA/ヒーローのみ**（例: 面接開始、練習へ進む）。乱用しない。通常ボタンは単色 `bg-blue-600`。

### Semantic（意味色・必ずテキスト/アイコンも併用）
- Danger/Error: `red-600`（文字/枠 `red-500/200`, 下地 `red-50`）
- Success: `emerald-600`/`green-600`（`green-50`/`green-200`）
- Warning: `amber-500`（`amber-50`/`amber-200`）
- Info/Neutral status: `blue`/`slate`

### 禁止
- 意味のない gradient、**purple/violet の"AI 紫"**（`from-blue-400 to-purple-400` のような装飾）、ネオン/発光、低コントラストの薄すぎる文字（`text-slate-300` を本文に使わない＝補助・アイコン止まり）。

## 2. Typography
- フォント: 既存の system/geist を継承（`body` は sans）。新フォントを追加しない。
- スケール（Tailwind）:
  - ページ見出し: `text-xl`/`text-2xl` + `font-bold text-slate-900`（**巨大タイトルを乱用しない**）
  - セクション見出し: `text-sm font-semibold text-slate-700`
  - 本文: `text-sm`（管理画面の標準）/`text-base`（面接など読ませる所）
  - 補助/キャプション: `text-xs text-slate-500`
- 行間: 読ませるテキストは `leading-relaxed`。数字揃えは `tabular-nums`。
- 太さ: `font-medium`（ラベル/ボタン）/`font-semibold`（見出し/主要ボタン）/`font-bold`（ページ見出しのみ）。多用しない。

## 3. Spacing scale
- Tailwind 標準（4px 基準）。**4 の倍数を基本**（`p-4`, `gap-3`, `space-y-4` 等）。恣意的な `p-[13px]` を作らない。
- カード内: `p-4`（コンパクト）/`p-6`（標準）/`p-8`（空状態など余白重視）。
- 縦リズム: セクション間 `space-y-6`、要素間 `space-y-3`〜`space-y-4`。
- **余白で情報をグルーピング**（枠を足す前に余白で分ける）。

## 4. Layout / grid / container
- 管理画面はサイドバー + メイン（`ClientDashboardShell` / admin layout を再利用）。
- コンテンツ幅: 読み物/フォームは `max-w-lg`〜`max-w-3xl`、一覧/テーブルは全幅寄り。中央寄せは `mx-auto`。
- グリッド: カード群は `grid gap-4 sm:grid-cols-2 lg:grid-cols-3` 等、**情報優先順位で列数を変える**。
- **横スクロール前提にしない**（テーブルは §12 参照）。

## 5. Border / Radius / Shadow
- **Radius スケール（役割で固定・"何でも rounded-xl" 禁止）**:
  - チップ/バッジ/ピル/アバター: `rounded-full`
  - ボタン/input/select: `rounded-lg`（**統一**。現状 lg/xl 混在 → lg に寄せる）
  - カード/パネル/モーダル: `rounded-2xl`
  - 小さなタグ/コード: `rounded-md`
  - `rounded-3xl` は原則使わない（ヒーロー限定）。
- **Border**: 面の分離は原則 `border border-slate-200` か shadow の**どちらか一方**。両方盛らない（"border だらけ" 禁止）。
- **Shadow スケール（役割で固定）**:
  - カード（静的）: `shadow-sm`
  - 浮くパネル/ドロップダウン/ポップオーバー: `shadow-lg`
  - モーダル: `shadow-xl`
  - `shadow-2xl` はほぼ使わない。**過剰 shadow 禁止**。
- **カードの中にカードを乱用しない**（1 階層まで。ネストは余白/罫線で表現）。

## 6. Icon
- **lucide-react のみ**。`className="w-4 h-4"`（標準）/`w-5 h-5`（見出し横）。装飾アイコンは `aria-hidden`。
- **絵文字を業務 UI の主要アイコンにしない**（`✓`/`✗`/`–` 等の記号は色非依存の status 補助としては可）。
- **不要なアイコンを足さない**（意味のあるものだけ）。

## 7. Buttons（階層を固定）
| 階層 | 用途 | クラス（基準） |
|---|---|---|
| Primary | 画面の主目的 1つ | `inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors` |
| Secondary | 補助 | `... border border-slate-200 bg-white text-slate-700 hover:bg-slate-50` |
| Ghost/Tertiary | 低優先 | `... text-slate-600 hover:bg-slate-100`（枠なし） |
| Danger | 破壊操作 | `... bg-red-600 text-white hover:bg-red-700`（**通常操作と視覚分離**・近接配置しない） |
- **Primary は 1 画面に乱立させない**（主目的を 1 つに絞る）。
- **min touch target ≥ 44px**（`min-h-[44px]` か十分な `py`）。モバイルは特に。
- disabled は `opacity-50 + cursor-not-allowed` に加え、**なぜ無効かを近くに明示**（§UX）。

## 8. Inputs / Select / Textarea
- 共通: `w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus-visible:border-blue-500 focus-visible:ring-2 focus-visible:ring-blue-500/40 disabled:bg-slate-50`
- **label 必須**（`placeholder` を label 代わりにしない）。`<label htmlFor>` で関連付け。
- エラー時: `border-red-400 + aria-invalid` ＋ 直下に `text-xs text-red-600`（`aria-describedby` で関連付け）。
- パスワード表示切替は既存 `components/shared/PasswordInput.tsx` を再利用。
- Textarea: `min-h-[96px]`、長文は `whitespace-pre-wrap break-words`。
- Select: ネイティブ `<select>` を基本（新ライブラリ不要）。

## 9. Checkbox / Radio
- ネイティブ + `accent-blue-600`、ラベルはクリック可能領域に含める（`<label>` で包む）。タッチ target 確保。

## 10. Card
- `rounded-2xl bg-white border border-slate-200 shadow-sm p-6`（標準）。見出し `text-sm font-semibold text-slate-700 mb-4`。
- カードは**情報のまとまり 1 つ**。詰め込みすぎたら分割 or セクション見出しで整理。

## 11. Tabs
- 既存パターン（`activeTab` state + `aria-selected`）を踏襲。選択タブは `text-blue-700 border-b-2 border-blue-600`、非選択 `text-slate-500 hover:text-slate-700`。**色 + 下線**（色だけにしない）。

## 12. Table
- ヘッダ: `text-xs font-medium text-slate-500 uppercase tracking-wide`、行区切り `divide-y divide-slate-100`、hover `hover:bg-slate-50`。
- **横スクロールを常態化しない**: モバイルは重要列だけ残し、詳細はカード化 or 展開。列を隠す優先順位を決める。
- 数値は右寄せ + `tabular-nums`。空セルは `—`（`text-slate-400`）。

## 13. Badge / Status（全画面で統一）
- 形: `inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium`。
- **色 + テキストラベル + （必要なら記号）**。色だけ禁止。
- 応募者ステータスは `lib/applicants/displayStatus.ts` の導出を唯一の真実として再利用（面接中/完了/途中離脱/準備中）。独自に色/語を作らない。
- 目安の配色: 成功/完了=`green`, 進行中=`blue`, 中断/途中離脱=`amber`, 不採用/エラー=`red`/`slate`, 準備中=`slate`。

## 14. Dropdown / Popover
- トリガーは button（`aria-haspopup`/`aria-expanded`）。パネル `rounded-lg border border-slate-200 bg-white shadow-lg`。**外クリック/Escで閉じる**（既存 `mousedown` リスナー方式を踏襲）。キーボード操作可能に。

## 15. Modal / Dialog / Confirmation
- オーバーレイ `bg-slate-900/40`、本体 `rounded-2xl bg-white shadow-xl p-6 max-w-md`。
- **フォーカストラップ + Escで閉じる + 開いたら見出しへフォーカス**。
- **確認モーダルを何でも出さない**。可逆な操作はインライン + Undo(toast) を優先。**破壊/不可逆のみ**確認を出し、確認ボタンは Danger、主動線と誤爆しない配置。

## 16. Toast
- 右上 or 下中央、`rounded-lg shadow-lg`、成功=`green`/エラー=`red`/情報=`slate`。数秒で自動消滅 + 手動閉じ。**保存等の結果は必ず toast/インラインで即 feedback**。`aria-live="polite"`（エラーは `assertive`）。

## 17. Tooltip
- 補助情報のみ（**重要情報を tooltip に隠さない**＝hover/touch できない環境で失われる）。`aria-describedby`。モバイルで hover 前提にしない。

## 18. Navigation / Sidebar / Header
- 既存 `ClientDashboardShell` / admin layout を再利用。現在地は**色 + 太さ + （左バー等）**で示す。
- モバイルは折りたたみ（collapse）。ヘッダーに主要導線と現在地。

## 19. Pagination / Search / Filter
- 一覧は件数 + ページャ or 無限スクロールのどちらか一貫。フィルタは適用中を chip で可視化 + クリア導線。検索は空結果に「条件を変える」導線（§Empty）。

## 20. Empty / Loading / Error state
- **Empty**: 何が無いかを正直に述べ、**可能なら次の action** を置く（例: 「まだ求人がありません」＋「求人を作成」）。**ダミー/synthetic を空状態代わりに出さない**。「未接続」を「データがありません」と誤魔化さない。
- **Loading**: スケルトン or スピナー。**レイアウトを大きく跳ねさせない**（高さ確保）。**存在しない処理を loading 表示しない**（虚偽進捗禁止）。
- **Error**: 「何が起きたか + 次に何をすればいいか」。**PII/生 message を出さない**（汎用文言）。再試行導線を置く。

## 21. Responsive（詳細は §admin/interview）
- 想定: 320 / 375–390 / tablet / 13" MacBook / Windows laptop / large desktop。
- **PC UI の単純縮小をしない**。情報優先順位で **stack / hide / collapse** を判断。横スクロール前提にしない。長文は `break-words` + `whitespace-pre-wrap`。

## 22. Animation / Motion
- 目的のある最小限（状態遷移/フィードバック）。`transition-colors`/`transition-transform` 中心、`duration-150〜300`。
- **意味のない animation 禁止**。派手な keyframe（発光/粒子）は面接アバターなど"生命感"が要る箇所に限定。
- **`prefers-reduced-motion` を尊重**（`motion-reduce:` or `@media (prefers-reduced-motion)` で無効化）。
