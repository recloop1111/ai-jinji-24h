-- ============================================================================
-- p8_otp_state.sql
--   Phase P8: 通常企業 SMS(OTP) 認証の状態を interviews に持たせる（additive・1列）。
--     otp_state jsonb … lib/interview/sms/otp.ts の OtpState を保存。
--       { interviewId,codeHash,expiresAtMs,verifyAttempts,resendCount,sendCount,lastSentAtMs,status,version }。
--       plaintext の OTP / 電話番号は保存しない（codeHash のみ・非可逆）。PII を持たない。
--
--   なぜ新列か（既存列で代替できない理由）:
--     * OTP は「送信→照合」がリクエストを跨ぐため cross-request state が要る。
--     * 既存 otp_locks は死蔵（コード参照ゼロ・shape 不明）で再利用しない。
--     * applicants.phone_number は生の電話番号で、OTP 進行（試行/再送/期限）を表せない。
--   → interview 単位の 1 列（nullable jsonb）が最小。既存挙動は非変更（NULL 既定）。P7.1 interview_progress と同型。
--
--   ※ 手動SQL・Production 未適用（別承認）。additive・可逆。writer は service-role のみ。
--   ※ 楽観ロック: writer は (otp_state->>'version')::int を compare-and-set（並行送信/照合の二重進行を防ぐ）。
--   ※ 実 SMS 送信は本 PR では行わない（provider gate SMS_PROVIDER_ENABLED=default OFF）。
-- ============================================================================
SET lock_timeout = '3s';

BEGIN;

ALTER TABLE public.interviews
  ADD COLUMN IF NOT EXISTS otp_state jsonb;

COMMIT;

RESET lock_timeout;
