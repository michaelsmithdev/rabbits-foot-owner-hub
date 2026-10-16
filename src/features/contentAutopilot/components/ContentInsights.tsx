import { BarChart3, CalendarDays } from 'lucide-react'
import { useState } from 'react'

import { providerLabels } from '../contentRules'
import type { ContentBootstrap, ContentItemSummary } from '../types'

export function ContentCalendar({ items }: { items: ContentItemSummary[] }) {
  const today = new Date()
  const monday = new Date(today)
  const day = monday.getDay() || 7
  monday.setDate(monday.getDate() - day + 1)
  monday.setHours(0, 0, 0, 0)
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(monday)
    date.setDate(monday.getDate() + index)
    return date
  })
  return (
    <section className="ca-calendar-view">
      <header><div><span className="ca-eyebrow">WEEKLY CONTENT CALENDAR</span><h2>{monday.toLocaleDateString(undefined, { month: 'long', day: 'numeric' })} – {days[6].toLocaleDateString(undefined, { month: 'long', day: 'numeric' })}</h2></div><CalendarDays size={28} /></header>
      <div className="ca-week-grid">{days.map((date) => {
        const entries = items.filter((item) => {
          const scheduled = item.platformPosts.find((post) => post.scheduledAt)?.scheduledAt ?? item.createdAt
          return new Date(scheduled).toDateString() === date.toDateString()
        })
        return <article className={date.toDateString() === today.toDateString() ? 'today' : ''} key={date.toISOString()}><header><span>{date.toLocaleDateString(undefined, { weekday: 'short' })}</span><strong>{date.getDate()}</strong></header><div>{entries.map((item) => <div className={`ca-calendar-entry ca-calendar-${item.status}`} key={item.id}><strong>{item.jobName || item.originalFilename}</strong><small>{item.status.replaceAll('_', ' ')}</small><span>{item.platformPosts.filter((post) => post.enabled).map((post) => providerLabels[post.provider][0]).join(' · ')}</span></div>)}{!entries.length ? <small className="ca-no-post">No content</small> : null}</div></article>
      })}</div>
      <p className="ca-baseline-note">Drag-and-drop rescheduling stays feature-flagged for a later phase. Scheduled times are stored in UTC and shown in your local timezone.</p>
    </section>
  )
}

export function ContentAnalytics({ analytics, items }: { analytics: ContentBootstrap['analytics']; items: ContentItemSummary[] }) {
  const [cutoff] = useState(() => Date.now() - 30 * 24 * 60 * 60_000)
  const lastThirtyDays = items.filter((item) => new Date(item.createdAt).getTime() >= cutoff)
  return (
    <section className="ca-analytics-view">
      <header><div><span className="ca-eyebrow">LAST 30 DAYS</span><h2>Content performance</h2><p>Metrics appear only when a provider actually returns them. Missing data is never shown as a working zero.</p></div><BarChart3 size={30} /></header>
      <div className="ca-analytics-cards"><article><span>Content created</span><strong>{lastThirtyDays.length || 'Not enough data yet'}</strong></article><article><span>Posts published</span><strong>{analytics.publishedPosts ?? 'Not enough data yet'}</strong></article><article><span>Total views</span><strong>{analytics.totalViews ?? 'Not enough data yet'}</strong></article><article><span>Engagement</span><strong>{analytics.totalEngagement ?? 'Not enough data yet'}</strong></article><article><span>Best platform</span><strong>{analytics.bestPlatform ? providerLabels[analytics.bestPlatform] : 'Not enough data yet'}</strong></article><article><span>Top job type</span><strong>{analytics.topJobType ?? 'Not enough data yet'}</strong></article></div>
      <div className="ca-empty"><BarChart3 size={34} /><h3>Performance collectors are ready for provider data</h3><p>Facebook, Google, and YouTube expose different metrics. Owner Hub will store historical snapshots without inventing cross-platform parity.</p></div>
    </section>
  )
}
