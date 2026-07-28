'use client'

import { useState } from 'react'
import { Input } from '@/components/ui'
import { useDict } from '@/lib/i18n/client'

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