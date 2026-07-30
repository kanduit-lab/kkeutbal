import Link from 'next/link'
import { redirect } from 'next/navigation'
import { hasRegistrationAccess } from '@/features/auth/registration-access'
import { isFirstAccount } from '@/features/auth/bootstrap'
import { Alert, FixedBody, FixedPage, ScrollPane } from '@/components/ui'
import { RegisterForm } from '@/features/auth/components/register-form'
import { getDict } from '@/lib/i18n/server'

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{
    error?: string
    username?: string
    name?: string
    next?: string
    invalid?: string
  }>
}) {
  const [accessGranted, { error, username, name, next, invalid }, { d }, firstAccount] =
    await Promise.all([hasRegistrationAccess(), searchParams, getDict(), isFirstAccount()])
  if (!accessGranted) {
    redirect(
      firstAccount
        ? '/login?error=initial_admin_setup_required&mode=registration'
        : '/login?error=registration_code_required',
    )
  }

  const redirectTo = next && next.startsWith('/') && !next.startsWith('//') ? next : '/'

  return (
    <FixedPage width="narrow">
      <FixedBody>
        {/*
          가입 폼은 아이디·비밀번호·비밀번호 확인·이름·전화번호 5개 필수 입력 +
          제출 버튼으로 구성되어 있어 라벨·에러 메시지를 포함하면 375x667(iPhone SE급)은
          물론 1280x720(desktop-chromium 기본 뷰포트)에서도 한 화면에 다 들어가지 않는다.
          PageShell의 `center`(뷰포트 중앙 정렬)를 유지한 채 폰트·여백을 줄이면 라벨이
          읽기 힘들어지므로, 문서 스크롤 대신 이 안쪽 ScrollPane 하나만 스크롤되게 해
          `expectNoDocumentScroll` 불변식(docs/12-handoff.md 11번)을 지킨다.
        */}
        <ScrollPane label={d.auth.registerTitle}>
          <header className="mb-5 text-center">
            <h1 className="font-brush text-4xl font-black">{d.auth.registerTitle}</h1>
          </header>
          {firstAccount ? (
            <Alert tone="warn" className="mb-5">
              {d.auth.firstAccountNotice}
            </Alert>
          ) : null}

          <RegisterForm
            error={error}
            username={username}
            name={name}
            invalid={invalid}
            redirectTo={redirectTo}
          />

          <p className="mt-5 text-center text-sm text-muted">
            {d.auth.haveAccount}{' '}
            <Link href="/login" className="font-bold text-text underline underline-offset-4">
              {d.auth.loginLink}
            </Link>
          </p>
        </ScrollPane>
      </FixedBody>
    </FixedPage>
  )
}
