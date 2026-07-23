'use client'

import { useEffect } from 'react'

/**
 * 루트 레이아웃까지 깨졌을 때의 최후 방어선.
 * globals.css 가 없는 상태로 렌더될 수 있어 인라인 스타일로 자급자족한다.
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
          <p style={{ margin: 0, fontSize: 30 }}>🎴</p>
          <h1 style={{ margin: '12px 0 0', fontSize: 20 }}>문제가 발생했습니다</h1>
          <p style={{ margin: '8px 0 0', fontSize: 14, color: '#9db8a8' }}>
            잠시 후 다시 시도하세요.
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
            다시 시도
          </button>
        </div>
      </body>
    </html>
  )
}
