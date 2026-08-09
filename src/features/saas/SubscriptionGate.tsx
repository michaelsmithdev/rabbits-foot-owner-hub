import type { ReactNode } from 'react'

import { subscriptionIsUsable } from './planCatalog'
import { useSaas } from './saasContext'
import BusinessWorkspace from './pages/BusinessWorkspace'

export default function SubscriptionGate({ children }: { children: ReactNode }) {
  const { subscription } = useSaas()
  if (!subscription || subscriptionIsUsable(subscription.status, subscription.trialEndsAt)) return children
  return <BusinessWorkspace />
}

