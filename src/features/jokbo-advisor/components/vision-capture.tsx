'use client'

import { useRef, useState, useTransition } from 'react'
import type { CardId, GameType } from '@/features/hwatu/types'
import { Button, useToast } from '@/components/ui'
import { translateError, useDict } from '@/lib/i18n/client'
import { recognizeHand } from '../vision/actions'

/** 서버 스키마(vision/actions.ts)가 인코딩 5MB 상한을 두므로 원본은 넉넉히 잡고 여기서 먼저 거른다. */
const MAX_FILE_BYTES = 15 * 1024 * 1024

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
  const [preview, setPreview] = useState<string | null>(null)
  const { toast } = useToast()
  const { d } = useDict()

  function handleFile(file: File) {
    // 두 단계(디코드 + LLM 왕복)를 다 태운 뒤 일반 에러로 떨어지지 않게 형식·크기를 먼저 거른다.
    if (!file.type.startsWith('image/')) {
      toast(d.advisor.vision.notImage, 'error')
      return
    }
    if (file.size > MAX_FILE_BYTES) {
      toast(d.advisor.vision.tooLarge, 'error')
      return
    }
    startTransition(async () => {
      // 다운스케일(디코드)도 transition 안에서 — 큰 사진은 디코드만으로 수 초 걸려 pending 표시가 필요하다.
      let dataUrl: string
      try {
        dataUrl = await downscale(file, 1568)
      } catch (error) {
        console.error('downscale failed:', error)
        toast(d.advisor.vision.downscaleFailed, 'error')
        return
      }
      // 무엇을 보냈는지 볼 수 있어야 인식 실패 때 "사진이 흐렸나"를 사용자가 판단할 수 있다.
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
          {/* eslint-disable-next-line @next/next/no-img-element -- 로컬 canvas data URL 이라 최적화 대상이 아니다 */}
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
      {/*
       * pending 을 disabled 로 표현하면 Button 의 disabled:opacity-40 이 걸려 스피너 대비가
       * 1.5:1 까지 떨어졌다 — 어두운 자리에서 진행 중인지 사실상 보이지 않는다. loading 은
       * aria-busy 와 스피너를 붙이되 흐리게 만들지 않는다.
       */}
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
