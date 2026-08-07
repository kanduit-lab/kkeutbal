'use client'

import { clsx } from 'clsx'
import { useId } from 'react'
import type { ReactNode } from 'react'

export const CONTROL_CLASS =
  'min-h-12 w-full rounded-xl border border-gold/15 bg-field px-4 text-base text-text placeholder:text-muted/60 focus:border-gold/50'

export function Input({ className, ...props }: React.ComponentPropsWithRef<'input'>) {
  return <input {...props} className={clsx(CONTROL_CLASS, className)} />
}

export function Select({ className, children, ...props }: React.ComponentPropsWithRef<'select'>) {
  return (
    <div className="relative">
      <select {...props} className={clsx(CONTROL_CLASS, 'appearance-none pr-10', className)}>
        {children}
      </select>
      <span
        aria-hidden
        className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-muted"
      >
        ▾
      </span>
    </div>
  )
}

export function Textarea({ className, ...props }: React.ComponentPropsWithRef<'textarea'>) {
  return <textarea {...props} className={clsx(CONTROL_CLASS, 'min-h-24 py-3', className)} />
}

export function Checkbox({
  label,
  hint,
  className,
  ...props
}: Omit<React.ComponentPropsWithRef<'input'>, 'type'> & {
  label: ReactNode

  hint?: string
}) {
  const generatedId = useId()
  const hintId = hint ? `${generatedId}-hint` : undefined
  return (
    <div className="space-y-1.5">
      <label
        className={clsx(
          'flex min-h-12 cursor-pointer items-center gap-3 rounded-xl bg-inset px-4 font-medium',
          props.disabled && 'cursor-not-allowed opacity-60',
          className,
        )}
      >
        <input
          {...props}
          type="checkbox"
          aria-describedby={hintId}
          className="size-5 shrink-0 accent-accent"
        />
        {label}
      </label>
      {hint ? (
        <p id={hintId} className="text-xs font-medium text-warn">
          {hint}
        </p>
      ) : null}
    </div>
  )
}

export function Field({
  label,
  children,
  hint,
  error,
  required,
  group = false,
}: {
  label: string
  children: ReactNode | ((props: FieldControlProps) => ReactNode)
  hint?: string
  error?: string
  required?: boolean
  /**
   * 단일 입력이 아니라 **버튼 묶음**을 감쌀 때 켠다.
   *
   * `<button>`은 HTML 명세상 labelable 요소다. 그래서 `<label>칩 재원 <button>세션 칩</button>…`
   * 구조에서는 버튼의 접근성 이름이 라벨 텍스트로 덮어씌워지고, 그룹 안 모든 버튼이 같은
   * 이름("칩 재원")으로 보인다 — 스크린리더로는 구분이 안 되고 role+name 셀렉터도 못 찾는다
   * (e2e가 실제로 이걸 잡았다). 이 모드는 `<label>` 대신 `role="group"`을 쓴다.
   */
  group?: boolean
}) {
  const id = useId()
  const hintId = `${id}-hint`
  const errorId = `${id}-error`
  const describedBy = [error ? errorId : null, hint ? hintId : null].filter(Boolean).join(' ')
  const control: FieldControlProps = {
    id,
    'aria-describedby': describedBy || undefined,
    'aria-invalid': error ? true : undefined,
    required,
  }

  const labelId = `${id}-label`
  const Wrapper = group || typeof children === 'function' ? 'div' : 'label'
  return (
    <Wrapper
      className="block space-y-1.5"
      {...(group ? { role: 'group', 'aria-labelledby': labelId } : {})}
    >
      <span
        id={group ? labelId : undefined}
        className="block text-sm font-medium text-muted"
      >
        {label}
        {required ? <span className="ml-0.5 text-danger">*</span> : null}
      </span>
      {typeof children === 'function' ? (
        <>
          <label className="sr-only" htmlFor={id}>
            {label}
          </label>
          {children(control)}
        </>
      ) : (
        children
      )}
      {hint && !error ? (
        <p id={hintId} className="text-xs text-muted/70">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} role="alert" className="text-xs font-medium text-danger">
          {error}
        </p>
      ) : null}
    </Wrapper>
  )
}

export interface FieldControlProps {
  id: string
  'aria-describedby'?: string
  'aria-invalid'?: true
  required?: boolean
}