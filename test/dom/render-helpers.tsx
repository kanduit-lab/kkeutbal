import { render } from '@testing-library/react'
import type { ReactElement } from 'react'
import { I18nProvider } from '@/lib/i18n/client'
import { ToastProvider } from '@/components/ui'
import { ko } from '@/lib/i18n/dictionaries/ko'

/**
 * `src/features/game/components/**`의 컴포넌트는 대부분 `useDict()`(I18nProvider)와
 * `useToast()`(ToastProvider) 컨텍스트를 요구한다 — 둘 다 없으면 `must be used within
 * ...Provider` 에러로 렌더 자체가 실패한다. 실제 `RootLayout`(`src/app/layout.tsx`)이 앱
 * 전체를 감싸는 순서(I18nProvider → ToastProvider)를 그대로 따른다.
 *
 * 로케일은 `ko`로 고정한다 — 프로젝트 도메인 용어(끗·땡·고/스톱 등)가 번역 대상이 아니듯,
 * 이 테스트들도 실제 사용자가 보는 한국어 사전 문구를 그대로 검증한다(en 사전은 대상 밖).
 */
export function renderWithProviders(ui: ReactElement) {
  return render(
    <I18nProvider locale="ko" dict={ko}>
      <ToastProvider closeLabel={ko.common.close}>{ui}</ToastProvider>
    </I18nProvider>,
  )
}

export { ko }
