'use client'

import { clsx } from 'clsx'
import { useId } from 'react'
import type { ReactNode } from 'react'

/**
 * 폼 컨트롤 공통 클래스. select·textarea 가 이 문자열을 복붙하고 있어서 한곳으로 모은다.
 * focus 링은 globals.css 의 :focus-visible 기준선이 담당한다 — 여기서 outline 을 지우지 않는다.
 */
export const CONTROL_CLASS =
  'min-h-12 w-full rounded-xl border border-gold/15 bg-bg-deep/70 px-4 text-base text-text placeholder:text-muted/60 focus:border-gold/50'

export function Input({ className, ...props }: React.ComponentPropsWithRef<'input'>) {
  return <input {...props} className={clsx(CONTROL_CLASS, className)} />
}

/** 네이티브 select 는 OS 기본 화살표가 어두운 패널 위에서 이물감이 크다 — 직접 그린다. */
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

/**
 * 체크박스 행 — 라벨 전체가 48px 탭 타깃이다. 비활성 사유는 hint 로 받아
 * aria-describedby 로 묶는다 (ui-permission-gating 의 "비활성 + 사유").
 */
export function Checkbox({
  label,
  hint,
  className,
  ...props
}: Omit<React.ComponentPropsWithRef<'input'>, 'type'> & {
  label: ReactNode
  /** 왜 못 켜는지 / 무엇을 켜는지. disabled 일 때 특히 필요하다. */
  hint?: string
}) {
  const generatedId = useId()
  const hintId = hint ? `${generatedId}-hint` : undefined
  return (
    <div className="space-y-1.5">
      <label
        className={clsx(
          'flex min-h-12 items-center gap-3 rounded-xl bg-bg-deep/60 px-4 text-sm font-medium',
          props.disabled && 'opacity-60',
          className,
        )}
      >
        <input
          {...props}
          type="checkbox"
          aria-describedby={hintId}
          className="size-4 accent-accent"
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

/**
 * 라벨 + 컨트롤 + 에러/힌트. 에러는 필드에 프로그램적으로 묶여야(aria-describedby)
 * 스크린리더가 "이 필드의 문제"로 읽는다 — 형제 <p> 로 흩뿌리면 안 된다.
 *
 * children 이 함수면 `{ id, describedBy, invalid }` 를 넘겨 준다. 컨트롤에 그대로 펼치면
 * 연결이 완성된다. 함수가 아니면 기존처럼 label 로 감싸기만 한다.
 */
export function Field({
  label,
  children,
  hint,
  error,
  required,
}: {
  label: string
  children: ReactNode | ((props: FieldControlProps) => ReactNode)
  hint?: string
  error?: string
  required?: boolean
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
  // 함수 자식은 id 를 받아 명시적으로 연결한다. 아닌 경우 label 로 감싸 암묵적으로 연결한다
  // — 기존 호출부가 id 를 받지 않으므로 htmlFor 로 바꾸면 라벨 연결이 끊긴다.
  const Wrapper = typeof children === 'function' ? 'div' : 'label'
  return (
    <Wrapper className="block space-y-1.5">
      <span className="block text-sm font-medium text-muted">
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
