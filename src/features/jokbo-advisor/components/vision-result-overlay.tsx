'use client'

import { clsx } from 'clsx'
import { findCard } from '@/features/hwatu/cards'
import type { HwatuCard } from '@/features/hwatu/types'
import { HwatuCardView } from '@/components/hwatu-card'
import { Alert, Badge, Button, Spinner } from '@/components/ui'
import { format, useDict } from '@/lib/i18n/client'
import type { RecognizedCard } from '../vision/actions'

type ConfidenceTone = 'win' | 'warn' | 'accent'

const BOX_BORDER_CLASS: Record<ConfidenceTone, string> = {
  win: 'border-win',
  warn: 'border-warn',
  accent: 'border-accent',
}

/**
 * Renders recognition results on top of the still frame the shutter captured.
 * Purely presentational — CameraCapture owns the recognizeHand call and the
 * pending/error/result state this component just displays.
 */
export function VisionResultOverlay({
  frameUrl,
  cards,
  confidence,
  note,
  pending,
  errorMessage,
  onConfirm,
  onRetake,
}: {
  frameUrl: string
  cards: readonly RecognizedCard[]
  confidence: number
  note: string | null
  pending: boolean
  errorMessage: string | null
  onConfirm: () => void
  onRetake: () => void
}) {
  const { d } = useDict()
  const tone = confidenceTone(confidence)

  const resolved = cards
    .map((entry) => ({ entry, card: findCard(entry.cardId) }))
    .filter((item): item is { entry: RecognizedCard; card: HwatuCard } => Boolean(item.card))

  const showEmpty = !pending && !errorMessage && resolved.length === 0
  const showResult = !pending && !errorMessage && resolved.length > 0

  return (
    <div className="space-y-3">
      <div className="relative overflow-hidden rounded-2xl bg-black">
        {/* eslint-disable-next-line @next/next/no-img-element -- frozen local capture, not a remote/optimizable asset */}
        <img src={frameUrl} alt={d.advisor.vision.preview} className="w-full object-contain" />
        {resolved.map(({ entry }, index) =>
          entry.box ? (
            <div
              key={`${entry.cardId}-${index}`}
              aria-hidden
              className={clsx(
                'absolute rounded-md border-2 shadow-[0_0_0_1px_rgba(0,0,0,0.55)]',
                BOX_BORDER_CLASS[tone],
              )}
              style={{
                left: `${entry.box.x * 100}%`,
                top: `${entry.box.y * 100}%`,
                width: `${entry.box.w * 100}%`,
                height: `${entry.box.h * 100}%`,
              }}
            />
          ) : null,
        )}
        {pending ? (
          <div className="absolute inset-0 flex items-center justify-center bg-black/55">
            <Spinner label={d.advisor.vision.checking} />
          </div>
        ) : null}
      </div>

      {errorMessage ? <Alert tone="error">{errorMessage}</Alert> : null}
      {showEmpty ? <Alert tone="warn">{d.advisor.vision.noCardsHint}</Alert> : null}

      {showResult ? (
        <div className="space-y-2">
          <div className="flex justify-center">
            <Badge tone={tone}>
              {format(d.advisor.vision.sourceBadge, {
                confidence: (confidence * 100).toFixed(0),
              })}
            </Badge>
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            {resolved.map(({ entry, card }, index) => (
              <div key={`${entry.cardId}-${index}`} className="w-16">
                <HwatuCardView card={card} size="sm" />
              </div>
            ))}
          </div>
          {note ? <p className="text-center text-xs text-muted">{note}</p> : null}
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-2">
        <Button variant="outline" onClick={onRetake} disabled={pending}>
          {d.advisor.vision.retake}
        </Button>
        <Button variant="primary" onClick={onConfirm} disabled={pending || !showResult}>
          {d.advisor.vision.useResult}
        </Button>
      </div>
    </div>
  )
}

function confidenceTone(confidence: number): ConfidenceTone {
  if (confidence >= 0.9) return 'win'
  if (confidence >= 0.7) return 'warn'
  return 'accent'
}
