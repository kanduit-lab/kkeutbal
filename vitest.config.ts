import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

const alias = {
  '@': fileURLToPath(new URL('./src', import.meta.url)),
}

const include = ['src/**/*.test.ts', 'src/**/*.test.tsx', 'tests/**/*.test.ts', 'tests/**/*.test.tsx']

export default defineConfig({
  // 순수 함수 엔진 테스트(섯다·고스톱 등)는 DOM이 필요 없고 node가 더 빠르다. 컴포넌트
  // 렌더링이 필요한 테스트만 tests/dom/** 아래에 두고 jsdom으로 돈다.
  test: {
    projects: [
      {
        resolve: { alias },
        test: {
          name: 'node',
          environment: 'node',
          setupFiles: ['tests/dom/setup.ts'],
          include,
          exclude: ['tests/dom/**'],
        },
      },
      {
        resolve: { alias },
        test: {
          name: 'dom',
          environment: 'jsdom',
          setupFiles: ['tests/dom/setup.ts'],
          include: ['tests/dom/**/*.test.{ts,tsx}'],
        },
      },
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],

      include: [
        'src/features/auth/phone.ts',
        'src/features/game/components/shared.ts',
        'src/features/gostop/{scoring,types}.ts',
        'src/features/hwatu/cards.ts',
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
  resolve: { alias },
})
