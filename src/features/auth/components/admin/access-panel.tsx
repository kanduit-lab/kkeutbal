'use client'

import { useState, useTransition } from 'react'
import { ConfirmDialog, useToast } from '@/components/ui'
import { format, translateError, useDict } from '@/lib/i18n/client'
import {
  createGuestToken,
  createRegistrationCode,
  revokeGuestToken,
  revokeRegistrationCode,
} from '../../admin-actions'
import type { GuestTokenView, RegistrationCodeView } from '../../admin-queries'
import { IssueSecretPanel } from './issue-secret-panel'
import { RevocableList } from './revocable-list'

export function AccessPanel({
  tokens,
  registrationCodes,
  onDataChanged,
}: {
  tokens: readonly GuestTokenView[]
  registrationCodes: readonly RegistrationCodeView[]
  onDataChanged: () => void
}) {
  const { d } = useDict()
  const { toast } = useToast()
  const [isPending, startTransition] = useTransition()
  const [latestCode, setLatestCode] = useState<string | null>(null)
  const [latestToken, setLatestToken] = useState<string | null>(null)
  const [revokeCodeTarget, setRevokeCodeTarget] = useState<RegistrationCodeView | null>(null)
  const [revokeTokenTarget, setRevokeTokenTarget] = useState<GuestTokenView | null>(null)

  function issueCode(input: { label: string; expiresInHours: number }) {
    if (isPending) return
    startTransition(async () => {
      const result = await createRegistrationCode(input)
      if (result.success) {
        setLatestCode(result.data.code)
        toast(d.adminConsole.registrationCodes.issued, 'success')
        onDataChanged()
      } else {
        toast(translateError(d, result.error), 'error')
      }
    })
  }

  function issueToken(input: { label: string; expiresInHours: number }) {
    if (isPending) return
    startTransition(async () => {
      const result = await createGuestToken(input)
      if (result.success) {
        setLatestToken(result.data.code)
        toast(d.adminConsole.guestTokens.issued, 'success')
        onDataChanged()
      } else {
        toast(translateError(d, result.error), 'error')
      }
    })
  }

  return (
    <>
      <IssueSecretPanel
        title={d.adminConsole.registrationCodes.issueTitle}
        description={d.adminConsole.registrationCodes.issueDescription}
        issueLabel={d.adminConsole.registrationCodes.issue}
        latestLabel={d.adminConsole.registrationCodes.latest}
        copiedMessage={d.adminConsole.registrationCodes.copied}
        latestValue={latestCode}
        isPending={isPending}
        onIssue={issueCode}
        onAcknowledge={() => setLatestCode(null)}
      />
      <RevocableList
        heading={d.adminConsole.registrationCodes.listTitle}
        items={registrationCodes}
        emptyTitle={d.adminConsole.registrationCodes.empty}
        emptyHint={d.adminConsole.registrationCodes.emptyHint}
        disabled={isPending}
        onRevoke={setRevokeCodeTarget}
      />
      <IssueSecretPanel
        title={d.adminConsole.guestTokens.issueTitle}
        description={d.adminConsole.guestTokens.issueDescription}
        issueLabel={d.adminConsole.guestTokens.issue}
        latestLabel={d.adminConsole.guestTokens.latest}
        copiedMessage={d.adminConsole.guestTokens.copied}
        latestValue={latestToken}
        isPending={isPending}
        onIssue={issueToken}
        onAcknowledge={() => setLatestToken(null)}
      />
      <RevocableList
        heading={d.adminConsole.guestTokens.listTitle}
        items={tokens}
        emptyTitle={d.adminConsole.guestTokens.empty}
        emptyHint={d.adminConsole.guestTokens.emptyHint}
        disabled={isPending}
        onRevoke={setRevokeTokenTarget}
      />
      <ConfirmDialog
        open={revokeCodeTarget !== null}
        title={format(d.adminConsole.registrationCodes.revokeTitle, {
          label: revokeCodeTarget?.label ?? '',
        })}
        body={d.adminConsole.registrationCodes.revokeBody}
        confirmLabel={d.adminConsole.revoke}
        tone="danger"
        onConfirm={() => {
          const target = revokeCodeTarget
          setRevokeCodeTarget(null)
          if (!target) return
          startTransition(async () => {
            const result = await revokeRegistrationCode({ codeId: target.id })
            if (result.success) {
              toast(d.adminConsole.registrationCodes.revokedToast, 'success')
              onDataChanged()
            } else {
              toast(translateError(d, result.error), 'error')
            }
          })
        }}
        onClose={() => setRevokeCodeTarget(null)}
      />
      <ConfirmDialog
        open={revokeTokenTarget !== null}
        title={format(d.adminConsole.guestTokens.revokeTitle, {
          label: revokeTokenTarget?.label ?? '',
        })}
        body={d.adminConsole.guestTokens.revokeBody}
        confirmLabel={d.adminConsole.revoke}
        tone="danger"
        onConfirm={() => {
          const target = revokeTokenTarget
          setRevokeTokenTarget(null)
          if (!target) return
          startTransition(async () => {
            const result = await revokeGuestToken({ tokenId: target.id })
            if (result.success) {
              toast(d.adminConsole.guestTokens.revokedToast, 'success')
              onDataChanged()
            } else {
              toast(translateError(d, result.error), 'error')
            }
          })
        }}
        onClose={() => setRevokeTokenTarget(null)}
      />
    </>
  )
}