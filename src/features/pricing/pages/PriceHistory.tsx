import { useMemo, useState } from 'react'
import { Search, Sparkles, TrendingUp } from 'lucide-react'

import { loadPricingRecords, suggestPrice } from '../services/pricingEngine'

const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })

export default function PriceHistory() {
  const [search, setSearch] = useState('')
  const [propertyType, setPropertyType] = useState<'residential' | 'commercial'>('residential')
  const records = useMemo(() => loadPricingRecords(), [])
  const visible = useMemo(() => {
    const query = search.trim().toLowerCase()
    return query ? records.filter((record) => `${record.jobName} ${record.category} ${record.keywords.join(' ')}`.toLowerCase().includes(query)) : records
  }, [records, search])
  const suggestion = search.trim() ? suggestPrice(search, '', propertyType) : null
  const totals = visible.map((record) => record.total)
  const average = totals.length ? totals.reduce((sum, value) => sum + value, 0) / totals.length : 0

  return (
    <div className="feature-page pricing-page">
      <header className="page-heading"><div><span className="eyebrow">SMART PRICING</span><h1>Price history</h1><p>Search past work and use real job history to quote consistently.</p></div><div className="metric-card"><strong>{records.length}</strong><span>Jobs analyzed</span></div></header>
      <div className="pricing-search-panel">
        <label className="search-field"><Search aria-hidden="true" /><input aria-label="Describe a job" onChange={(event) => setSearch(event.target.value)} placeholder="Try: drywall patch, TV mounting, door repair..." value={search} /></label>
        <select aria-label="Property type" onChange={(event) => setPropertyType(event.target.value as 'residential' | 'commercial')} value={propertyType}><option value="residential">Residential</option><option value="commercial">Commercial</option></select>
      </div>
      {suggestion && <section className="pricing-suggestion"><Sparkles aria-hidden="true" /><div><span className="eyebrow">SUGGESTED PRICE</span><h2>{currency.format(suggestion.suggestedPrice)}</h2><p>{suggestion.explanation}</p><strong>{suggestion.confidence}% confidence · Range {currency.format(suggestion.low)}–{currency.format(suggestion.high)}</strong></div></section>}
      <div className="analytics-grid compact"><div className="metric-card"><TrendingUp /><strong>{currency.format(average)}</strong><span>Average job</span></div><div className="metric-card"><strong>{totals.length ? currency.format(Math.min(...totals)) : '$0.00'}</strong><span>Lowest</span></div><div className="metric-card"><strong>{totals.length ? currency.format(Math.max(...totals)) : '$0.00'}</strong><span>Highest</span></div><div className="metric-card"><strong>{currency.format(visible.reduce((sum, record) => sum + record.materials, 0))}</strong><span>Materials tracked</span></div></div>
      <div className="pricing-history-list">{visible.map((record) => <article className="history-row" key={`${record.documentType}-${record.id}`}><div><span className="status-pill">{record.documentType}</span><h3>{record.jobName || record.category}</h3><p>{record.category} · {record.propertyType} · {new Date(`${record.date}T12:00:00`).toLocaleDateString()}</p></div><div className="history-numbers"><strong>{currency.format(record.total)}</strong><span>Materials {currency.format(record.materials)} · Gross profit {currency.format(record.grossProfit)}</span></div></article>)}</div>
      {!visible.length && <div className="empty-state"><Sparkles size={42} /><h2>No matching job history yet</h2><p>Completed estimates and invoices automatically become pricing history.</p></div>}
    </div>
  )
}
