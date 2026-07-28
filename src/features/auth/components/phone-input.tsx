'use client'

import { useState } from 'react'
import { Input } from '@/components/ui'
import { formatPhone } from '../phone'

export function PhoneInput({
  defaultValue = '',
  placeholder,
  autoFocus,
  ...control
}: {
  defaultValue?: string
  placeholder?: string
  autoFocus?: boolean

  id?: string
  'aria-describedby'?: string
  'aria-invalid'?: true
}) {
  const [value, setValue] = useState(() => formatPhone(defaultValue))
  return (
    <Input
      {...control}
      name="phone"
      type="tel"
      value={value}
      onChange={(event) => setValue(formatPhone(event.target.value))}
      placeholder={placeholder}
      maxLength={13}
      required
      autoFocus={autoFocus}
      autoComplete="tel"
      inputMode="numeric"
    />
  )
}