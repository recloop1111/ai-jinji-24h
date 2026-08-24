#!/usr/bin/env node
// P2（Phase B 発見）: local 開発を「ai-jinji-24h-local Supabase 専用」に固定して起動する。
//   - Production Supabase には絶対に接続しない（NEXT_PUBLIC_SUPABASE_URL を local に強制上書き）。
//   - 別プロジェクト store-growth-os(port 54321/54322) にも接続しない（ai-jinji の 54421 に固定）。
//   - anon/service_role key は `supabase status` から local-only の値を取得（repo に secret を置かない）。
//   - フィーチャーゲートは既定 OFF（Phase smoke 時のみ各自 process env で ON）。
// 使い方: `npx supabase start` の後に `npm run dev:local`。

import { execSync, spawn } from 'node:child_process'

const AIJINJI_LOCAL_URL = 'http://127.0.0.1:54421' // ai-jinji-24h-local API（54322=store-growth-os は使わない）

let statusEnv = ''
try {
  statusEnv = execSync('npx --yes supabase@latest status -o env', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
} catch {
  console.error('[dev:local] local Supabase が起動していません。先に `npx supabase start` を実行してください。')
  process.exit(1)
}
const pick = (key) => {
  const m = statusEnv.match(new RegExp('^' + key + '="?([^"\\n]+)"?', 'm'))
  return m ? m[1] : ''
}
const apiUrl = pick('API_URL')
const anon = pick('ANON_KEY')
const service = pick('SERVICE_ROLE_KEY')

// safety: supabase status の API_URL が local でなければ中断（誤環境防止）。
if (!/^https?:\/\/(127\.0\.0\.1|localhost)/.test(apiUrl)) {
  console.error('[dev:local] supabase status の API_URL が local ではありません。中断します。')
  process.exit(1)
}
if (!anon || !service) {
  console.error('[dev:local] local の ANON_KEY / SERVICE_ROLE_KEY を取得できませんでした。')
  process.exit(1)
}

const env = {
  ...process.env,
  NODE_ENV: 'development',
  // Production ではなく ai-jinji local に強制固定（.env.local の Production 値を上書き）。
  NEXT_PUBLIC_SUPABASE_URL: AIJINJI_LOCAL_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: anon,
  SUPABASE_SERVICE_ROLE_KEY: service,
  // local synthetic 用の token 秘密鍵（Production 値を local smoke に使わない）。
  INTERVIEW_TOKEN_SECRET: process.env.INTERVIEW_TOKEN_SECRET || 'local-dev-token-secret-change-me-0123456789abcdef',
  // ゲートは既定 OFF（各 Phase で必要時のみ ON）。
  TRANSCRIPT_INGEST_ENABLED: process.env.TRANSCRIPT_INGEST_ENABLED || 'false',
  OPENAI_REALTIME_ENABLED: process.env.OPENAI_REALTIME_ENABLED || 'false',
  OPENAI_EVALUATION_ENABLED: process.env.OPENAI_EVALUATION_ENABLED || 'false',
}

console.log('[dev:local] Supabase = ai-jinji-24h-local (' + AIJINJI_LOCAL_URL + ') / gates OFF / secrets not committed')
const port = process.env.PORT || '3000'
const child = spawn('npx', ['next', 'dev', '-p', port], { stdio: 'inherit', env })
child.on('exit', (code) => process.exit(code ?? 0))
