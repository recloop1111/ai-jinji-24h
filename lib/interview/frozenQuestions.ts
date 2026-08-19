// 追加P2（Codex）: Realtime 面接の設問一貫性。
// questions_snapshot（interviews）を「凍結済みの単一の真実」として扱うための純関数。
// - /questions と realtime-call は、既に凍結済みなら必ずその snapshot を使い、未凍結のときだけ
//   assemble して write-once（IS NULL 条件付きUPDATE）で凍結する。
// - これにより、面接開始後に管理者が求人/共通設問を編集しても、面接中の設問（応募者が見る/記録/
//   AI が尋ねる）はすべて凍結時点で固定され一貫する。
// - snapshot はサーバ（service-role）だけが書く（クライアント /snapshot 経路は撤去）＝改竄不可で信頼できる。

// snapshot が「有効な凍結値（非空配列）」かどうか。false のときだけ呼び出し側が assemble+freeze する。
export function needsFreeze(snapshot: unknown): boolean {
  return !(Array.isArray(snapshot) && snapshot.length > 0)
}
