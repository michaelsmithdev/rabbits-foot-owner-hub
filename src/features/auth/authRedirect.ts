import { getPublicAppUrl } from '../communications/publicAppUrl'

export type AuthRedirectIntent = 'confirm' | 'recovery'

export function getAuthRedirectUrl(intent: AuthRedirectIntent) {
  const redirectUrl = new URL(`${getPublicAppUrl()}/`)
  redirectUrl.searchParams.set('auth', intent)
  return redirectUrl.toString()
}

export function getAuthRedirectError() {
  const query = new URLSearchParams(window.location.search)
  const fragment = new URLSearchParams(window.location.hash.replace(/^#/, ''))
  const rawError =
    fragment.get('error_description') ??
    fragment.get('error') ??
    query.get('error_description') ??
    query.get('error')

  if (!rawError) return ''

  const message = rawError.replace(/\+/g, ' ').trim()
  if (/expired/i.test(message)) {
    return 'This email link has expired. Enter your email below and request a new confirmation link.'
  }

  return message
}

export function clearCompletedAuthRedirect() {
  const url = new URL(window.location.href)
  const isAuthRedirect =
    url.searchParams.has('auth') ||
    /(?:^|&)(?:access_token|refresh_token|token_type|expires_in)=/.test(url.hash.slice(1))

  if (!isAuthRedirect) return

  url.searchParams.delete('auth')
  url.hash = ''
  window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}`)
}
