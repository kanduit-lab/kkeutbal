'use client'

import { Button, useToast } from '@/components/ui'
import { format, useDict } from '@/lib/i18n/client'
import type { Dictionary } from '@/lib/i18n/client'

/**
 * 세션 결과 공유 버튼 — 모바일이면 OS 공유 시트(navigator.share),
 * 미지원 환경이면 클립보드 복사 + 토스트로 폴백한다.
 * 서버 컴포넌트(결과 페이지)에서 이름까지 해석된 직렬화 가능한 props만 받는다.
 */

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
): string {
  // 로컬 accumulator — 함수 밖으로 새지 않음
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
  return lines.join('\n')
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

  async function handleShare() {
    const text = buildShareText(d, roomName, standings, transfers)

    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: format(d.result.shareTitle, { name: roomName }), text })
        return
      } catch (error) {
        // 사용자가 공유 시트를 닫은 것은 실패가 아니다 — 조용히 종료.
        if (error instanceof DOMException && error.name === 'AbortError') return
        // 그 외 공유 실패는 클립보드 복사로 폴백한다.
      }
    }

    try {
      await navigator.clipboard.writeText(text)
      toast(d.result.copied, 'success')
    } catch {
      toast(d.result.copyFailed, 'error')
    }
  }

  return (
    <Button
      type="button"
      variant="surface"
      className="w-full border border-white/10"
      onClick={() => handleShare()}
    >
      📤 {d.result.share}
    </Button>
  )
}
