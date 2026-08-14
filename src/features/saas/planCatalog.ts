import type { SubscriptionPlan } from './types'

export type PlanDefinition = {
  id: SubscriptionPlan
  name: string
  monthlyPrice: number
  seats: number
  aiEstimates: number
  transcriptions: number
  photos: number
  features: string[]
}

export const planCatalog: Record<SubscriptionPlan, PlanDefinition> = {
  starter: {
    id: 'starter',
    name: 'Owner Hub',
    monthlyPrice: 69.99,
    seats: 1,
    aiEstimates: 15,
    transcriptions: 30,
    photos: 500,
    features: ['Customers, estimates, and invoices', 'Customer Hub', 'PDF documents', 'Square payments'],
  },
  pro: {
    id: 'pro',
    name: 'Owner Hub',
    monthlyPrice: 69.99,
    seats: 3,
    aiEstimates: 100,
    transcriptions: 200,
    photos: 3_000,
    features: ['Customers, estimates, and invoices', 'Customer Hub', 'AI walkthroughs', 'Square payments', 'Team access'],
  },
  team: {
    id: 'team',
    name: 'Owner Hub',
    monthlyPrice: 69.99,
    seats: 8,
    aiEstimates: 300,
    transcriptions: 600,
    photos: 10_000,
    features: ['Customers, estimates, and invoices', 'Customer Hub', 'AI walkthroughs', 'Square payments', 'Team access'],
  },
}

// New subscriptions use one simple Owner Hub product. The older plan IDs remain
// readable so existing customer records and usage limits continue to work.
export const ownerHubSubscriptionPlan = planCatalog.pro

export function subscriptionIsUsable(status: string, trialEndsAt: string | null) {
  if (status === 'active') return true
  return status === 'trialing' && (!trialEndsAt || new Date(trialEndsAt).getTime() > Date.now())
}
