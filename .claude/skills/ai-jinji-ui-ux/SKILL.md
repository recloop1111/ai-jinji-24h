---
name: ai-jinji-ui-ux
description: >-
  Product/UX design system for AI人事24h (a Japanese BtoB recruiting SaaS with an AI voice
  interview). Load this whenever creating or modifying any UI in this repo — company admin
  screens (/client, /admin), the applicant AI-interview flow (/interview), auth screens, or
  shared components. It carries the designer-level judgment (visual hierarchy, consistency,
  responsive, a11y, honest UI) plus concrete Tailwind tokens and a mandatory self-review
  checklist. Use it BEFORE writing JSX and again as a review gate before calling UI work done.
---

# AI人事24h — UI/UX Design Skill

You are acting as the **product designer + UX designer + front-end engineer** for AI人事24h.
This skill is the single source of design judgment. Read the relevant sub-file before implementing,
and run `review-checklist.md` before you call any UI change complete.

## What this product is
- **BtoB 採用 SaaS + AI 面接**。二つの、思想の異なる面がある：
  1. **企業管理画面**（`/client/**`, `/admin/**`）— 日本の採用担当者・中小企業担当者が説明なしで使える、洗練された現代的 BtoB SaaS。
  2. **応募者 AI 面接**（`/interview/**`）— 緊張した応募者が「業務システム」を感じず、AI面接官との会話に集中できる体験。
- ユーザーは日本語が主。多言語面接（ja/en/vi/zh/ne/pt）あり。

## Two design minds (never mix them)
| | 企業管理画面 | 応募者 AI 面接 |
|---|---|---|
| 最優先 | 操作の迷わなさ | 安心感 |
| 次点 | 情報の理解速度 → 視認性 → 美しさ → 装飾 | 次に何をすればいいか分かる → 会話への集中 → デバイス状態理解 → 生命感 |
| トーン | プロフェッショナル・信頼・余白・適切な情報密度 | 落ち着き・誘導的・最小限 |
| 参考思想（コピー禁止） | Linear / Stripe / Notion / Vercel の"考え方" | — |
| 禁止 | 過剰グラデ/ネオン/発光、AIっぽさ演出の紫 | 面接中に不要情報を足す、業務システム感 |

## How to use this skill
1. **実装前**: 対象が admin 系なら `admin-ui.md`、面接系なら `interview-ui.md`。どちらでも `design-system.md`（トークン）と `accessibility.md` を参照。
2. **実装中**: `design-system.md` の既存トークンに合わせる。新トークン/UIライブラリを勝手に増やさない（現状は Tailwind 4 + lucide-react + clsx + tailwind-merge のみ）。
3. **完了前（必須ゲート）**: `review-checklist.md` を上から確認。**P0/P1/P2 相当の UI/UX 問題が残るなら「完了」と言わない**。

## Sub-files
- `design-system.md` — カラー/タイポ/spacing/radius/shadow/コンポーネント別トークンと実装規約。
- `admin-ui.md` — 企業・運営管理画面の UX ルール（レイアウト、テーブル、フォーム、status、破壊操作 等）。
- `interview-ui.md` — 応募者 AI 面接専用 UX（マイク/カメラ、質問/進捗、AI状態、切断/再接続、端末別）。
- `accessibility.md` — キーボード/focus/aria/コントラスト/色非依存/reduced-motion/タッチ 等。
- `review-checklist.md` — UI 変更後の必須セルフレビュー（P0/P1/P2 基準）。

## Non-negotiable rules (this project)
- **正直な UI**: ダミーデータを実データのように出さない。存在しない処理を loading 表示しない。未実装機能を操作可能に見せない。（例: Transcript 未接続なら空状態、synthetic を本番に出さない。）
- **色だけで状態を伝えない**（必ずテキスト/アイコン/形も併用）。
- **同じ意味の status は全画面で同じ表現**（`lib/applicants/displayStatus.ts` 等の既存の唯一の真実を再利用）。
- **PII を UI/ログ/URL に漏らさない**（氏名/電話/メール/面接本文）。表示は React 既定エスケープのみ、`dangerouslySetInnerHTML` 禁止。
- **既存を尊重**: 「Skill と違うから」だけで既存画面を全面変更しない。変更は「現状→問題→改善理由→変更」を説明できるものだけ。認可/状態管理/API/responsive/a11y を壊さない。
- **新規 UI ライブラリを安易に入れない**（Radix/MUI/shadcn 等を勝手に導入しない）。

## Project design tokens at a glance（詳細は design-system.md）
- Neutral: **`slate`**（gray と slate が混在＝既存の不統一。新規/改修は `slate` に寄せる）。
- Primary: **`blue-600`**（hover `blue-700`）。ブランドグラデは **blue→indigo**（`from-blue-600 to-indigo-700`）を面接開始等の大 CTA に限定。**purple/violet の"AI 紫"は使わない**。
- Semantic: danger=`red`, success=`emerald/green`, warning=`amber`, info=`blue`。
- 面接画面の背景は `slate-900→slate-800` の落ち着いた暗色（例外的にダーク）。管理画面はライト。
