'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import InterviewLayout from '@/components/interview/InterviewLayout'
import {
  StepIndicator,
  PrimaryButton,
  TextLink,
  InputField,
  TextInput,
} from '@/components/interview/FormComponents'

const STEP_LABELS = ['同意', 'SMS認証', '情報入力', '環境確認', '面接']

export default function VerifyPage() {
  const params = useParams()
  const router = useRouter()
  const slug = params.slug as string

  const [phone, setPhone] = useState('')
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
      setError('認証コードを6桁入力してください')
      return
    }

    setVerifying(true)
    setTimeout(() => {
      sessionStorage.setItem('interview_phone', phone)
      router.push(`/interview/${slug}/form`)
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
        <StepIndicator currentStep={2} totalSteps={5} labels={STEP_LABELS} />
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 sm:p-8">
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
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 mb-2 text-center">
            SMS認証
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
                maxLength={6}
                value={otpCode}
                onChange={(e) => handleOtpCodeChange(e.target.value)}
                placeholder="000000"
                className="w-full py-3 px-4 border-2 border-gray-300 rounded-lg text-2xl text-center font-bold tracking-[1em] focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
              />
              {error && (
                <p className="mt-2 text-sm text-red-600">{error}</p>
              )}
            </div>

            <PrimaryButton
              onClick={handleVerify}
              disabled={otpCode.length !== 6}
              loading={verifying}
            >
              認証して次へ
            </PrimaryButton>

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
          <TextLink onClick={() => router.push(`/interview/${slug}/cancelled`)}>
            キャンセル
          </TextLink>
          <TextLink href="#">
            お困りの方はこちら
          </TextLink>
        </div>
      </div>
    </InterviewLayout>
  )
}
