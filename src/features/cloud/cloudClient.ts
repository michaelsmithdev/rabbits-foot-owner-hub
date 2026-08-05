import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim()
const supabasePublishableKey =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim()
const forceLocalMode =
  import.meta.env.DEV && import.meta.env.VITE_LOCAL_MODE === 'true'

export const isCloudConfigured = Boolean(
  supabaseUrl && supabasePublishableKey && !forceLocalMode,
)

export const cloudClient = isCloudConfigured
  ? createClient(supabaseUrl, supabasePublishableKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null
