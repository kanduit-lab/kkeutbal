'use client'

import { useState } from 'react'
import { Input } from '@/components/ui'
import { useDict } from '@/lib/i18n/client'

/**
 * 표시 토글이 달린 비밀번호 입력. 한 손으로 판 옆에서 쓰는 앱이라 8자 이상을 눈 감고
 * 치게 두면 실패율이 그대로 이탈이 된다. Authentik client secret 처럼 붙여넣는 값은
 * 잘렸는지 확인할 방법이 이것뿐이다.
 *
 * `Input` 의 모든 props 를 그대로 통과시킨다 — Field 의 render prop 이 넘기는
 * id/aria-describedby/aria-invalid 도 포함해서.
 */
export function PasswordInput({
  className,
  ...props
}: Omit<React.ComponentPropsWithoutRef<'input'>, 'type'>) {
  const { d } = useDict()
  const [visible, setVisible] = useState(false)
  return (
    <span className="relative block">
      <Input
        {...props}
        type={visible ? 'text' : 'password'}
        className={`pr-14 ${className ?? ''}`}
      />
      <button
        type="button"
        aria-pressed={visible}
        aria-label={visible ? d.auth.hidePassword : d.auth.showPassword}
        onClick={() => setVisible((current) => !current)}
        className="absolute inset-y-0 right-0 inline-flex size-12 items-center justify-center rounded-xl text-lg text-muted transition hover:text-text"
      >
        <span aria-hidden="true">{visible ? '🙈' : '👁'}</span>
      </button>
    </span>
  )
}
