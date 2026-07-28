'use client'

import { createBrowserClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'
import { clientEnv } from '../env'

let cached: SupabaseClient | null = null

export function getSupabaseBrowser(): SupabaseClient {
  if (cached) return cached
  const env = clientEnv()
  cached = createBrowserClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
  )
  return cached
}