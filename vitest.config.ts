import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
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
