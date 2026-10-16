const blockedEmailValues = new Set([
  'n/a',
  'na',
  'none',
  'no email',
  'unknown',
  'test',
])

const emailPattern = /^[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?(?:\.[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?)+$/i

export const INVALID_EMAIL_MESSAGE =
  'Enter a valid email address before continuing.'

export function normalizeEmail(value: unknown) {
  return typeof value === 'string' ? value.trim().toLowerCase() : ''
}

export function isValidEmailAddress(value: unknown) {
  const email = normalizeEmail(value)
  if (!email || email.length > 254 || /\s/.test(email)) return false
  if (blockedEmailValues.has(email)) return false
  if ((email.match(/@/g) ?? []).length !== 1) return false

  const [localPart, domain] = email.split('@')
  if (!localPart || localPart.length > 64 || !domain || domain.length > 253) {
    return false
  }
  if (localPart.startsWith('.') || localPart.endsWith('.') || localPart.includes('..')) {
    return false
  }

  return emailPattern.test(email)
}

export function validateOptionalEmail(value: unknown) {
  const email = normalizeEmail(value)
  return {
    email,
    valid: !email || isValidEmailAddress(email),
  }
}

export function requireValidEmail(value: unknown) {
  const email = normalizeEmail(value)
  if (!isValidEmailAddress(email)) throw new Error(INVALID_EMAIL_MESSAGE)
  return email
}

export function isPotentialTestEmail(value: unknown) {
  const email = normalizeEmail(value)
  if (!email) return false
  return /(?:^|[._+-])(test|fake|demo)(?:[._+-]|@)/i.test(email) ||
    /@(example\.(?:com|net|org)|invalid|localhost)$/i.test(email)
}
