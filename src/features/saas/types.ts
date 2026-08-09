export type OrganizationRole = 'owner' | 'admin' | 'member'
export type SubscriptionPlan = 'starter' | 'pro' | 'team'
export type SubscriptionStatus = 'trialing' | 'active' | 'past_due' | 'canceled' | 'paused'

export type OrganizationWorkspace = {
  id: string
  name: string
  slug: string
  logoUrl: string | null
  accentColor: string
  onboardingCompletedAt: string | null
}

export type WorkspaceSubscription = {
  plan: SubscriptionPlan
  status: SubscriptionStatus
  trialEndsAt: string | null
  currentPeriodEndsAt: string | null
  cancelAtPeriodEnd: boolean
}

export type WorkspaceIntegration = {
  provider: 'square' | 'quickbooks' | 'google_calendar'
  status: 'disconnected' | 'pending' | 'connected' | 'error'
  merchantId: string | null
  locationId: string | null
  connectedAt: string | null
  lastError: string | null
}

export type WorkspaceMember = {
  userId: string
  role: OrganizationRole
  displayName: string
  email: string
  joinedAt: string
}

export type UsageSummary = {
  aiEstimates: number
  transcriptions: number
  photos: number
  sms: number
  emails: number
}

