import { createContext, useContext } from 'react'

import type {
  OrganizationRole,
  OrganizationWorkspace,
  UsageSummary,
  WorkspaceIntegration,
  WorkspaceMember,
  WorkspaceSubscription,
} from './types'

export type SaasContextValue = {
  loading: boolean
  error: string
  organization: OrganizationWorkspace | null
  role: OrganizationRole | null
  subscription: WorkspaceSubscription | null
  integrations: WorkspaceIntegration[]
  members: WorkspaceMember[]
  usage: UsageSummary
  refresh: () => Promise<void>
  updateOrganization: (updates: Pick<OrganizationWorkspace, 'name' | 'accentColor' | 'onboardingCompletedAt'>) => Promise<void>
}

export const SaasContext = createContext<SaasContextValue | null>(null)

export function useSaas() {
  const context = useContext(SaasContext)
  if (!context) throw new Error('useSaas must be used inside SaasProvider.')
  return context
}

