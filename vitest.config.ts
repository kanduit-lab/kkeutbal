import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  test: {
    // 기본은 node — 순수 함수 엔진 테스트(섯다·고스톱·포커 등)는 DOM이 필요 없고 node가 더 빠르다.
    // 컴포넌트 렌더링이 필요한 테스트만 test/dom/** 아래에 두면 jsdom으로 갈아탄다
    // (environmentMatchGlobs는 파일별로 분기하므로 기존 node 테스트는 영향받지 않는다).
    // test/dom/**은 아직 비어 있다 — jsdom·@testing-library/react가 설치된 뒤 쓸 자리다.
    environment: 'node',
    environmentMatchGlobs: [['test/dom/**', 'jsdom']],
    // node 환경 테스트에는 영향 없다(setup.ts가 `typeof window`로 가드한다) — jsdom 테스트에만
    // ResizeObserver 스텁을 깔아준다(자세한 이유는 test/dom/setup.ts 참고).
    setupFiles: ['test/dom/setup.ts'],
    include: [
      'src/**/*.test.ts',
      'src/**/*.test.tsx',
      'test/**/*.test.ts',
      'test/**/*.test.tsx',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],

      include: [
        'src/features/auth/phone.ts',
        'src/features/game/components/shared.ts',
        'src/features/gostop/{scoring,types}.ts',
        'src/features/hwatu/cards.ts',
        'src/features/poker/{cards,engine}.ts',
        'src/features/promotions/dismissal.ts',
        'src/features/ranking/settlement.ts',
        'src/features/seotda/{advice,engine,types}.ts',
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 75,
        statements: 80,
      },
    },
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})
