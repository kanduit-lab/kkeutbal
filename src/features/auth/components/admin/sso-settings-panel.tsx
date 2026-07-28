'use client'

import { useState, useTransition } from 'react'
import {
  Badge,
  Button,
  Checkbox,
  ConfirmDialog,
  Field,
  Input,
  Panel,
  useToast,
} from '@/components/ui'
import { translateError, useDict } from '@/lib/i18n/client'
import { saveSsoSettings } from '../../admin-actions'
import type { SsoSettingsView } from '../../sso-settings'
import { PasswordInput } from '../password-input'

function isValidIssuer(value: string): boolean {
  if (!value.trim()) return false
  try {
    const url = new URL(value.trim())
    return url.protocol === 'https:' || url.protocol === 'http:'
  } catch {
    return false
  }
}

export function SsoSettingsPanel({
  settings,
  onDataChanged,
}: {
  settings: SsoSettingsView
  onDataChanged: () => void
}) {
  const { d } = useDict()
  const { toast } = useToast()
  const [isPending, startTransition] = useTransition()
  const [enabled, setEnabled] = useState(settings.enabled)
  const [issuer, setIssuer] = useState(settings.issuer)
  const [clientId, setClientId] = useState(settings.clientId)
  const [clientSecret, setClientSecret] = useState('')
  const [confirmOpen, setConfirmOpen] = useState(false)

  const missingReason = enabled
    ? !isValidIssuer(issuer)
      ? d.adminConsole.sso.missingIssuer
      : !clientId.trim()
        ? d.adminConsole.sso.missingClientId
        : !settings.hasClientSecret && !clientSecret
          ? d.adminConsole.sso.missingClientSecret
          : undefined
    : undefined
  const toggled = enabled !== settings.enabled

  function save() {
    if (isPending || missingReason) return
    startTransition(async () => {
      const result = await saveSsoSettings({
        enabled,
        issuer: issuer.trim(),
        clientId: clientId.trim(),
        clientSecret,
      })
      if (result.success) {
        setClientSecret('')
        toast(enabled ? d.adminConsole.sso.savedEnabled : d.adminConsole.sso.saved, 'success')
        onDataChanged()
      } else {
        toast(translateError(d, result.error), 'error')
      }
    })
  }

  return (
    <Panel className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="font-bold">{d.adminConsole.sso.title}</h2>
          <p className="mt-1 text-sm text-muted">{d.adminConsole.sso.description}</p>
        </div>
        <Badge tone={enabled ? 'win' : 'muted'}>
          {enabled ? d.adminConsole.on : d.adminConsole.off}
        </Badge>
      </div>
      <Checkbox
        label={d.adminConsole.sso.enable}
        checked={enabled}
        onChange={(event) => setEnabled(event.target.checked)}
      />
      <Field label={d.adminConsole.sso.issuerLabel}>
        {(control) => (
          <Input
            {...control}
            type="url"
            value={issuer}
            onChange={(event) => setIssuer(event.target.value)}
            placeholder={d.adminConsole.sso.issuerPlaceholder}
            maxLength={500}
            autoCapitalize="off"
          />
        )}
      </Field>
      <Field label={d.adminConsole.sso.clientIdLabel}>
        {(control) => (
          <Input
            {...control}
            value={clientId}
            onChange={(event) => setClientId(event.target.value)}
            maxLength={500}
            autoCapitalize="off"
          />
        )}
      </Field>
      <Field
        label={
          settings.hasClientSecret
            ? d.adminConsole.sso.clientSecretStoredLabel
            : d.adminConsole.sso.clientSecretLabel
        }
      >
        {(control) => (
          <PasswordInput
            {...control}
            value={clientSecret}
            onChange={(event) => setClientSecret(event.target.value)}
            placeholder={
              settings.hasClientSecret
                ? d.adminConsole.sso.clientSecretStoredPlaceholder
                : d.adminConsole.sso.clientSecretPlaceholder
            }
            maxLength={1000}
            autoComplete="new-password"
          />
        )}
      </Field>
      <p className="text-xs text-muted">{d.adminConsole.sso.note}</p>
      <Button
        type="button"
        variant="primary"
        className="w-full"
        loading={isPending}
        disabled={Boolean(missingReason)}
        disabledReason={missingReason}
        onClick={() => (toggled ? setConfirmOpen(true) : save())}
      >
        {d.adminConsole.sso.save}
      </Button>
      <ConfirmDialog
        open={confirmOpen}
        title={
          enabled ? d.adminConsole.sso.enableConfirmTitle : d.adminConsole.sso.disableConfirmTitle
        }
        body={
          enabled ? d.adminConsole.sso.enableConfirmBody : d.adminConsole.sso.disableConfirmBody
        }
        confirmLabel={d.common.save}
        tone={enabled ? 'primary' : 'danger'}
        onConfirm={() => {
          setConfirmOpen(false)
          save()
        }}
        onClose={() => setConfirmOpen(false)}
      />
    </Panel>
  )
}