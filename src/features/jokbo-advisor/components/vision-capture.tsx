'use client'

import { useRef, useState, useTransition } from 'react'
import type { CardId, GameType } from '@/features/hwatu/types'
import { Button, useToast } from '@/components/ui'
import { translateError, useDict } from '@/lib/i18n/client'
import { recognizeHand } from '../vision/actions'

const MAX_FILE_BYTES = 15 * 1024 * 1024

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
  const [preview, setPreview] = useState<string | null>(null)
  const { toast } = useToast()
  const { d } = useDict()

  function handleFile(file: File) {
    if (!file.type.startsWith('image/')) {
      toast(d.advisor.vision.notImage, 'error')
      return
    }
    if (file.size > MAX_FILE_BYTES) {
      toast(d.advisor.vision.tooLarge, 'error')
      return
    }
    startTransition(async () => {
      let dataUrl: string
      try {
        dataUrl = await downscale(file, 1568)
      } catch (error) {
        console.error('downscale failed:', error)
        toast(d.advisor.vision.downscaleFailed, 'error')
        return
      }

      setPreview(dataUrl)
      const result = await recognizeHand({ imageDataUrl: dataUrl, gameType })
      if (!result.success) {
        toast(translateError(d, result.error), 'error')
        return
      }
      if (result.data.cardIds.length === 0) {
        toast(d.advisor.vision.noCardsDetected, 'error')
        return
      }
      onRecognized(result.data.cardIds, result.data.confidence)
    })
  }

  return (
    <div className="space-y-2">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0]
          if (file) handleFile(file)
          event.target.value = ''
        }}
      />
      {preview ? (
        <div className="flex items-center gap-3 rounded-xl bg-bg-deep/60 p-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={preview}
            alt={d.advisor.vision.preview}
            className="size-16 shrink-0 rounded-lg object-cover"
          />
          <p className="min-w-0 flex-1 text-xs text-muted">{d.advisor.vision.preview}</p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            loading={isPending}
            onClick={() => inputRef.current?.click()}
          >
            {d.advisor.vision.retake}
          </Button>
        </div>
      ) : null}

      <Button
        type="button"
        variant={isPending ? 'primary' : 'surface'}
        size="lg"
        className="w-full border border-white/10"
        loading={isPending}
        loadingLabel={d.advisor.vision.checking}
        disabled={!enabled}
        disabledReason={!enabled ? d.advisor.vision.disabledReason : undefined}
        onClick={() => inputRef.current?.click()}
      >
        {d.advisor.vision.captureButton}
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