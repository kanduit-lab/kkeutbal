import 'server-only'

import { EnvironmentConfigurationError } from './env'

type DatabaseModule = Awaited<typeof import('./db')>

let databaseModule: Promise<DatabaseModule> | undefined
let reportedUnavailable = false

export async function getOptionalDatabase(): Promise<DatabaseModule | null> {
  try {
    return await (databaseModule ??= import('./db'))
  } catch (error) {
    if (error instanceof EnvironmentConfigurationError) throw error
    if (!reportedUnavailable) {
      reportedUnavailable = true
      const message = error instanceof Error ? error.message : String(error)
      console.warn(`Optional database unavailable; public fallback is active: ${message}`)
    }
    return null
  }
}
