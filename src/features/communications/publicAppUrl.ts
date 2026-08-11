const PRODUCTION_PUBLIC_APP_URL = 'https://rabbits-foot-owner-hub.vercel.app'

function isSafePublicUrl(value: string) {
  try {
    const url = new URL(value)
    return (
      url.protocol === 'https:' &&
      url.hostname !== 'localhost' &&
      url.hostname !== '127.0.0.1'
    )
  } catch {
    return false
  }
}

export function getPublicAppUrl() {
  const configuredUrl = import.meta.env.VITE_PUBLIC_PORTAL_URL?.trim()

  return configuredUrl && isSafePublicUrl(configuredUrl)
    ? configuredUrl.replace(/\/$/, '')
    : PRODUCTION_PUBLIC_APP_URL
}

export function buildCustomerPortalUrl(portalToken: string) {
  return `${getPublicAppUrl()}/#portal/${encodeURIComponent(portalToken)}`
}

export function isSafeCustomerFacingUrl(value: string) {
  if (!isSafePublicUrl(value)) return false

  try {
    const candidate = new URL(value)
    const publicApp = new URL(getPublicAppUrl())

    return (
      candidate.origin === publicApp.origin &&
      candidate.pathname === `${publicApp.pathname.replace(/\/$/, '') || ''}/`
    )
  } catch {
    return false
  }
}
