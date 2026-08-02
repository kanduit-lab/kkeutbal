'use client'

import { Input, SubmitButton } from '@/components/ui'
import { useDict } from '@/lib/i18n/client'

/**
 * 게스트 입장 폼의 토큰·이름 입력.
 *
 * 예전에는 토큰을 넣으면 그 토큰으로 이미 입장한 이름 목록을 불러와 탭하면 그 계정으로
 * 이어지게 했다. 그 목록이 곧 계정 선택 메뉴였다 — 토큰만 있으면 방장 이름을 골라 방장이
 * 될 수 있었다. 지금 게스트 신원은 (이 기기의 비밀값, 토큰, 이름)에 묶이므로
 * (`features/auth/guest-identity.ts`) 이름을 알아도 남의 계정으로 들어갈 수 없고, 같은 폰에서
 * 같은 이름으로 다시 들어오면 자동으로 원래 계정으로 이어진다. 목록을 고를 이유가 없어졌다.
 */
export function GuestNamePicker() {
  const { d } = useDict()

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
      />
      <Input
        name="name"
        aria-label={d.auth.nameLabel}
        placeholder={d.auth.namePlaceholder}
        maxLength={20}
        required
        autoComplete="off"
      />
      <p className="text-xs text-muted">{d.auth.sameDeviceNameHint}</p>
      <SubmitButton
        variant="primary"
        size="lg"
        className="w-full"
        pendingLabel={d.auth.guestEnterPending}
      >
        {d.auth.guestEnter}
      </SubmitButton>
    </div>
  )
}
