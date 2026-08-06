'use client'

import { useCallback, useMemo, useState } from 'react'

/**
 * 목록에서 여러 행을 골라 한 번에 처리하기 위한 선택 상태.
 *
 * 선택은 **id 집합**으로 들고 페이지를 넘겨도 유지된다. 대신 목록이 갱신되면(다른 관리자가
 * 방을 닫았거나 새로 열렸다) 사라진 id는 조용히 걷어낸다 — 안 그러면 화면에 보이지도 않는
 * 방이 "3개 선택됨"에 들어가 있다가 일괄 실행에서 `roomNotFound`로 실패한다.
 */
export function useRowSelection<T extends { id: string }>(rows: readonly T[]) {
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set())

  const liveIds = useMemo(() => new Set(rows.map((row) => row.id)), [rows])

  // 파생값으로 계산한다 — effect로 setState 하면 목록이 갱신될 때마다 한 프레임 동안
  // 사라진 id가 섞인 값이 화면에 나간다.
  const liveSelected = useMemo(
    () => new Set([...selected].filter((id) => liveIds.has(id))),
    [selected, liveIds],
  )

  const toggle = useCallback((id: string) => {
    setSelected((current) => {
      const next = new Set(current)
      if (!next.delete(id)) next.add(id)
      return next
    })
  }, [])

  /** 주어진 행 전체를 선택/해제한다. 하나라도 빠져 있으면 전체 선택, 이미 다 골랐으면 해제. */
  const toggleAll = useCallback((scope: readonly T[]) => {
    setSelected((current) => {
      const ids = scope.map((row) => row.id)
      const allChosen = ids.length > 0 && ids.every((id) => current.has(id))
      const next = new Set(current)
      for (const id of ids) {
        if (allChosen) next.delete(id)
        else next.add(id)
      }
      return next
    })
  }, [])

  const clear = useCallback(() => setSelected(new Set()), [])

  return {
    selectedIds: liveSelected,
    count: liveSelected.size,
    isSelected: useCallback((id: string) => liveSelected.has(id), [liveSelected]),
    toggle,
    toggleAll,
    clear,
  }
}

/** 체크박스의 3상태(전부/일부/없음) — 헤더 체크박스가 `indeterminate`를 그리는 데 쓴다. */
export function selectionState(
  scope: readonly { id: string }[],
  selectedIds: ReadonlySet<string>,
): 'none' | 'some' | 'all' {
  if (scope.length === 0) return 'none'
  const chosen = scope.filter((row) => selectedIds.has(row.id)).length
  if (chosen === 0) return 'none'
  return chosen === scope.length ? 'all' : 'some'
}
