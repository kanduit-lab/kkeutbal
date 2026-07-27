'use client'

import { useState } from 'react'
import { Input } from '@/components/ui'
import { formatPhone } from '../phone'

/**
 * 전화번호 입력 — 타이핑하는 동안 하이픈을 자동으로 넣는다.
 * 서버 액션이 제출 시 숫자만 남기므로(zod 가 \D 제거) 하이픈째 보내도 된다.
 * 실패 후 되채워지는 defaultValue(숫자열)도 하이픈 형태로 보여준다.
 */
export function PhoneInput({
  defaultValue = '',
  placeholder,
  autoFocus,
  ...control
}: {
  defaultValue?: string
  placeholder?: string
  autoFocus?: boolean
  /** Field 의 render prop 이 넘기는 연결 속성 — 그대로 통과시켜야 에러가 필드에 묶인다. */
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
