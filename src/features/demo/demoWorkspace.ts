import type { Session } from '@supabase/supabase-js'

const DEMO_TUTORIAL_PENDING_PREFIX = 'owner-hub-demo-tutorial-pending'

export function isDemoSession(session: Session | null) {
  return session?.user.user_metadata?.is_demo === true
}

export function markDemoTutorialPending(session: Session | null) {
  if (!session || !isDemoSession(session)) return

  try {
    sessionStorage.setItem(
      `${DEMO_TUTORIAL_PENDING_PREFIX}:${session.user.id}`,
      'true',
    )
  } catch {
    // The tutorial remains available from Settings when session storage is blocked.
  }
}

export function consumeDemoTutorialPending(userScope: string) {
  try {
    const key = `${DEMO_TUTORIAL_PENDING_PREFIX}:${userScope}`
    const shouldStart = sessionStorage.getItem(key) === 'true'
    if (shouldStart) sessionStorage.removeItem(key)
    return shouldStart
  } catch {
    return false
  }
}
