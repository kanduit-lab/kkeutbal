import { ButtonLink, Panel } from '@/components/ui'

/** 앱 공통 404 — 프레임워크 기본 화면 대신 홈으로 돌아갈 동선을 준다. */
export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-4 px-6">
      <Panel className="space-y-3 py-8 text-center">
        <p className="text-3xl">🎴</p>
        <h1 className="text-xl font-bold">페이지를 찾을 수 없습니다</h1>
        <p className="text-sm text-muted">주소를 확인하거나 홈에서 다시 시작하세요.</p>
        <div className="pt-2">
          <ButtonLink href="/" variant="primary" className="w-full">
            홈으로
          </ButtonLink>
        </div>
      </Panel>
    </main>
  )
}
