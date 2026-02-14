'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import InterviewLayout from '@/components/interview/InterviewLayout'
import {
  StepIndicator,
  PrimaryButton,
  TextLink,
  InputField,
  TextInput,
} from '@/components/interview/FormComponents'

const STEP_LABELS = ['同意', '情報入力', 'SMS認証', '環境確認', '面接']

export default function VerifyPage() {
  const params = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()
  const slug = params.slug as string
  const phoneFromUrl = searchParams.get('phone') || ''

  const [phone, setPhone] = useState('')
  const isPhoneFromForm = !!phoneFromUrl

  useEffect(() => {
    if (phoneFromUrl) {
      setPhone(phoneFromUrl)
    }
  }, [phoneFromUrl])
  const [codeSent, setCodeSent] = useState(false)
  const [otpCode, setOtpCode] = useState('')
  const [countdown, setCountdown] = useState(60)
  const [sending, setSending] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (codeSent && countdown > 0) {
      const timer = setTimeout(() => {
        setCountdown(countdown - 1)
      }, 1000)
      return () => clearTimeout(timer)
    }
  }, [codeSent, countdown])

  function handleSendCode() {
    setError('')
    const cleaned = phone.replace(/[-\s]/g, '')
    if (cleaned.length < 10) {
      setError('電話番号を正しく入力してください')
      return
    }

    setSending(true)
    setTimeout(() => {
      setCodeSent(true)
      setCountdown(60)
      setSending(false)
    }, 1000)
  }

  function handleOtpCodeChange(value: string) {
    // 数字以外の文字を除去
    const digitsOnly = value.replace(/\D/g, '')
    setOtpCode(digitsOnly)
    setError('')
  }

  function handleVerify() {
    if (otpCode.length !== 6) {
      setError('認証コードが正しくありません。')
      return
    }

    setVerifying(true)
    setTimeout(() => {
      sessionStorage.setItem('interview_phone', phone)
      router.push(`/interview/${slug}/prepare`)
    }, 1000)
  }

  function handleResend() {
    setCodeSent(false)
    setOtpCode('')
    setCountdown(60)
    setError('')
  }

  return (
    <InterviewLayout maxWidth="sm">
      <div className="mb-6">
        <StepIndicator currentStep={3} totalSteps={5} labels={STEP_LABELS} />
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 sm:p-8 [&_input]:text-gray-900 [&_input]:placeholder:text-gray-400 [&_label]:text-gray-700 [&_label]:font-medium">
        <div className="flex flex-col items-center mb-6">
          <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mb-4">
            <svg
              className="w-8 h-8 text-blue-600"
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2 text-center">
            電話番号の認証
          </h1>
          <p className="text-sm text-gray-600 text-center">
            本人確認のため、携帯電話番号を入力してください
          </p>
        </div>

        {!codeSent ? (
          <div className="space-y-4">
            <InputField label="電話番号" required error={error}>
              <TextInput
                type="tel"
                value={phone}
                onChange={setPhone}
                placeholder="09012345678"
                disabled={isPhoneFromForm}
              />
            </InputField>

            <PrimaryButton onClick={handleSendCode} loading={sending}>
              認証コードを送信
            </PrimaryButton>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="bg-green-50 border border-green-200 rounded-lg p-3">
              <p className="text-sm text-green-700">
                {phone}に認証コードを送信しました
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                認証コード（6桁）
              </label>
              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={otpCode}
                onChange={(e) => handleOtpCodeChange(e.target.value)}
                placeholder="000000"
                className="w-full py-3 px-4 border-2 border-gray-300 rounded-lg text-2xl text-center font-bold tracking-[1em] text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
              />
              {error && (
                <p className="mt-2 text-sm text-red-500">{error}</p>
              )}
            </div>

            {verifying ? (
              <button
                type="button"
                disabled
                className="w-full py-3 px-6 rounded-lg font-bold text-white text-sm shadow-sm bg-gray-300 cursor-not-allowed"
              >
                <span className="flex items-center justify-center gap-2">
                  <svg
                    className="animate-spin h-4 w-4 text-white"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                  認証中...
                </span>
              </button>
            ) : (
              <PrimaryButton
                onClick={handleVerify}
                disabled={otpCode.length !== 6}
              >
                認証して次へ
              </PrimaryButton>
            )}

            <div className="text-center">
              {countdown > 0 ? (
                <p className="text-sm text-gray-500">
                  {countdown}秒後に再送信できます
                </p>
              ) : (
                <TextLink onClick={handleResend}>
                  認証コードを再送信
                </TextLink>
              )}
            </div>
          </div>
        )}

        <div className="flex items-center justify-between mt-6 pt-6 border-t border-gray-200">
          <TextLink
            onClick={() => {
              if (window.confirm('面接をキャンセルしますか？')) {
                router.push(`/interview/${slug}/cancelled`)
              }
            }}
          >
            面接をキャンセルする
          </TextLink>
          <a
            href="mailto:recloop.1111@gmail.com"
            className="text-xs text-gray-400 hover:text-gray-600 underline transition-colors"
          >
            面接を受けられない場合はこちら
          </a>
        </div>
      </div>
    </InterviewLayout>
  )
}
