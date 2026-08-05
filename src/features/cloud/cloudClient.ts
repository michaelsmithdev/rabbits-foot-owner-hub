import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim()
const supabasePublishableKey =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim()
const forceLocalMode =
  import.meta.env.DEV && import.meta.env.VITE_LOCAL_MODE === 'true'

const hasCloudConfiguration = Boolean(
  supabaseUrl && supabasePublishableKey && !forceLocalMode,
)

function createCloudClient() {
  if (!hasCloudConfiguration) return null

  try {
    return createClient(supabaseUrl, supabasePublishableKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  } catch (error) {
    console.error('Cloud client could not be initialized.', error)
    return null
  }
}

export const cloudClient = createCloudClient()
export const isCloudConfigured = cloudClient !== null
