'use client'

import { useState } from 'react'
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

function buildShareText(
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

  const [sharing, setSharing] = useState(false)

  async function handleShare() {
    if (sharing) return
    setSharing(true)
    const url = currentResultUrl()
    const text = buildShareText(d, roomName, standings, transfers, url)

    try {
      if (typeof navigator.share === 'function') {
        try {
          await navigator.share({
            title: format(d.result.shareTitle, { name: roomName }),
            text,
            ...(url ? { url } : {}),
          })
          return
        } catch (error) {
          if (error instanceof DOMException && error.name === 'AbortError') return
        }
      }

      try {
        await navigator.clipboard.writeText(text)
        toast(d.result.copied, 'success')
      } catch {
        toast(d.result.copyFailed, 'error')
      }
    } finally {
      setSharing(false)
    }
  }

  return (
    <Button
      type="button"
      variant="outline"
      className="w-full"
      loading={sharing}
      onClick={() => handleShare()}
    >
      <span aria-hidden>📤</span> {d.result.share}
    </Button>
  )
}