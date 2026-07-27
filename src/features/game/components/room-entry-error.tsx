import { ButtonLink, Panel } from '@/components/ui'

/**
 * 방 진입 실패 화면 — 방 없음 · 입장 거절 · 스냅샷 실패를 같은 모양으로 그린다.
 *
 * 형제 라우트들이 같은 "방 없음" 조건에 인라인 패널 / 홈 리다이렉트 / 무성 리다이렉트 /
 * notFound() 로 제각각 반응하고 있었다. 여기가 한 가지 표면이고, 리다이렉트를 택한
 * 라우트는 최소한 `?error=errors.roomNotFound` 를 실어 홈에서 사유가 보이게 한다.
 *
 * 문구는 전부 호출부가 사전에서 넘긴다 — 이 컴포넌트에는 하드코딩 문자열이 없다.
 */
export function RoomEntryError({
  title,
  hint,
  homeLabel,
}: {
  title: string
  hint: string
  homeLabel: string
}) {
  return (
    <main
      id="main"
      className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-4 px-6"
    >
      <Panel className="space-y-3 py-8 text-center">
        <p className="text-3xl" aria-hidden>
          🎴
        </p>
        <h1 className="text-xl font-bold">{title}</h1>
        <p className="text-sm text-muted">{hint}</p>
        <div className="pt-2">
          {/* Link 안에 Button 을 중첩하면 <a><button> 이 되어 탭 스톱이 둘로 늘고
              스크린리더가 "링크, 버튼"으로 읽는다 — ButtonLink 가 그 자리다. */}
          <ButtonLink href="/" variant="primary" className="w-full">
            {homeLabel}
          </ButtonLink>
        </div>
      </Panel>
    </main>
  )
}
