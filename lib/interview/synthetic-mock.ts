// synthetic/mock 面接（AI 実接続なしの疑似進行）を使ってよい条件（純ロジック・UI/DOM 非依存）。
//
// 正式仕様: mock/synthetic 面接を使えるのは **DB 権威 companies.is_demo=true（現在唯一のテスト株式会社）だけ**。
//   本番クライアント企業（is_demo=false）や demo 未確定（null/undefined）では mock へ fallback してはいけない。
//   → 本番企業で Realtime が使えない場合は honest blocking error（mock で completed を作らない・課金しない）。
//
// SoT は「server から取得した DB companies.is_demo」のみ。query param / client cookie / mode /
//   Realtime failure 等で mock 権限を得られない。

export function canUseSyntheticMock(input: { isDemo: boolean | null | undefined }): boolean {
  return input.isDemo === true
}

// Realtime 接続が不能/失敗したときの遷移先。demo は mock、非 demo/未確定は blocking（mock 禁止）。
export function resolveConnectFailureMode(input: { isDemo: boolean | null | undefined }): 'mock' | 'blocking' {
  return canUseSyntheticMock(input) ? 'mock' : 'blocking'
}
