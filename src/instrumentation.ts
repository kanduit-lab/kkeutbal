export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === 'edge') return

  const { assertRuntimeEnv, serverEnv } = await import('./lib/env')
  assertRuntimeEnv()

  if (serverEnv().REALTIME_MODE === 'self') {
    const { initializeRealtimeListener } = await import('./lib/realtime/server-channel')
    await initializeRealtimeListener()
  }
}
