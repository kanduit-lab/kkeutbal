'use client'

import { useRef, useTransition } from 'react'
import type { CardId, GameType } from '@/features/hwatu/types'
import { Button, Spinner, useToast } from '@/components/ui'
import { recognizeHand } from '../vision/actions'

/** 사진 인식 버튼 — 촬영 → 1568px 다운스케일 → recognizeHand Server Action. */
export function VisionCapture({
  gameType,
  enabled,
  onRecognized,
}: {
  gameType: GameType
  enabled: boolean
  onRecognized: (ids: readonly CardId[], confidence: number) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [isPending, startTransition] = useTransition()
  const { toast } = useToast()

  async function handleFile(file: File) {
    const dataUrl = await downscale(file, 1568)
    startTransition(async () => {
      const result = await recognizeHand({ imageDataUrl: dataUrl, gameType })
      if (!result.success) {
        toast(result.error, 'error')
        return
      }
      if (result.data.cardIds.length === 0) {
        toast('카드를 인식하지 못했습니다. 더 밝은 곳에서 다시 찍으세요', 'error')
        return
      }
      onRecognized(result.data.cardIds, result.data.confidence)
    })
  }

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0]
          if (file) void handleFile(file)
          event.target.value = ''
        }}
      />
      <Button
        type="button"
        variant="surface"
        size="lg"
        className="w-full border border-white/10"
        disabled={!enabled || isPending}
        disabledReason={!enabled ? '사진 인식 비활성 (ANTHROPIC_API_KEY 필요)' : undefined}
        onClick={() => inputRef.current?.click()}
      >
        {isPending ? <Spinner label="확인하는 중…" /> : '📷 사진으로 확인'}
      </Button>
    </div>
  )
}

async function downscale(file: File, maxEdge: number): Promise<string> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height))
  const width = Math.round(bitmap.width * scale)
  const height = Math.round(bitmap.height * scale)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('canvas context unavailable')
  context.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()
  return canvas.toDataURL('image/jpeg', 0.8)
}
