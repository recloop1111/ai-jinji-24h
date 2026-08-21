# Accessibility — AI人事24h

WCAG を意識しつつ、**実際の操作性**を優先。チェック数を増やすためでなく「誰でも迷わず操作できる」ため。
既存ベースライン（監査時）: `focus:ring` は多用されるが `focus-visible` はほぼ未使用、`sr-only` 少、`prefers-reduced-motion` 少。**新規/改修では下記を満たす**。

## キーボード
- すべての操作は**キーボードだけで完結**（Tab 順が視覚順と一致、Enter/Space で作動）。
- カスタム UI（ドロップダウン/モーダル/タブ）は矢印/Esc/Home-End 等の期待動作を実装。
- モーダルは**フォーカストラップ + Escで閉じる + 開いたら内部へフォーカス + 閉じたら起点へ戻す**。

## Focus
- **`focus-visible:ring-2 focus-visible:ring-blue-500`**（+ 必要に応じ `ring-offset-2`）を使う。`outline-none` 単独で消さない。
- キーボード操作時にフォーカスが**必ず見える**こと。低コントラストのリングにしない。

## ARIA / セマンティック
- **セマンティック HTML 優先**（`button`/`a`/`nav`/`ul/ol/li`/`table`/`label`）。`div` にクリックを付けるより `button`。
- 状態: トグルは `aria-pressed`、開閉は `aria-expanded`/`aria-haspopup`、選択タブは `aria-selected`、無効は `disabled`（見た目だけの無効にしない）。
- 装飾アイコンは `aria-hidden`。アイコンのみのボタンは `aria-label` 必須。
- 画像/アバターに適切な `alt`（装飾なら空 alt）。

## スクリーンリーダー
- アイコンのみ UI に**テキスト代替**（`aria-label` or `sr-only`）。
- 動的更新は live region: 通常 `aria-live="polite"`（面接の現在質問・toast）、緊急は `assertive`（重大エラー）。
- 面接の状態（AIが話す/聞く）や残り時間の重要変化を SR にも伝える（視覚のみにしない）。

## コントラスト
- 本文テキストは **AA（4.5:1）** 以上。`text-slate-800/700/600` は白背景で可。**`text-slate-300/400` を本文に使わない**（補助/プレースホルダ止まり）。
- 意味色の文字（`red-600`/`green-600` 等）も白/淡背景で AA を満たす濃さを選ぶ（`-500` より `-600/700` を文字に）。
- 大 CTA の白文字 on `blue-600` は可。淡い背景 on 淡いテキストを避ける。

## 色に依存しない状態表現（本プロダクトの必須ルール）
- **status/成否/選択を色だけで伝えない**。必ず**テキストラベル**（+ 記号/アイコン/形/位置）を併用。
- 例: バッジ=色 + 語、マイク mute=色 + 「ミュート中」+ アイコン + `aria-pressed`、フォームエラー=色 + アイコン + 文言。

## Reduced motion
- **`prefers-reduced-motion: reduce` を尊重**。派手な keyframe（発光/粒子/回転）は `motion-reduce:` か `@media (prefers-reduced-motion: no-preference)` ガードで無効/簡略化。
- 必須のフィードバック（フォーカス/状態変化）は残し、装飾モーションのみ落とす。

## タッチ / モバイル
- **タッチ target ≥ 44×44px**（小さいアイコンボタンは `p-` で拡張）。
- **hover 前提にしない**（重要情報/操作を hover/tooltip だけに置かない）。タップで完結。
- 誤タップ防止（破壊操作を主動線から離す・十分な間隔）。

## フォーム a11y
- すべての入力に**関連付いた `<label htmlFor>`**（placeholder を label 代わりにしない）。
- エラーは `aria-invalid` + `aria-describedby` でメッセージに関連付け。必須は表記 + `required`。
- グループ（radio 群等）は `fieldset`/`legend` か適切な group ロール。

## 言語 / 多言語
- 日本語主体。面接は多言語（ja/en/vi/zh/ne/pt）。`lang` 属性を適切に。
- テキスト折返し（`break-words`）で言語差の長語も崩れない。数字/日付の locale を意識。

## 実装時の最低ライン
- 新規インタラクティブ要素は「キーボードで操作できるか」「フォーカスが見えるか」「SR で意味が分かるか」「色以外でも状態が分かるか」を必ず確認（→ review-checklist.md）。
