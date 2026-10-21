import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ShareResultButton } from '@/features/ranking/components/share-result-button'
import { ko, renderWithProviders } from './render-helpers'

/**
 * 결과 공유(src/features/ranking/components/share-result-button.tsx).
 *
 * 예전에는 버튼 하나가 `navigator.share`를 먼저 시도하고, 없으면 **말없이** 클립보드로
 * 떨어졌다. 그래서 share를 지원하지 않는 데스크톱에서는 "결과 공유"를 눌렀는데 공유 시트
 * 대신 토스트만 떴다. 지금은 복사와 공유가 각자의 버튼이고, 공유 버튼은 실제로 쓸 수 있을
 * 때만 나타난다.
 */

const STANDINGS = [
  { displayName: '아빠', net: 1_200 },
  { displayName: '엄마', net: -400 },
  { displayName: '동생', net: -800 },
]
const TRANSFERS = [{ fromName: '동생', toName: '아빠', amount: 800 }]

function renderButton() {
  return renderWithProviders(
    <ShareResultButton roomName="가족 한판" standings={STANDINGS} transfers={TRANSFERS} />,
  )
}

const copyButton = () => screen.getByRole('button', { name: new RegExp(ko.result.copy) })

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('결과 공유 — 복사', () => {
  let written: string[]

  beforeEach(() => {
    written = []
    vi.stubGlobal('navigator', {
      clipboard: {
        writeText: (text: string) => {
          written.push(text)
          return Promise.resolve()
        },
      },
    })
  })

  it('순위와 정산 이체를 사람이 읽을 수 있는 텍스트로 복사한다', async () => {
    renderButton()
    fireEvent.click(copyButton())

    await waitFor(() => expect(written).toHaveLength(1))
    const text = written[0]!

    expect(text).toContain('가족 한판')
    // 순위는 메달 → 이름 → 부호 붙은 손익 순
    expect(text).toContain('🥇 아빠 +1,200')
    expect(text).toContain('🥈 엄마 -400')
    expect(text).toContain('🥉 동생 -800')
    // 정산 이체가 있으면 그 구간도 함께
    expect(text).toContain(ko.result.shareSettlement)
    expect(text).toContain('동생 → 아빠 800')
  })

  it('복사에 성공하면 성공 토스트를 띄운다', async () => {
    renderButton()
    fireEvent.click(copyButton())
    expect(await screen.findByText(ko.result.copied)).toBeTruthy()
  })

  it('복사에 실패하면 실패를 알린다 — 조용히 넘어가지 않는다', async () => {
    vi.stubGlobal('navigator', {
      clipboard: {
        writeText: () => Promise.reject(new Error('denied')),
      },
    })
    // execCommand 폴백까지 막아 완전한 실패를 만든다
    vi.stubGlobal('document', document)
    document.execCommand = () => false

    renderButton()
    fireEvent.click(copyButton())
    expect(await screen.findByText(ko.result.copyFailed)).toBeTruthy()
  })
})

describe('결과 공유 — 공유 동작', () => {
  it('navigator.share가 없으면 공유 버튼을 아예 그리지 않는다', () => {
    vi.stubGlobal('navigator', { clipboard: { writeText: () => Promise.resolve() } })
    renderButton()

    expect(screen.queryByRole('button', { name: new RegExp(ko.result.share) })).toBeNull()
    expect(copyButton()).toBeTruthy()
  })

  it('navigator.share가 있으면 공유 버튼이 나타나고 결과 텍스트를 넘긴다', async () => {
    const shared: Array<Record<string, unknown>> = []
    vi.stubGlobal('navigator', {
      share: (data: Record<string, unknown>) => {
        shared.push(data)
        return Promise.resolve()
      },
      clipboard: { writeText: () => Promise.resolve() },
    })

    renderButton()
    const shareButton = await screen.findByRole('button', { name: new RegExp(ko.result.share) })
    fireEvent.click(shareButton)

    await waitFor(() => expect(shared).toHaveLength(1))
    expect(shared[0]!.title).toBe('가족 한판 결과')
    expect(String(shared[0]!.text)).toContain('🥇 아빠 +1,200')
  })

  it('공유 시트를 사용자가 닫으면(AbortError) 실패로 취급하지 않는다', async () => {
    vi.stubGlobal('navigator', {
      share: () => Promise.reject(new DOMException('cancelled', 'AbortError')),
      clipboard: { writeText: () => Promise.resolve() },
    })

    renderButton()
    fireEvent.click(await screen.findByRole('button', { name: new RegExp(ko.result.share) }))

    await waitFor(() =>
      expect((screen.getByRole('button', { name: new RegExp(ko.result.share) }) as HTMLButtonElement).disabled).toBe(false),
    )
    expect(screen.queryByText(ko.result.shareFailed)).toBeNull()
  })
})
