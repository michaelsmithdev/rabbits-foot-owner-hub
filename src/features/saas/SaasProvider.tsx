import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react'

import { useAuth } from '../auth/authContext'
import { cloudClient } from '../cloud/cloudClient'
import { SaasContext } from './saasContext'
import type {
  OrganizationRole,
  OrganizationWorkspace,
  UsageSummary,
  WorkspaceIntegration,
  WorkspaceMember,
  WorkspaceSubscription,
} from './types'
import { activateOrganizationStorage } from '../../storage/workspaceStorage'
import { defaultBusinessSettings, loadBusinessSettings, saveBusinessSettings } from '../settings/data/businessSettingsStore'

const emptyUsage: UsageSummary = { aiEstimates: 0, transcriptions: 0, photos: 0, sms: 0, emails: 0 }

export function SaasProvider({ children }: { children: ReactNode }) {
  const { mode, session } = useAuth()
  const [loading, setLoading] = useState(mode === 'cloud')
  const [error, setError] = useState('')
  const [organization, setOrganization] = useState<OrganizationWorkspace | null>(null)
  const [role, setRole] = useState<OrganizationRole | null>(null)
  const [subscription, setSubscription] = useState<WorkspaceSubscription | null>(null)
  const [integrations, setIntegrations] = useState<WorkspaceIntegration[]>([])
  const [members, setMembers] = useState<WorkspaceMember[]>([])
  const [usage, setUsage] = useState<UsageSummary>(emptyUsage)

  const refresh = useCallback(async () => {
    if (!cloudClient || !session) {
      setLoading(false)
      return
    }

    setLoading(true)
    setError('')
    try {
      const membershipResult = await cloudClient
        .from('organization_members')
        .select('organization_id, role, created_at')
        .eq('user_id', session.user.id)
      if (membershipResult.error) throw membershipResult.error
      if (!membershipResult.data?.length) throw new Error('Your account is not attached to a business workspace.')

      const selectedId = localStorage.getItem('owner-hub-active-organization')
      const selectedMembership = membershipResult.data.find((item) => item.organization_id === selectedId) ?? membershipResult.data[0]
      const organizationId = selectedMembership.organization_id as string
      setRole(selectedMembership.role as OrganizationRole)

      const monthStart = new Date()
      monthStart.setUTCDate(1)
      monthStart.setUTCHours(0, 0, 0, 0)

      const [organizationResult, subscriptionResult, integrationResult, memberResult, usageResult] = await Promise.all([
        cloudClient.from('organizations').select('id,name,slug,logo_url,accent_color,onboarding_completed_at').eq('id', organizationId).single(),
        cloudClient.from('organization_subscriptions').select('plan,status,trial_ends_at,current_period_ends_at,cancel_at_period_end').eq('organization_id', organizationId).maybeSingle(),
        cloudClient.from('integration_connections').select('provider,status,merchant_id,location_id,connected_at,last_error').eq('organization_id', organizationId),
        cloudClient.from('organization_members').select('user_id,role,created_at').eq('organization_id', organizationId).order('created_at'),
        cloudClient.from('usage_events').select('event_type,quantity').eq('organization_id', organizationId).gte('occurred_at', monthStart.toISOString()),
      ])
      if (organizationResult.error) throw organizationResult.error
      if (subscriptionResult.error) throw subscriptionResult.error
      if (integrationResult.error) throw integrationResult.error
      if (memberResult.error) throw memberResult.error
      if (usageResult.error) throw usageResult.error

      const org = organizationResult.data
      activateOrganizationStorage(org.id)
      const currentSettings = loadBusinessSettings()
      const hasUntouchedIdentity =
        currentSettings.businessName === defaultBusinessSettings.businessName &&
        (!currentSettings.phone || currentSettings.phone === defaultBusinessSettings.phone) &&
        !currentSettings.email &&
        !currentSettings.website &&
        !currentSettings.streetAddress &&
        !currentSettings.city &&
        !currentSettings.zipCode
      if (hasUntouchedIdentity) {
        saveBusinessSettings({
          ...currentSettings,
          businessName: org.name,
          email: session.user.email ?? '',
          updatedAt: new Date().toISOString(),
        })
      }
      setOrganization({
        id: org.id, name: org.name, slug: org.slug, logoUrl: org.logo_url,
        accentColor: org.accent_color ?? '#78c800', onboardingCompletedAt: org.onboarding_completed_at,
      })
      const sub = subscriptionResult.data
      setSubscription(sub ? {
        plan: sub.plan, status: sub.status, trialEndsAt: sub.trial_ends_at,
        currentPeriodEndsAt: sub.current_period_ends_at, cancelAtPeriodEnd: sub.cancel_at_period_end,
      } as WorkspaceSubscription : null)
      setIntegrations((integrationResult.data ?? []).map((item) => ({
        provider: item.provider, status: item.status, merchantId: item.merchant_id,
        locationId: item.location_id, connectedAt: item.connected_at, lastError: item.last_error,
      })) as WorkspaceIntegration[])
      const memberIds = (memberResult.data ?? []).map((item) => item.user_id)
      const profileResult = memberIds.length > 0
        ? await cloudClient.from('member_profiles').select('user_id,email,display_name').in('user_id', memberIds)
        : { data: [], error: null }
      if (profileResult.error) throw profileResult.error
      const profiles = new Map((profileResult.data ?? []).map((profile) => [profile.user_id, profile]))
      setMembers((memberResult.data ?? []).map((item) => {
        const profile = profiles.get(item.user_id)
        return {
          userId: item.user_id, role: item.role as OrganizationRole, joinedAt: item.created_at,
          email: profile?.email ?? '', displayName: profile?.display_name ?? '',
        }
      }))
      const nextUsage = { ...emptyUsage }
      for (const item of usageResult.data ?? []) {
        const amount = typeof item.quantity === 'number' ? item.quantity : 0
        if (item.event_type === 'ai_estimate') nextUsage.aiEstimates += amount
        if (item.event_type === 'ai_transcription') nextUsage.transcriptions += amount
        if (item.event_type === 'photo_upload') nextUsage.photos += amount
        if (item.event_type === 'sms') nextUsage.sms += amount
        if (item.event_type === 'email') nextUsage.emails += amount
      }
      setUsage(nextUsage)
    } catch (caughtError) {
      console.error('Subscription workspace could not be loaded.', caughtError)
      setError(caughtError instanceof Error ? caughtError.message : 'Workspace details could not be loaded.')
    } finally {
      setLoading(false)
    }
  }, [session])

  useEffect(() => {
    const timer = window.setTimeout(() => { void refresh() }, 0)
    return () => window.clearTimeout(timer)
  }, [refresh])

  const updateOrganization = useCallback(async (updates: Pick<OrganizationWorkspace, 'name' | 'accentColor' | 'onboardingCompletedAt'>) => {
    if (!cloudClient || !organization) throw new Error('The business workspace is not connected.')
    const result = await cloudClient.from('organizations').update({
      name: updates.name.trim(), accent_color: updates.accentColor,
      onboarding_completed_at: updates.onboardingCompletedAt, updated_at: new Date().toISOString(),
    }).eq('id', organization.id)
    if (result.error) throw result.error
    const currentSettings = loadBusinessSettings()
    if (
      currentSettings.businessName === organization.name ||
      currentSettings.businessName === defaultBusinessSettings.businessName
    ) {
      saveBusinessSettings({
        ...currentSettings,
        businessName: updates.name.trim(),
        updatedAt: new Date().toISOString(),
      })
    }
    await refresh()
  }, [organization, refresh])

  const value = useMemo(() => ({
    loading, error, organization, role, subscription, integrations, members, usage, refresh, updateOrganization,
  }), [loading, error, organization, role, subscription, integrations, members, usage, refresh, updateOrganization])

  return <SaasContext.Provider value={value}>{mode === 'cloud' && loading && !organization ? (
    <main className="auth-screen"><section className="auth-card"><p className="eyebrow">SECURE WORKSPACE</p><h1>Opening your business…</h1><p className="auth-intro">Separating this company’s offline records and confirming its subscription.</p></section></main>
  ) : children}</SaasContext.Provider>
}
