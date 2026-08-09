import type { SubscriptionPlan } from './types'

export type PlanDefinition = {
  id: SubscriptionPlan
  name: string
  monthlyPrice: number
  annualPrice: number
  seats: number
  aiEstimates: number
  transcriptions: number
  photos: number
  features: string[]
}

export const planCatalog: Record<SubscriptionPlan, PlanDefinition> = {
  starter: {
    id: 'starter',
    name: 'Starter',
    monthlyPrice: 39,
    annualPrice: 390,
    seats: 1,
    aiEstimates: 15,
    transcriptions: 30,
    photos: 500,
    features: ['Customers, estimates, and invoices', 'Customer Hub', 'PDF documents', 'Square payments'],
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    monthlyPrice: 89,
    annualPrice: 890,
    seats: 3,
    aiEstimates: 100,
    transcriptions: 200,
    photos: 3_000,
    features: ['Everything in Starter', 'Team access', 'AI walkthroughs', 'Automated follow-ups', 'Job costing'],
  },
  team: {
    id: 'team',
    name: 'Team',
    monthlyPrice: 169,
    annualPrice: 1_690,
    seats: 8,
    aiEstimates: 300,
    transcriptions: 600,
    photos: 10_000,
    features: ['Everything in Pro', 'Advanced permissions', 'Dispatch and assignments', 'Audit log', 'Priority support'],
  },
}

export function subscriptionIsUsable(status: string, trialEndsAt: string | null) {
  if (status === 'active') return true
  return status === 'trialing' && (!trialEndsAt || new Date(trialEndsAt).getTime() > Date.now())
}
