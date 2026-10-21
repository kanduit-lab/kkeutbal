export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === 'edge') return

  const { assertRuntimeEnv } = await import('./lib/env')
  assertRuntimeEnv()
}
