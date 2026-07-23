'use client'

import { useEffect, useState } from 'react'
import { format, useDict } from '@/lib/i18n/client'

/** 인사말이 바뀌는 간격. 판 옆에서 흘깃 보는 화면이라 자주 바뀌면 산만하다. */
const ROTATE_MS = 8000

/**
 * 홈 인사말 — 사전에 등록된 프리셋을 돌아가며 보여준다.
 *
 * 시작 인덱스는 서버가 골라 prop 으로 넘긴다. 클라이언트에서 뽑으면 서버 렌더 결과와
 * 달라져 hydration 이 깨지기 때문이다. 교체할 때마다 key 를 바꿔 등장 애니메이션을
 * 다시 태운다 (prefers-reduced-motion 이면 globals.css 가 애니메이션만 끈다).
 */
export function GreetingRotator({ name, initialIndex }: { name: string; initialIndex: number }) {
  const { d } = useDict()
  const greetings = Object.values(d.home.greetings)
  const [index, setIndex] = useState(initialIndex)

  useEffect(() => {
    if (greetings.length <= 1) return
    const timer = window.setInterval(
      () => setIndex((previous) => (previous + 1) % greetings.length),
      ROTATE_MS,
    )
    return () => window.clearInterval(timer)
  }, [greetings.length])

  const template = greetings[index % greetings.length] ?? greetings[0]
  if (!template) return null

  return (
    <p key={index} className="greeting-in mt-2 text-muted">
      {format(template, { name })}
    </p>
  )
}
