// ポータル別 Supabase 認証セッションの cookie 名（storageKey）を 1 ファイルに集約。
// 運営(admin)と企業(client)で **完全に別の cookie** を使い、同一ブラウザで同時ログインを可能にする。
//
// - 値は @supabase/ssr の cookieOptions.name（= supabase-js の storageKey）に渡す。
//   実際の cookie 名は `<name>-auth-token`（チャンク時は `.0` 等）になる。
// - 同一 localhost 上の別プロジェクトと衝突しないよう、プロジェクト固有の接頭辞を付ける。
// - 旧 default cookie（`sb-<ref>-auth-token`）とは別名。旧→新の自動コピーはしない（初回のみ再ログイン）。
const PORTAL_COOKIE_PREFIX = 'aijinji24h'

export const ADMIN_AUTH_STORAGE_KEY = `${PORTAL_COOKIE_PREFIX}-admin`
export const CLIENT_AUTH_STORAGE_KEY = `${PORTAL_COOKIE_PREFIX}-client`
