import nextVitals from 'eslint-config-next/core-web-vitals'
import nextTs from 'eslint-config-next/typescript'

// eslint-config-next 16은 flat config를 직접 export한다. 예전처럼 FlatCompat로 eslintrc
// 형식을 감싸면 react 플러그인의 순환 참조에 걸려 lint가 아예 뜨지 않는다.
const config = [
  ...nextVitals,
  ...nextTs,
  {
    ignores: [
      '.next/**',
      'node_modules/**',
      'coverage/**',

      '.qa-reports/**',
      '.playwright-mcp/**',
      // `.claude/`는 .gitignore 대상이지만 eslint flat config 는 .gitignore 를 읽지 않는다.
      // 여기 안에 git worktree 가 생기면 저장소 전체 사본이 통째로 lint 대상이 돼서,
      // 소스가 멀쩡한데도 수천 건 에러가 쏟아지고 진짜 문제가 묻힌다.
      '.claude/**',
      'database/migrations/**',
      'next-env.d.ts',
    ],
  },
  {
    rules: {
      'no-console': ['error', { allow: ['warn', 'error'] }],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
]

export default config
