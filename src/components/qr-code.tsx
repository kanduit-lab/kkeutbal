'use client'

import { toString as renderQrSvg } from 'qrcode'
import { useEffect, useState } from 'react'

export function QrCode({
  value,
  size = 176,
  alt,
}: {
  value: string
  size?: number

  alt: string
}) {
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
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`data:image/svg+xml;utf8,${encodeURIComponent(svg)}`}
        alt={alt}
        width={size}
        height={size}
        style={{ width: size, height: size }}
      />
    </div>
  )
}