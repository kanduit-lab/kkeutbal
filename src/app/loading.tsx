import { PageShell, Spinner } from '@/components/ui'
import { getDict } from '@/lib/i18n/server'

/**
 * 앱 전역 로딩 폴백. 자체 loading.tsx 가 없는 모든 하위 세그먼트가 이걸 쓴다 —
 * 그래서 특정 화면 모양을 흉내내면 안 된다. 예전에는 홈 전용 스켈레톤이라
 * /wallet·/advisor 등이 "방 코드 입력창 + 바로가기 3칸" 골격으로 깜빡였다.
 */
export default async function Loading() {
  const { d } = await getDict()

  return (
    <PageShell width="content" center>
      {/* Spinner 가 role="status" 와 라벨을 이미 들고 있다 — 중첩 라이브 리전을 만들지 않는다. */}
      <div className="flex justify-center py-16">
        <Spinner label={d.loading.default} />
      </div>
    </PageShell>
  )
}
