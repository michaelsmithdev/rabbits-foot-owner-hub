import { BarChart3, Brain, CalendarDays, Library, Link2, PlusCircle, Sparkles } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'

import { useAuth } from '../../auth/authContext'
import BrandBrain from '../components/BrandBrain'
import ConnectionsCenter from '../components/ConnectionsCenter'
import { ContentAnalytics, ContentCalendar } from '../components/ContentInsights'
import ContentLibrary from '../components/ContentLibrary'
import CreatePost from '../components/CreatePost'
import { loadContentBootstrap } from '../services/contentApi'
import type { ContentBootstrap } from '../types'
import './ContentAutopilot.css'

type View = 'create' | 'library' | 'calendar' | 'analytics' | 'brain' | 'connections'

const views: Array<{ id: View; label: string; icon: typeof PlusCircle }> = [
  { id: 'create', label: 'Create post', icon: PlusCircle }, { id: 'library', label: 'Content library', icon: Library },
  { id: 'calendar', label: 'Calendar', icon: CalendarDays }, { id: 'analytics', label: 'Analytics', icon: BarChart3 },
  { id: 'brain', label: 'Brand Brain', icon: Brain }, { id: 'connections', label: 'Social accounts', icon: Link2 },
]

function readConnectionCallback() {
  const url = new URL(window.location.href)
  const outcome = url.searchParams.get('contentConnection')
  if (!outcome) return null
  const provider = url.searchParams.get('provider')
  return {
    notice: outcome === 'success'
      ? `${provider ?? 'Provider'} authorization received. Choose the Rabbit's Foot Page, location, or channel to finish.`
      : 'The provider connection was not completed. Retry from Social Accounts.',
  }
}

export default function ContentAutopilot() {
  const { mode } = useAuth()
  const [connectionCallback] = useState(readConnectionCallback)
  const [view, setView] = useState<View>(() => {
    if (connectionCallback) return 'connections'
    const requested = sessionStorage.getItem('content-autopilot-view') as View | null
    sessionStorage.removeItem('content-autopilot-view')
    return requested && views.some((item) => item.id === requested) ? requested : 'create'
  })
  const [data, setData] = useState<ContentBootstrap | null>(null)
  const [loading, setLoading] = useState(mode === 'cloud')
  const [error, setError] = useState('')
  const [connectionNotice] = useState(connectionCallback?.notice ?? '')

  const refresh = useCallback(async () => {
    if (mode !== 'cloud') return
    setLoading(true)
    setError('')
    try {
      setData(await loadContentBootstrap())
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Content Autopilot could not be loaded.')
    } finally {
      setLoading(false)
    }
  }, [mode])

  useEffect(() => {
    if (mode !== 'cloud') return
    let active = true
    void loadContentBootstrap()
      .then((value) => {
        if (!active) return
        setData(value)
        setError('')
      })
      .catch((caughtError: unknown) => {
        if (active) setError(caughtError instanceof Error ? caughtError.message : 'Content Autopilot could not be loaded.')
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => { active = false }
  }, [mode])

  useEffect(() => {
    if (!connectionCallback) return
    const url = new URL(window.location.href)
    url.searchParams.delete('contentConnection'); url.searchParams.delete('provider'); url.searchParams.delete('reason')
    window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`)
  }, [connectionCallback])

  if (mode !== 'cloud') return <section className="ca-page"><div className="ca-empty ca-cloud-required"><Link2 size={36} /><h1>Secure cloud workspace required</h1><p>Content Autopilot stores private videos, encrypted social authorizations, and background jobs in the authenticated Owner Hub workspace. Local-only mode cannot publish.</p></div></section>
  if (loading) return <section className="ca-page"><div className="ca-loading"><span /><strong>Opening Content Autopilot…</strong></div></section>
  if (error || !data) return <section className="ca-page"><div className="ca-error" role="alert">{error || 'Content Autopilot is unavailable.'}</div><button className="ca-primary-button" onClick={() => void refresh()} type="button">Retry</button></section>
  if (!data.enabled) return <section className="ca-page"><div className="ca-empty"><Sparkles size={36} /><h1>Content Autopilot is feature-flagged off</h1><p>Enable it on the secure server when the rollout is ready.</p></div></section>

  const connectedCount = data.connections.filter((connection) => connection.status === 'connected').length
  return (
    <section className="ca-page" data-tour="content-autopilot-page">
      <header className="ca-page-header">
        <div><span className="ca-eyebrow">MARKETING WORKSPACE</span><h1>Content Autopilot</h1><p>Drop the video, prepare honest platform-specific content, and let the backend finish publishing.</p></div>
        <div className="ca-header-stat"><span>{connectedCount} / 3</span><small>accounts ready</small></div>
      </header>
      {connectionNotice ? <div className="ca-success" role="status">{connectionNotice}</div> : null}
      <nav aria-label="Content Autopilot sections" className="ca-tabs">{views.map((item) => { const Icon = item.icon; return <button aria-current={view === item.id ? 'page' : undefined} className={view === item.id ? 'active' : ''} key={item.id} onClick={() => setView(item.id)} type="button"><Icon size={18} /><span>{item.label}</span></button> })}</nav>

      {view === 'create' ? <CreatePost aiEnabled={data.aiEnabled} brandProfile={data.brandProfile} connections={data.connections} mockMode={data.mockMode} onOpenConnections={() => setView('connections')} onRefresh={refresh} /> : null}
      {view === 'library' ? <ContentLibrary items={data.items} onRefresh={refresh} /> : null}
      {view === 'calendar' ? <ContentCalendar items={data.items} /> : null}
      {view === 'analytics' ? <ContentAnalytics analytics={data.analytics} items={data.items} /> : null}
      {view === 'brain' ? <BrandBrain items={data.items} learnedPreferences={data.learnedPreferences} onRefresh={refresh} profile={data.brandProfile} /> : null}
      {view === 'connections' ? <ConnectionsCenter connections={data.connections} onRefresh={refresh} /> : null}
    </section>
  )
}
