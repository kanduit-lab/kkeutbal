'use client'

/** 표 행 선택 체크박스. 방 목록과 회원 목록이 같은 것을 쓴다. */
export function SelectBox({
  checked,
  indeterminate = false,
  onChange,
  label,
  disabled,
}: {
  checked: boolean
  indeterminate?: boolean
  onChange: () => void
  label: string
  disabled?: boolean
}) {
  return (
    <input
      type="checkbox"
      className="size-5 shrink-0 cursor-pointer accent-accent disabled:cursor-not-allowed disabled:opacity-40"
      checked={checked}
      disabled={disabled}
      aria-label={label}
      ref={(node) => {
        if (node) node.indeterminate = indeterminate
      }}
      onChange={onChange}
      onClick={(event) => event.stopPropagation()}
    />
  )
}
