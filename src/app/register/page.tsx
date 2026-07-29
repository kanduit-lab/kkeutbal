import Link from 'next/link'
import { redirect } from 'next/navigation'
import { hasRegistrationAccess } from '@/features/auth/registration-access'
import { isFirstAccount } from '@/features/auth/bootstrap'
import { Alert, PageShell } from '@/components/ui'
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
    <PageShell width="narrow" center>
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
    </PageShell>
  )
}
