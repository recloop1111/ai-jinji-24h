// PR-3B: Transcript 取り込みエンドポイントのフィーチャーフラグ（既定 OFF）。
// 信頼できる Transcript ソース（#19 server relay で server-side に受信）が未実装の間、
// ブラウザからの Transcript 保存経路は既定で無効にして事故（誤有効化 / 改ざん投稿）を防ぐ。
// realtime の OPENAI_REALTIME_ENABLED と同じ「env === 'true' のときだけ有効」パターン。
export function isTranscriptIngestEnabled(): boolean {
  return process.env.TRANSCRIPT_INGEST_ENABLED === 'true'
}
