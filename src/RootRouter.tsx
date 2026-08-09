import { useEffect, useState } from 'react'

import App from './App.tsx'
import { AuthGate } from './features/auth/AuthGate.tsx'
import { AuthProvider } from './features/auth/AuthProvider.tsx'
import { CloudSyncProvider } from './features/cloud/CloudSyncProvider.tsx'
import LegalCenter, { type LegalView } from './features/legal/LegalCenter.tsx'
import PublicCustomerPortal from './features/portal/PublicCustomerPortal.tsx'
import PwaLifecycle from './features/pwa/components/PwaLifecycle.tsx'
import InviteAcceptance from './features/saas/InviteAcceptance.tsx'
import { SaasProvider } from './features/saas/SaasProvider.tsx'
import SubscriptionGate from './features/saas/SubscriptionGate.tsx'

const legalViews = new Set<LegalView>(['privacy', 'terms', 'delete-account', 'support'])

export default function RootRouter() {
  const [hash, setHash] = useState(window.location.hash)

  useEffect(() => {
    const handleHashChange = () => setHash(window.location.hash)
    window.addEventListener('hashchange', handleHashChange)
    return () => window.removeEventListener('hashchange', handleHashChange)
  }, [])

  const portalToken = hash.startsWith('#portal/')
    ? decodeURIComponent(hash.slice('#portal/'.length))
    : ''
  const inviteToken = hash.startsWith('#invite/')
    ? decodeURIComponent(hash.slice('#invite/'.length))
    : ''
  const requestedPublicView = hash.replace('#', '') as LegalView
  const legalView = legalViews.has(requestedPublicView) ? requestedPublicView : null

  if (portalToken) return <PublicCustomerPortal token={portalToken} />
  if (legalView) return <LegalCenter view={legalView} />

  return (
    <AuthProvider>
      <AuthGate>
        <SaasProvider>
          {inviteToken ? <InviteAcceptance token={inviteToken} /> : (
            <CloudSyncProvider>
              <SubscriptionGate><App /></SubscriptionGate>
              <PwaLifecycle />
            </CloudSyncProvider>
          )}
        </SaasProvider>
      </AuthGate>
    </AuthProvider>
  )
}
