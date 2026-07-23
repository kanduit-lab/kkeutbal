'use server'

import bcrypt from 'bcryptjs'
import type { Route } from 'next'
import { redirect } from 'next/navigation'
import { AuthError } from 'next-auth'
import { eq, or } from 'drizzle-orm'
import { z } from 'zod'
import { db, schema } from '@/lib/db'
import { signIn } from '@/lib/auth'

/**
 * 내부 계정 회원가입·로그인 form action.
 * 실패는 redirect 쿼리로 해당 페이지에 돌려준다 — 페이지는 서버 컴포넌트로 유지한다.
 */

const registerSchema = z.object({
  username: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9_]{3,20}$/, '아이디는 영문 소문자·숫자·_ 3~20자입니다'),
  password: z.string().min(8, '비밀번호는 8자 이상입니다').max(72, '비밀번호가 너무 깁니다'),
  name: z.string().trim().min(1, '이름을 입력하세요').max(20, '이름은 20자 이내입니다'),
  phone: z
    .string()
    .transform((value) => value.replace(/\D/g, ''))
    .pipe(z.string().regex(/^01[016789]\d{7,8}$/, '휴대폰 번호 형식이 올바르지 않습니다')),
})

function backTo(path: '/register' | '/login', error: string): never {
  redirect(`${path}?error=${encodeURIComponent(error)}` as Route)
}

export async function registerAndLogin(formData: FormData): Promise<void> {
  const raw = {
    username: String(formData.get('username') ?? ''),
    password: String(formData.get('password') ?? ''),
    name: String(formData.get('name') ?? ''),
    phone: String(formData.get('phone') ?? ''),
  }
  const passwordConfirm = String(formData.get('passwordConfirm') ?? '')

  const parsed = registerSchema.safeParse(raw)
  if (!parsed.success) {
    backTo('/register', parsed.error.issues[0]?.message ?? '입력값이 올바르지 않습니다')
  }
  if (parsed.data.password !== passwordConfirm) {
    backTo('/register', '비밀번호 확인이 일치하지 않습니다')
  }

  const { username, password, name, phone } = parsed.data

  const [taken] = await db
    .select({ username: schema.users.username, phone: schema.users.phone })
    .from(schema.users)
    .where(or(eq(schema.users.username, username), eq(schema.users.phone, phone)))
    .limit(1)
  if (taken) {
    backTo(
      '/register',
      taken.username === username ? '이미 사용 중인 아이디입니다' : '이미 등록된 전화번호입니다',
    )
  }

  try {
    const passwordHash = await bcrypt.hash(password, 10)
    await db.insert(schema.users).values({
      authentikSub: `local:${username}`,
      username,
      passwordHash,
      phone,
      displayName: name,
    })
  } catch (error) {
    console.error('registerAndLogin failed:', error)
    backTo('/register', '회원가입에 실패했습니다. 다시 시도하세요')
  }

  await signIn('password', { username, password, redirectTo: '/' })
}

export async function loginWithPassword(formData: FormData): Promise<void> {
  const username = String(formData.get('username') ?? '')
  const password = String(formData.get('password') ?? '')
  const next = String(formData.get('next') ?? '/')
  const redirectTo = next.startsWith('/') ? next : '/'

  try {
    await signIn('password', { username, password, redirectTo })
  } catch (error) {
    if (error instanceof AuthError) {
      backTo('/login', '아이디 또는 비밀번호가 올바르지 않습니다')
    }
    throw error
  }
}

export async function loginWithGuestToken(formData: FormData): Promise<void> {
  const code = String(formData.get('code') ?? '')
  const name = String(formData.get('name') ?? '')
  const next = String(formData.get('next') ?? '/')
  const redirectTo = next.startsWith('/') ? next : '/'

  try {
    await signIn('guest-token', { code, name, redirectTo })
  } catch (error) {
    if (error instanceof AuthError) {
      backTo('/login', '토큰이 유효하지 않거나 만료되었습니다')
    }
    throw error
  }
}
