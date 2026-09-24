import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

/** False in any build that never got Supabase credentials — sync UI hides itself. */
export const syncEnabled = Boolean(url && anonKey)

/**
 * Sign-in and sync are entirely opt-in: a build with no env vars (or a user
 * who never signs in) never makes a network call here. Everything else in
 * DECK stays exactly as local-first as before.
 */
export const supabase = syncEnabled
  ? createClient(url as string, anonKey as string, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    })
  : null
