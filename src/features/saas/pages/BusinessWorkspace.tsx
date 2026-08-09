import {
  BadgeCheck, Building2, Check, Circle, Copy, CreditCard, ExternalLink,
  FileText, LifeBuoy, LoaderCircle, Palette, RefreshCw, ShieldCheck, Sparkles,
  Trash2, UserX, UsersRound,
} from 'lucide-react'
import { Capacitor } from '@capacitor/core'
import { type FormEvent, useMemo, useState } from 'react'

import { useAuth } from '../../auth/authContext'
import { loadBusinessSettings } from '../../settings/data/businessSettingsStore'
import { planCatalog, subscriptionIsUsable } from '../planCatalog'
import { useSaas } from '../saasContext'
import type { OrganizationRole, SubscriptionPlan } from '../types'
import './BusinessWorkspace.css'

const apiOrigin = (import.meta.env.VITE_OWNER_HUB_API_URL ?? '').replace(/\/$/, '')

async function apiAction(accessToken: string, body: Record<string, unknown>) {
  const response = await fetch(`${apiOrigin}/api/saas`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json', 'X-Owner-Hub-Organization': localStorage.getItem('owner-hub-active-organization') ?? '' },
    body: JSON.stringify(body),
  })
  const payload = await response.json() as { error?: string; [key: string]: unknown }
  if (!response.ok) throw new Error(payload.error || 'The request could not be completed.')
  return payload
}

export default function BusinessWorkspace() {
  const { session } = useAuth()
  const { loading, error, organization, role, subscription, integrations, members, usage, refresh, updateOrganization } = useSaas()
  const [businessName, setBusinessName] = useState(organization?.name ?? '')
  const [accentColor, setAccentColor] = useState(organization?.accentColor ?? '#78c800')
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<Exclude<OrganizationRole, 'owner'>>('member')
  const [message, setMessage] = useState('')
  const [actionError, setActionError] = useState('')
  const [busyAction, setBusyAction] = useState('')

  const currentPlan = subscription ? planCatalog[subscription.plan] : planCatalog.starter
  const settings = loadBusinessSettings()
  const square = integrations.find((item) => item.provider === 'square')
  const canManage = role === 'owner' || role === 'admin'
  const isNativeApp = Capacitor.isNativePlatform()
  const onboarding = useMemo(() => [
    { label: 'Add business contact information', complete: Boolean(settings.businessName && settings.email && settings.phone) },
    { label: 'Choose pricing and tax defaults', complete: settings.minimumJobCharge > 0 && settings.targetGrossMarginPercent > 0 },
    { label: 'Connect Square for customer payments', complete: square?.status === 'connected' },
    { label: 'Create your first customer', complete: localStorage.getItem('rabbits-foot-customers') !== null },
    { label: 'Create your first estimate', complete: localStorage.getItem('rabbits-foot-estimates') !== null },
  ], [settings, square?.status])
  const completedSteps = onboarding.filter((step) => step.complete).length

  async function runAction(name: string, action: () => Promise<void>) {
    setBusyAction(name)
    setMessage('')
    setActionError('')
    try { await action() } catch (caughtError) {
      setActionError(caughtError instanceof Error ? caughtError.message : 'The request could not be completed.')
    } finally { setBusyAction('') }
  }

  async function saveWorkspace(event: FormEvent) {
    event.preventDefault()
    await runAction('workspace', async () => {
      await updateOrganization({
        name: businessName,
        accentColor,
        onboardingCompletedAt: completedSteps === onboarding.length ? new Date().toISOString() : organization?.onboardingCompletedAt ?? null,
      })
      document.documentElement.style.setProperty('--brand-accent', accentColor)
      setMessage('Business workspace updated.')
    })
  }

  async function createInvite(event: FormEvent) {
    event.preventDefault()
    if (!session) return
    await runAction('invite', async () => {
      const payload = await apiAction(session.access_token, { action: 'create-invite', email: inviteEmail, role: inviteRole })
      const inviteUrl = String(payload.inviteUrl ?? '')
      if (inviteUrl && navigator.clipboard) await navigator.clipboard.writeText(inviteUrl)
      setInviteEmail('')
      setMessage(inviteUrl ? 'Invitation link copied. Send it to your team member.' : 'Invitation created.')
      await refresh()
    })
  }

  async function choosePlan(plan: SubscriptionPlan) {
    if (!session) return
    await runAction(`plan-${plan}`, async () => {
      const payload = await apiAction(session.access_token, { action: 'start-subscription', plan, billingCycle: 'monthly' })
      setMessage(String(payload.message ?? 'Subscription started.'))
      await refresh()
    })
  }

  async function changeRenewal(action: 'cancel-subscription' | 'resume-subscription') {
    if (!session || role !== 'owner') return
    if (action === 'cancel-subscription' && !window.confirm('Stop renewal at the end of the current billing period? Your records will remain available until then.')) return
    await runAction(action, async () => {
      const payload = await apiAction(session.access_token, { action })
      setMessage(String(payload.message ?? 'Subscription renewal updated.'))
      await refresh()
    })
  }

  async function requestAccountDeletion() {
    if (!session || role !== 'owner') return
    if (!window.confirm('Send a request to delete this account and business workspace? Support will verify the request before any data is removed.')) return
    await runAction('delete-account', async () => {
      const response = await fetch(`${apiOrigin}/api/account-deletion-request`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json', 'X-Owner-Hub-Organization': organization?.id ?? '' },
        body: JSON.stringify({ reason: 'Requested by the workspace owner from Business & billing.', source: isNativeApp ? 'android-app' : 'web-app' }),
      })
      const payload = await response.json() as { error?: string; message?: string }
      if (!response.ok) throw new Error(payload.error || 'The deletion request could not be submitted.')
      setMessage(payload.message ?? 'Account deletion request received.')
    })
  }

  async function changeMember(userId: string, action: 'update-member' | 'remove-member', nextRole?: 'admin' | 'member') {
    if (!session) return
    await runAction(`member-${userId}`, async () => {
      const payload = await apiAction(session.access_token, { action, userId, role: nextRole })
      setMessage(String(payload.message ?? 'Team access updated.'))
      await refresh()
    })
  }

  async function connectSquare() {
    if (!session) return
    await runAction('square', async () => {
      const payload = await apiAction(session.access_token, { action: 'square-oauth-start' })
      const authorizationUrl = String(payload.authorizationUrl ?? '')
      if (!authorizationUrl) throw new Error('Square did not return a secure connection link.')
      window.location.assign(authorizationUrl)
    })
  }

  if (loading && !organization) return <section className="business-loading"><LoaderCircle className="auth-spinner" /><p>Loading your business workspace…</p></section>

  return (
    <section className="business-workspace-page">
      <header className="business-hero">
        <div><p className="eyebrow">SUBSCRIPTION WORKSPACE</p><h1>{organization?.name ?? 'Your business'}</h1><p>Manage setup, team access, integrations, usage, and subscription billing.</p></div>
        <div className={`subscription-status ${subscriptionIsUsable(subscription?.status ?? '', subscription?.trialEndsAt ?? null) ? 'active' : 'attention'}`}>
          <BadgeCheck size={20}/><div><strong>{currentPlan.name}</strong><span>{subscription?.status === 'trialing' ? 'Free trial' : subscription?.status ?? 'Setup required'}</span></div>
        </div>
      </header>

      {(error || actionError) && <div className="business-alert error" role="alert">{error || actionError}</div>}
      {message && <div className="business-alert success" role="status">{message}</div>}

      <div className="business-dashboard-grid">
        <article className="business-panel onboarding-panel">
          <header><span><Sparkles size={22}/></span><div><p className="eyebrow">GET TO VALUE FAST</p><h2>Launch checklist</h2></div><b>{completedSteps}/{onboarding.length}</b></header>
          <div className="onboarding-progress"><i style={{ width: `${completedSteps / onboarding.length * 100}%` }}/></div>
          <ul>{onboarding.map((step) => <li className={step.complete ? 'done' : ''} key={step.label}>{step.complete ? <Check size={18}/> : <Circle size={18}/>}<span>{step.label}</span></li>)}</ul>
        </article>

        <article className="business-panel usage-panel">
          <header><span><Sparkles size={22}/></span><div><p className="eyebrow">THIS MONTH</p><h2>Plan usage</h2></div></header>
          <div className="usage-row"><div><strong>AI estimates</strong><span>{usage.aiEstimates} of {currentPlan.aiEstimates}</span></div><progress max={currentPlan.aiEstimates} value={usage.aiEstimates}/></div>
          <div className="usage-row"><div><strong>Voice transcriptions</strong><span>{usage.transcriptions} of {currentPlan.transcriptions}</span></div><progress max={currentPlan.transcriptions} value={usage.transcriptions}/></div>
          <div className="usage-row"><div><strong>Photo storage</strong><span>{usage.photos} of {currentPlan.photos}</span></div><progress max={currentPlan.photos} value={usage.photos}/></div>
          <div className="usage-stats"><span><b>{members.length}</b> of {currentPlan.seats} seats</span><span><b>{usage.sms}</b> texts</span><span><b>{usage.emails}</b> emails</span></div>
        </article>
      </div>

      {canManage && <form className="business-panel workspace-profile" onSubmit={(event) => void saveWorkspace(event)}>
        <header><span><Building2 size={22}/></span><div><p className="eyebrow">WHITE LABEL PROFILE</p><h2>Business identity</h2><p>This identity belongs to this subscriber and never leaks into another workspace.</p></div></header>
        <div className="workspace-form-row"><label><span>Business name</span><input onChange={(event) => setBusinessName(event.target.value)} required value={businessName}/></label><label><span>Accent color</span><div className="color-field"><Palette size={18}/><input onChange={(event) => setAccentColor(event.target.value)} type="color" value={accentColor}/><code>{accentColor}</code></div></label><button disabled={busyAction === 'workspace'} type="submit">Save identity</button></div>
      </form>}

      <div className="business-dashboard-grid">
        <article className="business-panel integration-panel">
          <header><span><CreditCard size={22}/></span><div><p className="eyebrow">PAYMENTS</p><h2>Square connection</h2></div></header>
          <div className="integration-state"><div className={square?.status === 'connected' ? 'connection-dot connected' : 'connection-dot'}/><div><strong>{square?.status === 'connected' ? 'Square connected' : 'Connect your Square account'}</strong><p>{square?.status === 'connected' ? `Payments route to merchant ${square.merchantId ?? ''}.` : 'Every subscriber connects their own merchant account. Credentials are encrypted server-side.'}</p></div></div>
          {canManage && <button className="business-action" disabled={busyAction === 'square'} onClick={() => void connectSquare()} type="button">{busyAction === 'square' ? <LoaderCircle className="auth-spinner"/> : <ExternalLink/>}{square?.status === 'connected' ? 'Reconnect Square' : 'Connect Square securely'}</button>}
        </article>

        <article className="business-panel team-panel">
          <header><span><UsersRound size={22}/></span><div><p className="eyebrow">TEAM & PERMISSIONS</p><h2>{members.length} of {currentPlan.seats} seats used</h2></div></header>
          <div className="member-list">{members.map((member) => <div className="member-row" key={member.userId}><span>{(member.displayName || member.email || 'T').slice(0, 1).toUpperCase()}</span><div><strong>{member.displayName || member.email}</strong><small>{member.email}</small></div>{role === 'owner' && member.role !== 'owner' ? <div className="member-controls"><select aria-label={`Role for ${member.displayName || member.email}`} disabled={busyAction === `member-${member.userId}`} onChange={(event) => void changeMember(member.userId, 'update-member', event.target.value as 'admin' | 'member')} value={member.role}><option value="member">Technician</option><option value="admin">Administrator</option></select><button aria-label={`Remove ${member.displayName || member.email}`} disabled={busyAction === `member-${member.userId}`} onClick={() => void changeMember(member.userId, 'remove-member')} type="button"><Trash2 size={16}/></button></div> : <b>{member.role}</b>}</div>)}</div>
          {canManage && <form className="invite-form" onSubmit={(event) => void createInvite(event)}><input aria-label="Team member email" onChange={(event) => setInviteEmail(event.target.value)} placeholder="team@email.com" required type="email" value={inviteEmail}/><select aria-label="Team member role" onChange={(event) => setInviteRole(event.target.value as 'admin' | 'member')} value={inviteRole}><option value="member">Technician</option><option value="admin">Office administrator</option></select><button disabled={busyAction === 'invite' || members.length >= currentPlan.seats} type="submit">{busyAction === 'invite' ? <LoaderCircle className="auth-spinner"/> : <Copy/>}Create invite link</button></form>}
        </article>
      </div>

      <section className="plans-section"><header><div><p className="eyebrow">SIMPLE PRICING</p><h2>Choose the plan that fits the crew</h2></div><p>Annual billing includes two months free. AI and storage limits protect the business from surprise costs.</p></header>{isNativeApp && <div className="native-billing-note"><ShieldCheck size={20}/><p>Plan purchases and changes are managed in the secure web dashboard. Your Android app will reflect the updated plan after you sign in or refresh.</p></div>}<div className="plan-grid">{Object.values(planCatalog).map((plan) => <article className={`plan-card ${plan.id === subscription?.plan ? 'current' : ''}`} key={plan.id}><p className="eyebrow">{plan.name}</p><h3>${plan.monthlyPrice}<span>/month</span></h3><p>{plan.seats} seat{plan.seats === 1 ? '' : 's'} · {plan.aiEstimates} AI estimates/month</p><ul>{plan.features.map((feature) => <li key={feature}><Check size={17}/>{feature}</li>)}</ul><button disabled={isNativeApp || !canManage || plan.id === subscription?.plan || busyAction === `plan-${plan.id}`} onClick={() => void choosePlan(plan.id)} type="button">{plan.id === subscription?.plan ? <><ShieldCheck/>Current plan</> : <>Choose {plan.name}</>}</button></article>)}</div></section>

      <section className="business-panel account-control">
        <header><span><ShieldCheck size={22}/></span><div><p className="eyebrow">ACCOUNT CONTROL</p><h2>Renewal, support, and privacy</h2><p>Clear controls for billing, legal information, support, and account deletion.</p></div></header>
        <div className="account-control-grid">
          <a href="#privacy"><FileText size={19}/><span><strong>Privacy policy</strong><small>How information is stored and protected</small></span></a>
          <a href="#terms"><FileText size={19}/><span><strong>Terms of service</strong><small>Subscription and acceptable-use terms</small></span></a>
          <a href="#support"><LifeBuoy size={19}/><span><strong>Support</strong><small>Get help with your workspace</small></span></a>
          {role === 'owner' && <button className="danger-control" disabled={busyAction === 'delete-account'} onClick={() => void requestAccountDeletion()} type="button"><UserX size={19}/><span><strong>Request account deletion</strong><small>Verification is required before records are removed</small></span></button>}
        </div>
        {role === 'owner' && !isNativeApp && subscription && subscription.status !== 'trialing' && <div className="renewal-control"><div><strong>{subscription.cancelAtPeriodEnd ? 'Renewal is scheduled to stop' : 'Automatic renewal is on'}</strong><p>{subscription.cancelAtPeriodEnd ? 'Access continues through the current paid period. You can restore renewal before it ends.' : 'Your plan renews automatically until you cancel.'}</p></div><button disabled={busyAction === 'cancel-subscription' || busyAction === 'resume-subscription'} onClick={() => void changeRenewal(subscription.cancelAtPeriodEnd ? 'resume-subscription' : 'cancel-subscription')} type="button">{subscription.cancelAtPeriodEnd ? 'Restore renewal' : 'Cancel at period end'}</button></div>}
      </section>

      <button className="refresh-workspace" onClick={() => void refresh()} type="button"><RefreshCw size={17}/>Refresh subscription status</button>
    </section>
  )
}
