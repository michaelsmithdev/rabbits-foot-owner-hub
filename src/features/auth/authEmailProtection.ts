import { normalizeEmail } from '../../shared/email/emailValidation'

type AuthEmailAction = 'confirmation' | 'password-reset'

const cooldownMilliseconds = 60_000
const lastAttemptByAction = new Map<string, number>()

export function protectAuthEmailRequest(
  action: AuthEmailAction,
  email: string,
) {
  const key = `${action}:${normalizeEmail(email)}`
  const now = Date.now()
  const lastAttempt = lastAttemptByAction.get(key) ?? 0
  const waitMilliseconds = cooldownMilliseconds - (now - lastAttempt)

  if (waitMilliseconds > 0) {
    throw new Error('Too many email attempts. Please wait a moment and try again.')
  }

  lastAttemptByAction.set(key, now)
}

export function releaseAuthEmailRequest(
  action: AuthEmailAction,
  email: string,
) {
  lastAttemptByAction.delete(`${action}:${normalizeEmail(email)}`)
}
