'use client'

import { clsx } from 'clsx'
import { useRouter } from 'next/navigation'
import { useTransition } from 'react'
import { Button } from '@/components/ui'
import { LOCALES, type Locale } from '@/lib/i18n/config'
import { setLocale } from '@/lib/i18n/actions'
import { useI18n } from '@/lib/i18n/client'

const LABELS: Record<Locale, string> = { ko: '한국어', en: 'EN' }

/**
 * 좁은 화면에서 쓰는 짧은 표기. `한국어`는 네 글자라 전환 알약 하나가 헤더 폭의 1/4을
 * 먹었고, 그만큼 제목이 먼저 잘렸다. 읽어주는 이름(`aria-label`)은 항상 전체 표기를
 * 유지하므로 스크린리더와 역할 기반 셀렉터에는 달라지는 게 없다.
 */
const SHORT_LABELS: Record<Locale, string> = { ko: '한', en: 'EN' }

/**
 * 크기는 `className`이 아니라 `Button`의 `size`로 고른다. `tailwind-merge`가 없어서
 * `size="sm"`에 `min-h-9`를 덧대면 둘 다 살아남고 `min-h-11`이 이긴다 — 예전 코드가
 * 그 상태라 낮추려던 높이가 실제로는 44px 그대로였다.
 */
export function LocaleSwitcher({ compact = false }: { compact?: boolean }) {
  const { locale } = useI18n()
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  return (
    <div
      className={clsx(
        'inline-flex shrink-0 items-center gap-0.5 rounded-full border border-gold/20 bg-bg-deep/60',
        compact ? 'p-0.5' : 'ms-auto p-0.5',
      )}
    >
      {LOCALES.map((candidate) => (
        <Button
          key={candidate}
          type="button"
          variant="ghost"
          size={compact ? 'xs' : 'sm'}
          disabled={isPending || candidate === locale}
          aria-label={LABELS[candidate]}
          aria-current={candidate === locale ? 'true' : undefined}
          className={clsx(
            'rounded-full font-bold disabled:opacity-100',
            compact ? 'min-w-8' : 'min-w-9 sm:min-w-11',
            candidate === locale ? 'bg-gold/20 text-gold' : 'text-muted hover:text-text',
          )}
          onClick={() =>
            startTransition(async () => {
              await setLocale(candidate)
              router.refresh()
            })
          }
        >
          {compact ? (
            SHORT_LABELS[candidate]
          ) : (
            <>
              <span className="sm:hidden">{SHORT_LABELS[candidate]}</span>
              <span className="hidden sm:inline">{LABELS[candidate]}</span>
            </>
          )}
        </Button>
      ))}
    </div>
  )
}