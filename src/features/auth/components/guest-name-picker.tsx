'use client'

import { useState } from 'react'
import { useFormStatus } from 'react-dom'
import { Button, Input, SubmitButton } from '@/components/ui'
import { useDict } from '@/lib/i18n/client'
import { getGuestNamesForToken } from '@/features/auth/actions'

const CODE_PATTERN = /^[A-Z2-9]{8}$/

interface Notice {
  text: string
  tone: 'error' | 'info'
}

export function GuestNamePicker() {
  const { d } = useDict()
  const { pending } = useFormStatus()
  const [names, setNames] = useState<readonly string[] | null>(null)
  const [showNewName, setShowNewName] = useState(false)
  const [loading, setLoading] = useState(false)
  const [notice, setNotice] = useState<Notice | null>(null)

  const load = async (source: 'blur' | 'button', rawCode: string) => {
    if (loading || pending) return
    const code = rawCode.trim().toUpperCase()
    if (!CODE_PATTERN.test(code)) {
      if (source === 'button') setNotice({ text: d.auth.enterTokenFirst, tone: 'info' })
      return
    }
    setLoading(true)
    setNotice(null)
    try {
      const result = await getGuestNamesForToken(code)
      if (!result.ok) {
        setNames(null)
        setNotice({ text: d.auth.errorGuestTokenInvalid, tone: 'error' })
        return
      }
      setNames(result.names)
      if (result.names.length === 0) {
        setNotice({ text: d.auth.noNamesForToken, tone: 'info' })
      } else {
        setShowNewName(false)
      }
    } catch (error) {
      console.error('guest name load failed:', error)
      setNotice({ text: d.auth.loadNamesFailed, tone: 'error' })
    } finally {
      setLoading(false)
    }
  }

  const showChips = names !== null && names.length > 0 && !showNewName

  return (
    <div className="space-y-3">
      <Input
        name="code"
        aria-label={d.auth.tokenPlaceholder}
        placeholder={d.auth.tokenPlaceholder}
        maxLength={8}
        required
        autoComplete="off"
        autoCapitalize="characters"
        className="uppercase tracking-[0.3em]"
        onBlur={(event) => void load('blur', event.currentTarget.value)}
        onChange={() => {
          if (names !== null || notice !== null) {
            setNames(null)
            setShowNewName(false)
            setNotice(null)
          }
        }}
      />
      <Button
        type="button"
        variant="surface"
        size="md"
        className="w-full"
        loading={loading}
        onClick={(event) => {
          const field = event.currentTarget.form?.elements.namedItem('code')
          void load('button', field instanceof HTMLInputElement ? field.value : '')
        }}
      >
        {d.auth.loadNames}
      </Button>
      {notice ? (
        <p
          role={notice.tone === 'error' ? 'alert' : 'status'}
          className={notice.tone === 'error' ? 'text-xs text-danger' : 'text-xs text-muted'}
        >
          {notice.text}
        </p>
      ) : null}
      {showChips ? (
        <div className="space-y-2">
          <p className="text-xs text-muted">{d.auth.existingNamesHint}</p>
          <div className="flex flex-wrap gap-2">
            {names.map((name) => (
              <Button
                key={name}
                type="submit"
                name="name"
                value={name}
                variant="surface"
                size="md"
                disabled={pending}
              >
                {name}
              </Button>
            ))}
          </div>
          <Button
            type="button"
            variant="ghost"
            size="md"
            className="w-full"
            onClick={() => setShowNewName(true)}
          >
            {d.auth.startWithNewName}
          </Button>
        </div>
      ) : (
        <>
          <Input
            name="name"
            aria-label={d.auth.nameLabel}
            placeholder={d.auth.namePlaceholder}
            maxLength={20}
            required
            autoComplete="off"
          />
          <SubmitButton
            variant="primary"
            size="lg"
            className="w-full"
            pendingLabel={d.auth.guestEnterPending}
          >
            {d.auth.guestEnter}
          </SubmitButton>
        </>
      )}
    </div>
  )
}