'use client'

import { useEffect, useState } from 'react'
import { Button, useToast } from '@/components/ui'
import { format, useDict } from '@/lib/i18n/client'
import type { Dictionary } from '@/lib/i18n/client'

export interface ShareStanding {
  readonly displayName: string
  readonly net: number
}

export interface ShareTransfer {
  readonly fromName: string
  readonly toName: string
  readonly amount: number
}

function rankMark(index: number): string {
  return index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`
}

function formatNet(net: number): string {
  return `${net > 0 ? '+' : ''}${net.toLocaleString()}`
}

export function buildShareText(
  d: Dictionary,
  roomName: string,
  standings: readonly ShareStanding[],
  transfers: readonly ShareTransfer[],
  shareUrl: string,
): string {
  const lines: string[] = [format(d.result.shareHeader, { name: roomName }), '']
  standings.forEach((row, index) => {
    lines.push(`${rankMark(index)} ${row.displayName} ${formatNet(row.net)}`)
  })
  if (transfers.length > 0) {
    lines.push('', d.result.shareSettlement)
    for (const transfer of transfers) {
      lines.push(`${transfer.fromName} → ${transfer.toName} ${transfer.amount.toLocaleString()}`)
    }
  }

  if (shareUrl) lines.push('', shareUrl)
  return lines.join('\n')
}

function currentResultUrl(): string {
  if (typeof window === 'undefined') return ''
  const url = new URL(window.location.href)
  url.search = ''
  url.hash = ''
  return url.toString()
}

/**
 * 클립보드 폴백. `navigator.clipboard`는 보안 컨텍스트에서만 있고, 로컬 IP로 붙은
 * 개발 서버·구형 인앱 브라우저에는 없다. 그 환경에서 조용히 실패하는 대신 옛 방식으로 쓴다.
 */
async function writeClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // execCommand 경로로 내려간다
  }

  try {
    const area = document.createElement('textarea')
    area.value = text
    area.setAttribute('readonly', '')
    area.style.position = 'fixed'
    area.style.opacity = '0'
    document.body.appendChild(area)
    area.select()
    const copied = document.execCommand('copy')
    document.body.removeChild(area)
    return copied
  } catch {
    return false
  }
}

/**
 * 결과 공유. 버튼이 둘이다 — **복사**는 어디서나 뜨고, **공유**는 `navigator.share`가
 * 있을 때만 뜬다.
 *
 * 예전에는 버튼 하나가 share를 시도하고 없으면 조용히 복사로 떨어졌다. 그래서
 * 데스크톱(share 미지원)에서는 "결과 공유"를 눌렀는데 공유 시트 대신 토스트만 떠서,
 * 무슨 일이 일어났는지 라벨만 봐서는 알 수 없었다. 두 동작을 각자의 라벨로 분리한다.
 */
export function ShareResultButton({
  roomName,
  standings,
  transfers,
}: {
  roomName: string
  standings: readonly ShareStanding[]
  transfers: readonly ShareTransfer[]
}) {
  const { toast } = useToast()
  const { d } = useDict()

  const [busy, setBusy] = useState<'copy' | 'share' | null>(null)
  // 서버 렌더에는 navigator가 없다. 첫 페인트 뒤에 확인해야 hydration 불일치가 없다.
  const [canShare, setCanShare] = useState(false)
  useEffect(() => {
    setCanShare(typeof navigator !== 'undefined' && typeof navigator.share === 'function')
  }, [])

  function shareText(): { text: string; url: string } {
    const url = currentResultUrl()
    return { text: buildShareText(d, roomName, standings, transfers, url), url }
  }

  async function handleCopy() {
    if (busy) return
    setBusy('copy')
    try {
      const copied = await writeClipboard(shareText().text)
      toast(copied ? d.result.copied : d.result.copyFailed, copied ? 'success' : 'error')
    } finally {
      setBusy(null)
    }
  }

  async function handleShare() {
    if (busy) return
    setBusy('share')
    try {
      const { text, url } = shareText()
      await navigator.share({
        title: format(d.result.shareTitle, { name: roomName }),
        text,
        ...(url ? { url } : {}),
      })
    } catch (error) {
      // 사용자가 공유 시트를 닫은 것은 실패가 아니다 — 조용히 넘긴다.
      if (!(error instanceof DOMException && error.name === 'AbortError')) {
        toast(d.result.shareFailed, 'error')
      }
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className={canShare ? 'grid grid-cols-2 gap-2' : undefined}>
      <Button
        type="button"
        variant="outline"
        className="w-full"
        loading={busy === 'copy'}
        onClick={() => handleCopy()}
      >
        <span aria-hidden>📋</span> {d.result.copy}
      </Button>
      {canShare ? (
        <Button
          type="button"
          variant="outline"
          className="w-full"
          loading={busy === 'share'}
          onClick={() => handleShare()}
        >
          <span aria-hidden>📤</span> {d.result.share}
        </Button>
      ) : null}
    </div>
  )
}
