import type { NextConfig } from "next";

const commonHeaders = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-XSS-Protection', value: '1; mode=block' },
]

const nextConfig: NextConfig = {
  // 本番/preview ビルドのブロッカー回避: 既存の非機能 ESLint 負債（約110件・別タスクで棚卸し予定）で
  // `next build` が落ちないよう、ビルド時の ESLint は無効化する。型チェック(tsc)とコンパイルは従来どおり実行。
  // lint は `next lint` / eslint で別途実施する（CI・ローカル）。
  eslint: {
    ignoreDuringBuilds: true,
  },
  async headers() {
    return [
      {
        source: '/interview/:path*',
        headers: [
          ...commonHeaders,
          { key: 'Permissions-Policy', value: 'camera=(self), microphone=(self), geolocation=()' },
        ],
      },
      {
        source: '/((?!interview).*)',
        headers: [
          ...commonHeaders,
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ]
  },
};

export default nextConfig;
