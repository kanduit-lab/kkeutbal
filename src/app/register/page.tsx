import Link from 'next/link'
import { registerAndLogin } from '@/features/auth/actions'
import { Button, Field, Input, Panel } from '@/components/ui'

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const { error } = await searchParams

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-5 px-6 py-10">
      <header className="text-center">
        <h1 className="font-brush text-4xl font-black">회원가입</h1>
        <p className="mt-2 text-sm text-muted">
          아이디·비밀번호·이름·전화번호만으로 만듭니다. SSO 로그인 시 같은 아이디나
          전화번호면 자동으로 연동됩니다
        </p>
      </header>

      {error ? (
        <p className="rounded-xl border border-accent/30 bg-[#471a17] px-4 py-3 text-sm font-medium text-[#ff9a94]">
          {error}
        </p>
      ) : null}

      <Panel>
        <form className="space-y-4" action={registerAndLogin}>
          <Field label="아이디">
            <Input
              name="username"
              placeholder="영문 소문자·숫자·_ 3~20자"
              maxLength={20}
              required
              autoComplete="username"
              autoCapitalize="off"
            />
          </Field>
          <Field label="비밀번호">
            <Input
              name="password"
              type="password"
              placeholder="8자 이상"
              minLength={8}
              maxLength={72}
              required
              autoComplete="new-password"
            />
          </Field>
          <Field label="비밀번호 확인">
            <Input
              name="passwordConfirm"
              type="password"
              minLength={8}
              maxLength={72}
              required
              autoComplete="new-password"
            />
          </Field>
          <Field label="이름">
            <Input name="name" placeholder="판에서 보일 이름" maxLength={20} required />
          </Field>
          <Field label="전화번호">
            <Input
              name="phone"
              type="tel"
              placeholder="01012345678"
              maxLength={13}
              required
              autoComplete="tel"
              inputMode="numeric"
            />
          </Field>
          <Button type="submit" variant="primary" size="lg" className="w-full">
            가입하고 시작
          </Button>
        </form>
      </Panel>

      <p className="text-center text-sm text-muted">
        이미 계정이 있다면{' '}
        <Link href="/login" className="font-bold text-text underline underline-offset-4">
          로그인
        </Link>
      </p>
    </main>
  )
}
