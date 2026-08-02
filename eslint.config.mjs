import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { FlatCompat } from '@eslint/eslintrc'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const compat = new FlatCompat({ baseDirectory: __dirname })

const config = [
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
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
      'drizzle/migrations/**',
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
