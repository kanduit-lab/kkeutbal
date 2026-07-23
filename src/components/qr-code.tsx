'use client'

// qrcode 는 default export 가 없다 — named import 만 타입이 잡힌다.
import { toString as renderQrSvg } from 'qrcode'
import { useEffect, useState } from 'react'

/**
 * 입장 QR 코드 — 다크 테마 위에서도 스캔되도록 흰 배경 패딩 박스에 담는다.
 * SVG 문자열은 qrcode 라이브러리가 전부 생성하고 value 는 모듈 데이터로만
 * 인코딩되므로 data URI 로 넣어도 마크업 주입 여지가 없다.
 * 생성 실패 시에는 아무것도 렌더하지 않는다 (호출부가 코드 텍스트를 함께 보여준다).
 */
export function QrCode({ value, size = 176 }: { value: string; size?: number }) {
  const [svg, setSvg] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    renderQrSvg(value, { type: 'svg', margin: 1 })
      .then((markup) => {
        if (!cancelled) setSvg(markup)
      })
      .catch((error) => {
        console.error('QR 생성 실패:', error)
        if (!cancelled) setSvg(null)
      })
    return () => {
      cancelled = true
    }
  }, [value])

  if (!svg) return null
  return (
    <div className="inline-flex rounded-xl bg-white p-3">
      {/* eslint-disable-next-line @next/next/no-img-element -- 로컬 생성 data URI 라 next/image 최적화 대상이 아니다 */}
      <img
        src={`data:image/svg+xml;utf8,${encodeURIComponent(svg)}`}
        alt="입장 QR 코드"
        width={size}
        height={size}
        style={{ width: size, height: size }}
      />
    </div>
  )
}
