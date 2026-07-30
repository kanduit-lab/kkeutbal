'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Button, Field, Input, Panel, useToast } from '@/components/ui'
import { translateError, useDict } from '@/lib/i18n/client'
import { updateDisplayName } from '../profile-actions'

export function AccountDisplayNameForm({ currentName }: { currentName: string }) {
  const router = useRouter()
  const { toast } = useToast()
  const { d } = useDict()
  const [isPending, startTransition] = useTransition()
  const [name, setName] = useState(currentName)
  const [error, setError] = useState<string | null>(null)

  const trimmed = name.trim()
  const unchanged = trimmed === currentName
  const canSave = trimmed.length > 0 && trimmed.length <= 20 && !unchanged

  function save() {
    if (isPending || !canSave) return
    setError(null)
    startTransition(async () => {
      const result = await updateDisplayName({ displayName: trimmed })
      if (result.success) {
        setName(result.data.displayName)
        toast(d.account.saved, 'success')
        router.refresh()
      } else {
        setError(translateError(d, result.error))
      }
    })
  }

  return (
    <Panel className="space-y-4">
      <Field
        label={d.account.displayNameLabel}
        required
        error={error ?? undefined}
        hint={d.account.displayNameHint}
      >
        {(control) => (
          <Input
            {...control}
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={20}
            placeholder={d.auth.namePublicPlaceholder}
            autoComplete="off"
          />
        )}
      </Field>
      <Button
        type="button"
        variant="primary"
        size="lg"
        className="w-full"
        disabled={!canSave}
        loading={isPending}
        loadingLabel={d.common.saving}
        onClick={save}
      >
        {d.account.displayNameSubmit}
      </Button>
    </Panel>
  )
}
