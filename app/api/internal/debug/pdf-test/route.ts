import { type NextRequest } from 'next/server'
import { timingSafeEqual } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import PDFDocument from 'pdfkit'

// pdfkit は Node の streams/fs に依存するため Node runtime を明示（Edge 不可）。
export const runtime = 'nodejs'

// pdfkit + 日本語フォント（IPAex Gothic）が Vercel の Node route で
// 正常に PDF Buffer を返せるかを検証するための内部 PoC ルート。
// 認証: INTERNAL_BATCH_SECRET の Bearer（未設定は fail-closed）。secret はログ/レスポンスに出さない。
// 本番の請求書 invoice API は別実装（このルートは検証専用・本番前に削除予定）。

function bearerOk(authHeader: string, secret: string | undefined): boolean {
  if (!secret) return false // 未設定は fail-closed
  const expected = `Bearer ${secret}`
  const a = Buffer.from(authHeader)
  const b = Buffer.from(expected)
  // 長さ不一致で timingSafeEqual が投げるため先に長さ比較
  return a.length === b.length && timingSafeEqual(a, b)
}

function buildPdf(): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      // pdfkit の標準フォント(.afm)を一切読まないよう font:'' で生成し（serverless での
      // .afm 同梱漏れ対策）、直後に日本語 TTF を登録して常に埋め込みフォントで描画する。
      const doc = new PDFDocument({ size: 'A4', margin: 50, font: '' })
      const fontPath = path.join(process.cwd(), 'assets', 'fonts', 'IPAexGothic.ttf')
      const fontBuffer = readFileSync(fontPath)
      doc.registerFont('jp', fontBuffer)
      doc.font('jp')

      const chunks: Buffer[] = []
      doc.on('data', (c: Buffer) => chunks.push(c))
      doc.on('end', () => resolve(Buffer.concat(chunks)))
      doc.on('error', reject)

      doc.fontSize(20).text('請求書PDF 生成テスト（日本語）', { align: 'left' })
      doc.moveDown(0.5)
      doc.fontSize(12).text('これは pdfkit + IPAexGothic の文字化け検証用 PoC です。')
      doc.end()
    } catch (err) {
      reject(err)
    }
  })
}

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization') ?? ''
    if (!bearerOk(authHeader, process.env.INTERNAL_BATCH_SECRET)) {
      return new Response(JSON.stringify({ error: { code: 'UNAUTHORIZED', message: '認証に失敗しました' } }), {
        status: 401,
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
      })
    }

    const pdf = await buildPdf()

    return new Response(new Uint8Array(pdf), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'attachment; filename="pdf-test.pdf"',
        'Cache-Control': 'no-store',
      },
    })
  } catch {
    return new Response(JSON.stringify({ error: { code: 'INTERNAL_ERROR', message: 'PDF生成に失敗しました' } }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    })
  }
}
