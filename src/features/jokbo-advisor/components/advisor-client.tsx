'use client'

import { FixedPage, PageHeader } from '@/components/ui'
import { LocaleSwitcher } from '@/components/locale-switcher'
import { useDict } from '@/lib/i18n/client'
import { AdvisorBoard } from './advisor-board'

/** `/advisor` 라우트 껍데기. 판독기 본문은 방 안 시트와 공유한다 — `AdvisorBoard`. */
export function AdvisorClient({ visionEnabled }: { visionEnabled: boolean }) {
  const { d } = useDict()
  return (
    <FixedPage width="wide" className="gap-4">
      <PageHeader
        className="rise-in mb-0 shrink-0"
        title={d.home.advisor}
        backHref="/"
        backLabel={d.common.home}
        actions={<LocaleSwitcher />}
      />
      <AdvisorBoard visionEnabled={visionEnabled} />
    </FixedPage>
  )
}
