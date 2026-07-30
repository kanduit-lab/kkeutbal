'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTransition } from 'react'
import {
  Alert,
  Badge,
  Button,
  ConfirmDialog,
  Panel,
  PanelHeader,
  SubmitButton,
  useToast,
} from '@/components/ui'
import { translateError, useDict, type Dictionary } from '@/lib/i18n/client'
import { beginSsoLink, disconnectSso } from '../sso-link-actions'
import type { SsoLinkState } from '../profile-actions'
import type { SsoLinkResult } from '../sso-link-cookies'

type NoticeCode =
  | 'guest'
  | 'native'
  | 'not_configured'
  | 'already_linked'
  | 'already_linked_elsewhere'
  | 'account_already_linked'
  | 'rate_limited'

const KNOWN_NOTICE_CODES: ReadonlySet<string> = new Set([
  'guest',
  'native',
  'not_configured',
  'already_linked',
  'already_linked_elsewhere',
  'account_already_linked',
  'rate_limited',
] satisfies readonly NoticeCode[])

function noticeMessage(d: Dictionary, code: NoticeCode): string {
  switch (code) {
    case 'guest':
      return d.account.ssoGuestNotice
    case 'native':
      return d.account.ssoNativeNotice
    case 'not_configured':
      return d.account.ssoUnavailableNotice
    case 'already_linked':
    case 'account_already_linked':
      return d.account.ssoRejectedAccountAlreadyLinked
    case 'already_linked_elsewhere':
      return d.account.ssoRejectedAlreadyLinkedElsewhere
    case 'rate_limited':
      return d.account.ssoErrorRateLimited
  }
}

export function AccountSsoLinkPanel({
  sso,
  ssoError,
  linkResult,
}: {
  sso: SsoLinkState
  ssoError: string | null
  linkResult: SsoLinkResult | null
}) {
  const { d } = useDict()
  const { toast } = useToast()
  const router = useRouter()
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    if (!ssoError) return
    if (KNOWN_NOTICE_CODES.has(ssoError)) {
      toast(noticeMessage(d, ssoError as NoticeCode), 'error')
    }
    router.replace('/account')
  }, [ssoError, d, toast, router])

  useEffect(() => {
    if (!linkResult) return
    if (linkResult.status === 'linked') {
      toast(d.account.ssoLinkedToast, 'success')
      router.refresh()
    } else {
      toast(noticeMessage(d, linkResult.reason), 'error')
    }
  }, [linkResult, d, toast, router])

  function disconnect() {
    if (isPending) return
    startTransition(async () => {
      const result = await disconnectSso()
      setConfirmOpen(false)
      if (result.success) {
        toast(d.account.ssoDisconnectedToast, 'success')
        router.refresh()
      } else {
        toast(translateError(d, result.error), 'error')
      }
    })
  }

  return (
    <Panel className="space-y-4">
      <PanelHeader
        title={d.account.ssoTitle}
        description={d.account.ssoDescription}
        badge={
          sso.kind === 'linked' ? (
            <Badge tone="win">{d.account.ssoLinkedLabel}</Badge>
          ) : sso.kind === 'native' ? (
            <Badge tone="accent">{d.account.ssoNativeBadge}</Badge>
          ) : (
            <Badge tone="muted">{d.account.ssoNotLinkedLabel}</Badge>
          )
        }
      />

      {sso.kind === 'guest' ? <Alert tone="warn">{d.account.ssoGuestNotice}</Alert> : null}

      {sso.kind === 'native' ? <Alert tone="info">{d.account.ssoNativeNotice}</Alert> : null}

      {sso.kind === 'unlinked' ? (
        sso.available ? (
          <form action={beginSsoLink}>
            <SubmitButton variant="primary" size="lg" className="w-full" pendingLabel={d.common.loading}>
              {d.account.ssoConnectButton}
            </SubmitButton>
          </form>
        ) : (
          <Alert tone="info">{d.account.ssoUnavailableNotice}</Alert>
        )
      ) : null}

      {sso.kind === 'linked' ? (
        sso.canDisconnect ? (
          <Button
            type="button"
            variant="danger"
            size="lg"
            className="w-full"
            onClick={() => setConfirmOpen(true)}
          >
            {d.account.ssoDisconnectButton}
          </Button>
        ) : (
          <Alert tone="info">{d.account.ssoDisconnectUnsafeNotice}</Alert>
        )
      ) : null}

      <ConfirmDialog
        open={confirmOpen}
        title={d.account.ssoDisconnectConfirmTitle}
        body={d.account.ssoDisconnectConfirmBody}
        confirmLabel={d.account.ssoDisconnectConfirm}
        tone="danger"
        loading={isPending}
        onConfirm={disconnect}
        onClose={() => setConfirmOpen(false)}
      />
    </Panel>
  )
}
