const DEFAULT_PUBLIC_URL = 'https://rabbits-foot-owner-hub.vercel.app'

function safeHttpsUrl(value) {
  if (!value) return null

  try {
    const url = new URL(value)
    if (
      url.protocol !== 'https:' ||
      url.hostname === 'localhost' ||
      url.hostname === '127.0.0.1'
    ) {
      return null
    }

    return url.origin
  } catch {
    return null
  }
}

export function getPublicAppUrl(request) {
  const configured = safeHttpsUrl(process.env.OWNER_HUB_PUBLIC_URL?.trim())
  if (configured) return configured

  const origin = Array.isArray(request?.headers.origin)
    ? request.headers.origin[0]
    : request?.headers.origin

  return safeHttpsUrl(origin) ?? DEFAULT_PUBLIC_URL
}

export function buildCustomerPortalUrl(token, request) {
  return `${getPublicAppUrl(request)}/#portal/${encodeURIComponent(token)}`
}
