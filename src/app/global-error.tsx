'use client'

import { useEffect } from 'react'

/**
 * 루트 레이아웃까지 깨졌을 때의 최후 방어선.
 * globals.css 도 I18nProvider 도 없는 상태로 렌더될 수 있어 인라인 스타일 + 고정 문구로 자급자족한다.
 *
 * 색상 리터럴은 globals.css `@theme` 토큰의 사본이다 — 토큰을 바꾸면 여기도 함께 고쳐야 한다.
 * `#071d15` = --color-bg-deep, `#123527` = --color-surface, `#f4efe2` = --color-text,
 * `#9db8a8` = --color-muted, `#d8433f` = --color-accent, `rgb(229 185 84 / …)` = --color-gold.
 *
 * 사전을 못 읽으므로 로케일을 고를 수 없다 — 한국어·영어를 함께 적고 각 블록에 lang 을 달아
 * 스크린리더가 영어 사용자에게 한국어를 읽지 않게 한다.
 */
export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    console.error(error.digest ?? error)
  }, [error])

  return (
    <html lang="ko">
      <body
        style={{
          margin: 0,
          minHeight: '100dvh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '0 24px',
          backgroundColor: '#071d15',
          color: '#f4efe2',
          fontFamily:
            "'Pretendard', 'Malgun Gothic', 'Apple SD Gothic Neo', 'Noto Sans KR', system-ui, sans-serif",
        }}
      >
        <div
          style={{
            width: '100%',
            maxWidth: 384,
            padding: '32px 20px',
            textAlign: 'center',
            backgroundColor: '#123527',
            border: '1px solid rgb(229 185 84 / 0.14)',
            borderRadius: 16,
          }}
        >
          <p aria-hidden style={{ margin: 0, fontSize: 30 }}>
            🎴
          </p>
          <h1 style={{ margin: '12px 0 0', fontSize: 20 }}>문제가 생겼어요</h1>
          <p style={{ margin: '4px 0 0', fontSize: 20 }} lang="en">
            Something went wrong
          </p>
          <p style={{ margin: '8px 0 0', fontSize: 14, color: '#9db8a8' }}>
            잠시 후 다시 시도해 주세요.
          </p>
          <p style={{ margin: '2px 0 0', fontSize: 14, color: '#9db8a8' }} lang="en">
            Please try again in a moment.
          </p>
          <button
            type="button"
            onClick={() => location.reload()}
            style={{
              marginTop: 20,
              minHeight: 48,
              width: '100%',
              border: 'none',
              borderRadius: 12,
              backgroundColor: '#d8433f',
              color: '#ffffff',
              fontSize: 16,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            다시 시도 · Try again
          </button>
        </div>
      </body>
    </html>
  )
}
