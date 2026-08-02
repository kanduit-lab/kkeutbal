'use client'

import { useRef, useState, useTransition } from 'react'
import type { CardId, GameType } from '@/features/hwatu/types'
import { Alert, Button, Sheet, useToast } from '@/components/ui'
import { translateError, useDict } from '@/lib/i18n/client'
import { recognizeHand } from '../vision/actions'
import { CameraCapture, type CameraFallbackReason } from './camera-capture'

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
  const [sheetOpen, setSheetOpen] = useState(false)
  const [fallbackNotice, setFallbackNotice] = useState<string | null>(null)
  const { toast } = useToast()
  const { d } = useDict()

  const cameraSupported =
    typeof navigator !== 'undefined' && typeof navigator.mediaDevices?.getUserMedia === 'function'

  function openCapture() {
    if (!cameraSupported) {
      setFallbackNotice(d.advisor.vision.cameraUnsupported)
      inputRef.current?.click()
      return
    }
    setFallbackNotice(null)
    setSheetOpen(true)
  }

  function handleCameraFallback(reason: CameraFallbackReason) {
    setSheetOpen(false)
    setFallbackNotice(
      reason === 'denied' ? d.advisor.vision.cameraDenied : d.advisor.vision.cameraError,
    )
    inputRef.current?.click()
  }

  function handleCameraConfirm(ids: readonly CardId[], confidence: number) {
    setSheetOpen(false)
    setFallbackNotice(null)
    onRecognized(ids, confidence)
  }

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
      setFallbackNotice(null)
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
      {fallbackNotice ? <Alert tone="info">{fallbackNotice}</Alert> : null}

      {/*
        고르는 화면 바로 아래 붙는 한 줄이라 키가 낮아야 한다. 예전에는 `size="lg"`(56px)
        버튼 위에 64px짜리 미리보기 카드가 따로 얹혀서 두 덩이가 픽커 높이를 잡아먹었다.
        지금은 썸네일을 버튼과 같은 줄에 넣어 한 줄(44px)로 끝낸다.
      */}
      <div className="flex items-center gap-2">
        {preview ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={preview}
            alt={d.advisor.vision.preview}
            className="size-11 shrink-0 rounded-lg object-cover ring-1 ring-white/10"
          />
        ) : null}
        <Button
          type="button"
          variant={isPending ? 'primary' : 'surface'}
          size="sm"
          className="min-w-0 flex-1 border border-white/10"
          loading={isPending}
          loadingLabel={d.advisor.vision.checking}
          disabled={!enabled}
          disabledReason={!enabled ? d.advisor.vision.disabledReason : undefined}
          onClick={openCapture}
        >
          <span className="truncate">
            {preview ? d.advisor.vision.retake : d.advisor.vision.captureButton}
          </span>
        </Button>
      </div>

      <Sheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        ariaLabel={d.advisor.vision.cameraSheetAria}
      >
        <CameraCapture
          gameType={gameType}
          onConfirm={handleCameraConfirm}
          onCancel={() => setSheetOpen(false)}
          onFallback={handleCameraFallback}
        />
      </Sheet>
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
