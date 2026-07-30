'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import type { CardId, GameType } from '@/features/hwatu/types'
import { Button, Spinner } from '@/components/ui'
import { translateError, useDict } from '@/lib/i18n/client'
import { recognizeHand, type VisionRecognition } from '../vision/actions'
import { VisionResultOverlay } from './vision-result-overlay'

const MAX_CAPTURE_EDGE = 1568

export type CameraFallbackReason = 'denied' | 'error'

type CapturePhase = 'starting' | 'live' | 'frozen'

/**
 * Live camera viewfinder for jokbo-advisor's vision capture flow.
 *
 * Owns the getUserMedia stream lifecycle: requests the environment-facing
 * camera on mount, stops all tracks the moment a frame is captured (or on
 * cancel/unmount), and never re-opens the camera while the captured frame is
 * being reviewed. Recognition only runs once per shutter press — there is no
 * continuous/live recognition loop.
 */
export function CameraCapture({
  gameType,
  onConfirm,
  onCancel,
  onFallback,
}: {
  gameType: GameType
  onConfirm: (ids: readonly CardId[], confidence: number) => void
  onCancel: () => void
  onFallback: (reason: CameraFallbackReason) => void
}) {
  const { d } = useDict()
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const onFallbackRef = useRef(onFallback)
  const [phase, setPhase] = useState<CapturePhase>('starting')
  const [frameUrl, setFrameUrl] = useState<string | null>(null)
  const [result, setResult] = useState<VisionRecognition | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    onFallbackRef.current = onFallback
  }, [onFallback])

  useEffect(() => {
    if (phase !== 'starting') return
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      onFallbackRef.current('error')
      return
    }

    let cancelled = false
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: 'environment' } })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop())
          return
        }
        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          // autoPlay + muted + playsInline covers iOS, but a rejected play()
          // leaves a black viewfinder with no error — nudge it explicitly.
          void videoRef.current.play().catch(() => undefined)
        }
        setPhase('live')
      })
      .catch((error: unknown) => {
        if (cancelled) return
        onFallbackRef.current(isPermissionDenied(error) ? 'denied' : 'error')
      })

    return () => {
      cancelled = true
    }
  }, [phase])

  // Belt-and-suspenders cleanup: stop any live stream if this component ever
  // unmounts (sheet closed via backdrop/escape) without going through the
  // explicit cancel/confirm handlers below.
  useEffect(() => {
    return () => stopStream(streamRef)
  }, [])

  function handleShutter() {
    const video = videoRef.current
    if (!video || video.videoWidth === 0 || video.videoHeight === 0) return

    let dataUrl: string
    try {
      dataUrl = captureFrame(video, MAX_CAPTURE_EDGE)
    } catch {
      setErrorMessage(d.advisor.vision.recognitionFailed)
      return
    }

    stopStream(streamRef)
    setFrameUrl(dataUrl)
    setResult(null)
    setErrorMessage(null)
    setPhase('frozen')

    startTransition(async () => {
      try {
        const response = await recognizeHand({ imageDataUrl: dataUrl, gameType })
        if (!response.success) {
          setErrorMessage(translateError(d, response.error))
          return
        }
        setResult(response.data)
      } catch {
        setErrorMessage(d.advisor.vision.recognitionFailed)
      }
    })
  }

  function handleRetake() {
    setFrameUrl(null)
    setResult(null)
    setErrorMessage(null)
    setPhase('starting')
  }

  function handleCancel() {
    stopStream(streamRef)
    onCancel()
  }

  function handleConfirm() {
    if (!result || result.cardIds.length === 0) return
    onConfirm(result.cardIds, result.confidence)
  }

  if (phase === 'frozen' && frameUrl) {
    return (
      <VisionResultOverlay
        frameUrl={frameUrl}
        cards={result?.cards ?? []}
        confidence={result?.confidence ?? 0}
        note={result?.note ?? null}
        pending={isPending}
        errorMessage={errorMessage}
        onConfirm={handleConfirm}
        onRetake={handleRetake}
      />
    )
  }

  return (
    <div className="space-y-3">
      <div className="relative aspect-[3/4] w-full overflow-hidden rounded-2xl bg-black">
        <video ref={videoRef} autoPlay playsInline muted className="size-full object-cover" />
        {phase === 'live' ? <GuideFrame gameType={gameType} /> : null}
        {phase === 'starting' ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <Spinner label={d.advisor.vision.startingCamera} />
          </div>
        ) : null}
      </div>
      <p className="text-center text-xs text-muted">{d.advisor.vision.guideHint}</p>
      <div className="grid grid-cols-2 gap-2">
        <Button variant="outline" onClick={handleCancel}>
          {d.common.cancel}
        </Button>
        <Button variant="primary" onClick={handleShutter} disabled={phase !== 'live'}>
          {d.advisor.vision.shutter}
        </Button>
      </div>
    </div>
  )
}

function GuideFrame({ gameType }: { gameType: GameType }) {
  if (gameType === 'seotda') {
    return (
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center gap-4 p-10">
        <div className="aspect-[103/168] h-full max-h-56 rounded-lg border-2 border-dashed border-white/80" />
        <div className="aspect-[103/168] h-full max-h-56 rounded-lg border-2 border-dashed border-white/80" />
      </div>
    )
  }
  return (
    <div className="pointer-events-none absolute inset-6 rounded-2xl border-2 border-dashed border-white/80" />
  )
}

function captureFrame(video: HTMLVideoElement, maxEdge: number): string {
  const scale = Math.min(1, maxEdge / Math.max(video.videoWidth, video.videoHeight))
  const width = Math.round(video.videoWidth * scale)
  const height = Math.round(video.videoHeight * scale)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('canvas context unavailable')
  context.drawImage(video, 0, 0, width, height)
  return canvas.toDataURL('image/jpeg', 0.8)
}

function stopStream(streamRef: React.RefObject<MediaStream | null>): void {
  streamRef.current?.getTracks().forEach((track) => track.stop())
  streamRef.current = null
}

function isPermissionDenied(error: unknown): boolean {
  return (
    error instanceof DOMException &&
    (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError')
  )
}
