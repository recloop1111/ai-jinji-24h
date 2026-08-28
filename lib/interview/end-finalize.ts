// 面接終了 /end 応答の分類（純ロジック・fetch/DOM 非依存＝単体テスト可能）。
//   正常完了フローで「/end が成功して completed 確定したか」を判定する。
//   /end は冪等（interview.status!=='in_progress' なら already_finalized=true＋現在 status を返す）。
//   response の final_status を必ず確認し、response ロスト後の retry でも二重保存せず復旧できるようにする。

export type EndFinalizeOutcome =
  | 'completed' // final_status==='completed'（already_finalized 含む）→ 完了として complete へ
  | 'not_completed' // ok だが completed 以外（cancelled 等の terminal）→ 正常完了扱いしない（/ended へ）
  | 'retryable' // 通信失敗 / !res.ok / final_status 欠落 → 終了データ確定失敗（再送信・complete にも /ended にも進めない）

export function classifyEndResponse(input: { ok: boolean; finalStatus: string | null | undefined }): EndFinalizeOutcome {
  if (!input.ok) return 'retryable' // HTTP エラー/通信失敗 → 再送信
  if (input.finalStatus === 'completed') return 'completed'
  // ok かつ final_status が明確に completed 以外 → 正常完了ではない（他経路で cancelled 確定 等）
  if (typeof input.finalStatus === 'string' && input.finalStatus.length > 0) return 'not_completed'
  // ok だが final_status 欠落 → 判定不能。誤って完了扱いにせず再送信させる。
  return 'retryable'
}
