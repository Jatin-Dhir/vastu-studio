import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export const SUPABASE_URL: string = (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? ''
export const SUPABASE_ANON_KEY: string = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ?? ''

/** No project configured → the app runs open, exactly as before accounts existed. */
export const AUTH_ENABLED = SUPABASE_URL.length > 0 && SUPABASE_ANON_KEY.length > 0

let client: SupabaseClient | null = null
export function supabase(): SupabaseClient {
  if (!client) {
    client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
    })
  }
  return client
}
