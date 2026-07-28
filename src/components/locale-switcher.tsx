'use client'

import { clsx } from 'clsx'
import { useRouter } from 'next/navigation'
import { useTransition } from 'react'
import { Button } from '@/components/ui'
import { LOCALES, type Locale } from '@/lib/i18n/config'
import { setLocale } from '@/lib/i18n/actions'
import { useI18n } from '@/lib/i18n/client'

const LABELS: Record<Locale, string> = { ko: '한국어', en: 'EN' }

export function LocaleSwitcher() {
  const { locale } = useI18n()
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  return (
    <div className="inline-flex items-center gap-0.5 rounded-full border border-gold/20 bg-bg-deep/60 p-0.5">
      {LOCALES.map((candidate) => (
        <Button
          key={candidate}
          type="button"
          variant="ghost"
          size="sm"
          disabled={isPending || candidate === locale}
          aria-current={candidate === locale ? 'true' : undefined}
          className={clsx(
            'min-w-11 rounded-full px-2.5 font-bold disabled:opacity-100',
            candidate === locale ? 'bg-gold/20 text-gold' : 'text-muted hover:text-text',
          )}
          onClick={() =>
            startTransition(async () => {
              await setLocale(candidate)
              router.refresh()
            })
          }
        >
          {LABELS[candidate]}
        </Button>
      ))}
    </div>
  )
}