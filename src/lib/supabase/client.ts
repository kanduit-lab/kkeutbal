'use client'

import { createBrowserClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'

let cached: SupabaseClient | null = null
let cachedConfig: SupabaseBrowserConfig | null = null

export interface SupabaseBrowserConfig {
  readonly url: string
  readonly publishableKey: string
}

export function getSupabaseBrowser(config: SupabaseBrowserConfig): SupabaseClient {
  if (cached) {
    if (cachedConfig?.url !== config.url || cachedConfig.publishableKey !== config.publishableKey) {
      throw new Error('Supabase browser client was already initialized with another runtime config')
    }
    return cached
  }
  cachedConfig = config
  cached = createBrowserClient(config.url, config.publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  return cached
}

export function disconnectSupabaseBrowser(): void {
  cached?.realtime.disconnect()
}
