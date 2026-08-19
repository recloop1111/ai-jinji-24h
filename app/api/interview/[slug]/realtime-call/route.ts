import { type NextRequest } from 'next/server'
import { apiError, errorJson } from '@/lib/api/response'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { verifyInterviewToken } from '@/lib/interview/capability-token'
import { assembleInterviewQuestions } from '@/lib/interview/assembleQuestions'
import { needsFreeze } from '@/lib/interview/frozenQuestions'
import { REALTIME_CALL_LOCK_TTL_MS, interpretLockClaim } from '@/lib/interview/realtime-call-lock'
import { OPENAI_REALTIME_CALLS_URL, OPENAI_FETCH_TIMEOUT_MS } from '@/lib/config/openai'
import {
  isRealtimeEnabled,
  resolveRealtimeModel,
  resolveRealtimeLanguage,
  isCompanyAllowed,
  buildRealtimeInstructions,
  buildRealtimeSessionConfig,
  computeSafetyIdentifier,
} from '@/lib/openai/realtime'

// 公開面接フロー: AI音声面接（OpenAI Realtime GA・unified interface）の SDP プロキシ。
// ブラウザから offer SDP を受け取り、サーバー側で認可＋session 設定を確定して OpenAI /v1/realtime/calls
// へ multipart/form-data（sdp + session）で送り、answer SDP を application/sdp で返す。
// - OPENAI_API_KEY はサーバー専用。ブラウザには API キーも client_secret も出さない（answer SDP のみ）。
// - session 設定（model/instructions/audio/transcription/turn_detection/tools）は「セッション作成時」に
//   サーバーが確定する。ただし SDP 交換後は browser↔OpenAI の P2P であり、クライアントは接続後に
//   session.update / response.create 等で instructions/tools/tool_choice を変更できる（変更不可は voice/model
//   のみ）。→ 本経路の信頼境界は現行 SDP-proxy 方式では完全には防止できない（Codex P1・既知の限界）。
//   恒久対策は docs/REALTIME_SESSION_TRUST_DESIGN.md のサーバー中継方式で別PR。詳細は lib/openai/realtime.ts の
//   buildRealtimeSessionConfig 上のコメント参照。本番で有効化してはならない（下記フラグを設定しない）。
// - 既定は無効（フラグ!=='true' or キー未設定 → 503・OpenAI 未呼び出し）。demo/test 禁止・allowlist のみ。
// - 音声メディアは WebRTC 確立後 browser↔OpenAI の P2P（自社は SDP 交換の初期化のみ）。
export const runtime = 'nodejs'

const MAX_SDP_LEN = 100_000 // offer SDP の上限（数KB想定・暴走入力防止）

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params
    const body = await request.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return apiError('VALIDATION_ERROR', 'リクエストボディが不正です')
    }

    // 1) フィーチャーフラグ（既定 OFF）。無効なら OpenAI を一切呼ばず 503。
    if (!isRealtimeEnabled()) {
      return errorJson('REALTIME_DISABLED', 'AI音声面接は現在無効です', 503)
    }
    // 2) APIキー未設定は fail-closed（呼び出さない）。キーはレスポンス/ログに出さない。
    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) {
      return errorJson('REALTIME_DISABLED', 'AI音声面接は現在利用できません', 503)
    }

    // 3) capability token（署名/exp）＋ slug / applicant_id の一致
    const payload = verifyInterviewToken(typeof body.token === 'string' ? body.token : null)
    if (!payload) return apiError('UNAUTHORIZED', 'トークンが無効です')
    if (payload.slug !== slug) return apiError('UNAUTHORIZED', 'トークンが一致しません')
    const applicantId = typeof body.applicant_id === 'string' ? body.applicant_id : ''
    if (!applicantId || applicantId !== payload.applicant_id) {
      return apiError('UNAUTHORIZED', 'applicant_id が一致しません')
    }
    const interviewId = typeof body.interview_id === 'string' ? body.interview_id : ''
    if (!interviewId) return apiError('VALIDATION_ERROR', 'interview_id は必須です')

    // 4) offer SDP（クライアント生成）。session 設定には使わない（media negotiation のみ）。
    const offerSdp = typeof body.sdp === 'string' ? body.sdp : ''
    if (!offerSdp || offerSdp.length > MAX_SDP_LEN) {
      return apiError('VALIDATION_ERROR', 'SDP が不正です')
    }

    const supabase = createServiceRoleClient()

    // 5) slug → 企業特定（停止中は不可）。is_demo も取得（ガード用）。
    const { data: company, error: compError } = await supabase
      .from('companies')
      .select('id, is_suspended, is_demo')
      .eq('interview_slug', slug)
      .single()
    if (compError || !company) return apiError('NOT_FOUND', '無効な面接URLです')
    if (company.is_suspended) return apiError('FORBIDDEN', '現在、面接の受付を停止しています')

    // 6) demo/test 禁止 ＋ allowlist（設定時のみ限定）。誤って有料APIを呼ばないための多層ガード。
    if (!isCompanyAllowed(company)) {
      return errorJson('REALTIME_DISABLED_FOR_DEMO', 'この企業ではAI音声面接を利用できません', 403)
    }

    // 7) applicant 実在＆当該企業所属（質問導出に job_id / employment_type / industry_experience も取得）
    const { data: applicant, error: appError } = await supabase
      .from('applicants')
      .select('id, company_id, job_id, employment_type, industry_experience')
      .eq('id', applicantId)
      .single()
    if (appError || !applicant) return apiError('NOT_FOUND', '応募者が見つかりません')
    if (applicant.company_id !== company.id) return apiError('FORBIDDEN', '不正なリクエストです')

    // 8) interview 実在＆applicant 一致＆in_progress のみ（凍結済み設問 questions_snapshot も取得）
    const { data: interview, error: ivError } = await supabase
      .from('interviews')
      .select('id, applicant_id, status, questions_snapshot')
      .eq('id', interviewId)
      .single()
    if (ivError || !interview) return apiError('NOT_FOUND', '面接が見つかりません')
    if (interview.applicant_id !== applicantId) return apiError('FORBIDDEN', '不正なリクエストです')
    if (interview.status !== 'in_progress') return apiError('CONFLICT', 'この面接は進行中ではありません')

    // 8.5) P1-2（Codex）: 同一 interview への realtime-call 並列/連打で有料 OpenAI 呼び出しが
    //   多重化するのを防ぐ。OpenAI fetch の前に interviews 行へ短時間TTLロックを原子的にクレーム
    //   （単一 conditional UPDATE ... RETURNING。serverless インスタンス跨ぎでも DB 行ロックで実効）。
    //   - acquired（1行）: 続行。TTL で自動失効＝正常な再接続は失効後に許可（永久禁止にしない）。
    //   - contended（0行）: 別セッションが保持中 → 409（呼び出し側はモックへフォールバック）。
    //   - error（DB書き込み失敗）: 追加P1（Codex）fail-closed。取得が確定しない限り有料呼び出しへ進めない
    //     （列は本番適用済みのため以前の failopen は撤回）→ 503（呼び出し側はモックへフォールバック）。
    const nowIso = new Date().toISOString()
    const lockUntilIso = new Date(Date.now() + REALTIME_CALL_LOCK_TTL_MS).toISOString()
    const claim = await supabase
      .from('interviews')
      .update({ realtime_call_locked_until: lockUntilIso })
      .eq('id', interviewId)
      .eq('status', 'in_progress')
      .or(`realtime_call_locked_until.is.null,realtime_call_locked_until.lt.${nowIso}`)
      .select('id')
    const lockOutcome = interpretLockClaim(claim.data, claim.error)
    if (lockOutcome === 'contended') {
      return errorJson('REALTIME_CALL_IN_PROGRESS', '別の面接セッションが進行中です', 409)
    }
    if (lockOutcome === 'error') {
      // ロック取得が確定しない（DB障害）→ fail-closed。有料呼び出しには進まない。
      return errorJson('REALTIME_LOCK_ERROR', 'AI音声面接の初期化に失敗しました', 503)
    }

    // 追加P2（Codex）: クレーム後・確立前の失敗（OpenAI timeout/reject/空SDP・snapshot準備失敗・例外）で
    //   ロックを保持したまま抜けると、実セッション不在でも同一面接の再試行が最大65分 409 になり mock 強制。
    //   → 確立できなかった全経路（return/throw）でロックを解放し、成功時のみ保持する（成功時解放は /end）。
    let realtimeEstablished = false
    try {
    // 9) 追加P2（Codex）: 設問は「凍結済み questions_snapshot」を単一の真実として使う（/questions と同じ
    //   write-once 凍結）。既に凍結済みならそれを使い（面接開始後に管理者が求人/共通設問を編集しても、
    //   AI が尋ねる設問＝応募者が見た設問＝記録された設問 で一貫）、未凍結のときだけサーバ側で assemble し、
    //   条件付きUPDATE（status='in_progress' かつ questions_snapshot IS NULL）で原子的に凍結してから使う。
    //   snapshot はサーバ(service-role)だけが書く（client /snapshot 経路は撤去済み）＝改竄不可で信頼できる。
    let frozenQuestions: unknown = interview.questions_snapshot
    if (needsFreeze(frozenQuestions)) {
      const assembled = await assembleInterviewQuestions(supabase, company.id, applicant)
      if (!assembled.ok) {
        if (assembled.kind === 'limit_exceeded') {
          return apiError('QUESTION_LIMIT_EXCEEDED', 'この求人・区分の質問数が上限を超えています')
        }
        if (assembled.kind === 'job_not_found') return apiError('NOT_FOUND', '求人が見つかりません')
        if (assembled.kind === 'forbidden') return apiError('FORBIDDEN', '不正なリクエストです')
        return apiError('INTERNAL_ERROR', '質問の取得に失敗しました')
      }
      // 当該 pattern に質問未設定（空）＝AI音声面接の対象外 → 409（呼び出し側はモックへフォールバック）。
      if (assembled.questions.length === 0) {
        return errorJson('SNAPSHOT_NOT_READY', '面接質問がまだ準備できていません', 409)
      }
      // write-once で原子的に凍結（/questions と同一の条件付きUPDATE）。
      // 追加P2（Codex）: 凍結レースに負けた場合の一貫性。読み取り〜UPDATE の間に /questions（や管理者編集を
      //   挟んだ凍結）が先に「別内容で」凍結すると、この UPDATE は 0行になる。その場合に自分の assemble 版を
      //   使うと UI/記録（勝った版）と Realtime（負けた版）が食い違う。→ 1行返れば自分が凍結した版、
      //   0行なら「勝った現在の snapshot」を再読して採用する。
      // 追加P2（Codex）: fail-closed。権威（DB 確定）の snapshot が取れない限り、未確認のローカル版を
      //   OpenAI に送らない。1行返れば自分が凍結した版。0行（レース敗北/既凍結/並行終了）なら再読し、
      //   status=in_progress かつ非空 snapshot のときだけ採用。error/status不整合/空/再読不能は拒否する。
      const { data: frozenRows, error: freezeError } = await supabase
        .from('interviews')
        .update({ questions_snapshot: assembled.questions })
        .eq('id', interviewId)
        .eq('status', 'in_progress')
        .is('questions_snapshot', null)
        .select('questions_snapshot')
      if (freezeError) {
        return errorJson('REALTIME_SNAPSHOT_ERROR', 'AI音声面接の初期化に失敗しました', 503)
      }
      if (
        frozenRows &&
        frozenRows.length > 0 &&
        Array.isArray(frozenRows[0].questions_snapshot) &&
        frozenRows[0].questions_snapshot.length > 0
      ) {
        frozenQuestions = frozenRows[0].questions_snapshot // 自分が凍結した（レースに勝った）
      } else {
        // レースに負けた/既に凍結済み/並行終了 → 権威 snapshot を再読して確認する。
        const { data: current, error: rereadError } = await supabase
          .from('interviews')
          .select('questions_snapshot, status')
          .eq('id', interviewId)
          .single()
        if (rereadError || !current) {
          return errorJson('REALTIME_SNAPSHOT_ERROR', 'AI音声面接の初期化に失敗しました', 503)
        }
        if (current.status !== 'in_progress') {
          // セットアップ中に面接が終了/取消 → 有料 call を作らない。
          return apiError('CONFLICT', 'この面接は進行中ではありません')
        }
        if (!Array.isArray(current.questions_snapshot) || current.questions_snapshot.length === 0) {
          // 権威 snapshot が無い → ローカル版で代替せず拒否（呼び出し側はモックへ）。
          return errorJson('SNAPSHOT_NOT_READY', '面接質問がまだ準備できていません', 409)
        }
        frozenQuestions = current.questions_snapshot
      }
    }
    // 応募者が session UI で選んだ言語で面接する（許可コード以外/未指定は 'ja'）。
    const language = resolveRealtimeLanguage(body.language)
    const instructions = buildRealtimeInstructions(frozenQuestions, { language })
    if (!instructions) {
      return errorJson('SNAPSHOT_NOT_READY', '面接質問がまだ準備できていません', 409)
    }

    // 10) サーバー確定の session 設定＋offer SDP を OpenAI /v1/realtime/calls へ（multipart/form-data）。
    //     Content-Type（boundary）は fetch が自動付与するため手動指定しない。timeout・no-store。
    const model = resolveRealtimeModel()
    const sessionConfig = buildRealtimeSessionConfig({ model, instructions })
    const form = new FormData()
    form.append('sdp', offerSdp)
    form.append('session', JSON.stringify(sessionConfig))

    // 追加P1（Codex）: timeout はヘッダ受信時ではなく answer SDP の body 読み取り（oaRes.text()）完了まで
    //   有効に保つ。OpenAI がヘッダ後に body を stall させても、route/upstream が外部プラットフォーム
    //   timeout まで生き残らないよう、同一 controller で body 読み取り中も abort できるようにする
    //   （ブラウザ側の abort はこの別 fetch には伝播しないため、ここで独立して打ち切る）。
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), OPENAI_FETCH_TIMEOUT_MS)
    // 追加P2（Codex）: クライアント切断（request.signal・React cleanup/navigation で POST が abort）を
    //   upstream OpenAI fetch へ伝播する。切断時は fetch が abort されて 502 で抜け、外側 try/finally が
    //   ロックを解放する（破棄された試行が有料 call 生成/65分ロック占有に進むのを防ぐ）。
    const onClientAbort = () => controller.abort()
    if (request.signal) {
      if (request.signal.aborted) controller.abort()
      else request.signal.addEventListener('abort', onClientAbort, { once: true })
    }
    let oaRes: Response
    try {
      oaRes = await fetch(OPENAI_REALTIME_CALLS_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          // 濫用検知用の安定・不可逆ID（生の applicant_id/interview_id は出さない）。
          'OpenAI-Safety-Identifier': computeSafetyIdentifier(applicantId),
        },
        body: form,
        signal: controller.signal,
        cache: 'no-store',
      })
    } catch {
      // timeout（ヘッダ待ち）/通信障害。OpenAI の詳細・キーは出さない。
      clearTimeout(timer)
      return errorJson('REALTIME_UPSTREAM_ERROR', 'AI音声面接の初期化に失敗しました', 502)
    }
    if (!oaRes.ok) {
      clearTimeout(timer)
      return errorJson('REALTIME_UPSTREAM_ERROR', 'AI音声面接の初期化に失敗しました', 502)
    }

    // 成功時は answer SDP を application/sdp（text body）で返す。JSON では包まない。
    // timer はまだ動かしたまま body を読む（ヘッダは来たが body が stall するケースを timeout で打ち切る）。
    let answerSdp: string
    try {
      answerSdp = await oaRes.text()
    } catch {
      // body 読み取り中の abort（timeout）/中断。
      clearTimeout(timer)
      return errorJson('REALTIME_UPSTREAM_ERROR', 'AI音声面接の初期化に失敗しました', 502)
    }
    clearTimeout(timer)
    if (!answerSdp) {
      return errorJson('REALTIME_UPSTREAM_ERROR', 'AI音声面接の初期化に失敗しました', 502)
    }
    // ここまで来たら call は確立（answer SDP 取得）＝ロックは保持し、/end で解放する。
    realtimeEstablished = true
    return new Response(answerSdp, {
      status: 200,
      headers: { 'Content-Type': 'application/sdp', 'Cache-Control': 'no-store' },
    })
    } finally {
      // 確立できなかった全経路（error return / 例外）でロックを解放し、即再試行を許可する（best-effort）。
      if (!realtimeEstablished) {
        try {
          await supabase.from('interviews').update({ realtime_call_locked_until: null }).eq('id', interviewId)
        } catch {
          /* noop: 解放失敗は TTL(65分) で自然回復 */
        }
      }
    }
  } catch {
    return apiError('INTERNAL_ERROR')
  }
}
