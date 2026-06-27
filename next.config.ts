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
  // pdfkit を webpack バンドルから外し、内部の .afm メトリクスを node_modules から
  // 実行時 require させる（serverless で .afm が同梱漏れし fs エラーになる既知問題の対策）。
  serverExternalPackages: ['pdfkit'],
  // serverless function に日本語フォント(TTF)を確実に同梱する（outputFileTracing が
  // 静的アセットを辿らないため明示）。請求書PDF生成の client/admin invoice ルートが対象。
  outputFileTracingIncludes: {
    '/api/client/billing/[billing_record_id]/invoice': ['./assets/fonts/IPAexGothic.ttf'],
    '/api/admin/billing/records/[billing_record_id]/invoice': ['./assets/fonts/IPAexGothic.ttf'],
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
