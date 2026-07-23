'use client'

import { useState } from 'react'
import { useFormStatus } from 'react-dom'
import { Button, Input, SubmitButton } from '@/components/ui'
import { useDict } from '@/lib/i18n/client'
import { getGuestNamesForToken } from '@/features/auth/actions'

/**
 * 게스트 토큰 로그인의 토큰·이름 입력부. sub 가 `guest:{tokenId}:{name}` 이라
 * 이름 오타가 계정을 조용히 갈라놓는다 — 토큰 입력 후 기존 이름을 칩으로 보여주고,
 * 칩을 탭하면 그 이름 그대로 로그인을 제출한다(칩 = name 값을 가진 submit 버튼).
 *
 * JS 없이도 동작한다: 초기 렌더는 토큰·이름 입력 + 제출 버튼 그대로다.
 * 이름 불러오기·칩만 JS 를 요구하는 부가 기능이다.
 * 부모 <form action={loginWithGuestToken}> 안에서만 렌더할 것.
 */

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
      // blur 는 입력 도중일 수 있어 조용히 넘어간다 — 버튼은 명시적 요청이라 안내한다.
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
        placeholder={d.auth.tokenPlaceholder}
        maxLength={8}
        required
        autoComplete="off"
        autoCapitalize="characters"
        className="uppercase tracking-[0.3em]"
        onBlur={(event) => void load('blur', event.currentTarget.value)}
        onChange={() => {
          // 코드가 바뀌면 이전 토큰의 이름 칩·안내는 무효 — 다른 토큰으로 제출되는 것을 막는다.
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
        disabled={loading}
        onClick={(event) => {
          const field = event.currentTarget.form?.elements.namedItem('code')
          void load('button', field instanceof HTMLInputElement ? field.value : '')
        }}
      >
        {loading ? d.common.loading : d.auth.loadNames}
      </Button>

      {notice ? (
        <p
          role="status"
          className={notice.tone === 'error' ? 'text-xs text-[#ff9a94]' : 'text-xs text-muted'}
        >
          {notice.text}
        </p>
      ) : null}

      {showChips ? (
        <div className="space-y-2">
          <p className="text-xs text-muted">{d.auth.existingNamesHint}</p>
          <div className="flex flex-wrap gap-2">
            {names.map((name) => (
              // 칩 = name 값을 가진 submit 버튼 — 이 모드에서는 이름 입력을 렌더하지
              // 않으므로 formData.get('name') 이 칩 값으로 확정된다.
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
          <Input name="name" placeholder={d.auth.namePlaceholder} maxLength={20} required autoComplete="off" />
          <SubmitButton variant="primary" size="lg" className="w-full" pendingLabel={d.auth.guestEnterPending}>
            {d.auth.guestEnter}
          </SubmitButton>
        </>
      )}
    </div>
  )
}
