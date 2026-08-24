// P2（Phase B 発見）: local development が誤って Production Supabase へ接続する事故を fail-fast で防ぐ。
//
// 方針:
//   - `next dev`（NODE_ENV === 'development'）のときだけ作動する。Vercel の preview/production build
//     （NODE_ENV === 'production'）や vitest（'test'/未設定）には一切影響しない＝Preview/Staging/CI を壊さない。
//   - development で Supabase URL が localhost/127.0.0.1 以外を指していたら throw（起動を拒否）。
//     → 開発者が Production 資格情報入りの .env.local を退避し忘れて `npm run dev` しても、Production DB へは繋がらない。
//   - 将来「dev から remote staging Supabase を使う」正当ケースは ALLOW_REMOTE_SUPABASE_IN_DEV=true で明示 opt-in。
//
// PII/secret: URL 値（project ref を含み得る）は error message に出さない（汎用メッセージのみ）。

function isLocalSupabaseUrl(url: string | undefined): boolean {
  if (typeof url !== 'string' || url.length === 0) return false
  // http(s)://127.0.0.1[:port] / localhost / 0.0.0.0 のみ local とみなす。
  return /^https?:\/\/(127\.0\.0\.1|localhost|0\.0\.0\.0)(:\d+)?(\/|$)/i.test(url)
}

export function assertSupabaseSafeForDev(url: string | undefined): void {
  // 本番 build / preview / test では制約しない（remote Supabase を正当に使う）。
  if (process.env.NODE_ENV !== 'development') return
  // 明示 opt-in（dev から remote staging を使う稀なケース）。
  if (process.env.ALLOW_REMOTE_SUPABASE_IN_DEV === 'true') return
  if (isLocalSupabaseUrl(url)) return
  throw new Error(
    'Supabase env guard: development(next dev) が NON-local な Supabase を指しています。' +
      ' Production 誤接続を防ぐため起動を拒否しました。' +
      ' local Supabase（例 http://127.0.0.1:54421）を NEXT_PUBLIC_SUPABASE_URL に設定するか' +
      '（.env.development.local 推奨）、remote を意図する場合のみ ALLOW_REMOTE_SUPABASE_IN_DEV=true を設定してください。',
  )
}

// テスト/内部利用のため local 判定を公開（値は返さない・boolean のみ）。
export { isLocalSupabaseUrl }
