const productionOrigins = new Set([
  'https://rabbits-foot-owner-hub.vercel.app',
])

function configuredOrigins() {
  return (process.env.OWNER_HUB_ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim().replace(/\/$/, ''))
    .filter(Boolean)
}

export function isAllowedOrigin(origin) {
  if (!origin) return true

  try {
    const url = new URL(origin)
    const normalized = origin.replace(/\/$/, '')
    const isLocalApp =
      url.hostname === 'localhost' ||
      url.hostname === '127.0.0.1' ||
      url.protocol === 'capacitor:'

    return (
      isLocalApp ||
      productionOrigins.has(normalized) ||
      configuredOrigins().includes(normalized)
    )
  } catch {
    return false
  }
}

export function applyCors(request, response, methods) {
  const origin = request.headers.origin
  if (!isAllowedOrigin(origin)) return false

  if (origin) response.setHeader('Access-Control-Allow-Origin', origin)
  response.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-Owner-Hub-Organization')
  response.setHeader('Access-Control-Allow-Methods', methods)
  response.setHeader('Vary', 'Origin')
  return true
}

export function requestedOrganizationId(request) {
  const value = request.headers['x-owner-hub-organization']
  const organizationId = Array.isArray(value) ? value[0] : value
  return typeof organizationId === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(organizationId)
    ? organizationId
    : null
}
