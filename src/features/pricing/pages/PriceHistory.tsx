import { useMemo, useState } from 'react'
import { Plus, Search, Sparkles, Trash2, TrendingUp } from 'lucide-react'

import { loadPricingRecords, suggestPrice } from '../services/pricingEngine'
import { loadPricebook, savePricebook } from '../data/pricebookStore'
import type { PricebookCategory, PricebookItem } from '../types/PricebookItem'

const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })

export default function PriceHistory() {
  const [search, setSearch] = useState('')
  const [propertyType, setPropertyType] = useState<'residential' | 'commercial'>('residential')
  const [pricebook, setPricebook] = useState<PricebookItem[]>(loadPricebook)
  const [newItem, setNewItem] = useState({ name: '', category: 'service' as PricebookCategory, unit: 'each', unitCost: 0, customerPrice: 0 })
  const records = useMemo(() => loadPricingRecords(), [])
  const visible = useMemo(() => {
    const query = search.trim().toLowerCase()
    return query ? records.filter((record) => `${record.jobName} ${record.category} ${record.keywords.join(' ')}`.toLowerCase().includes(query)) : records
  }, [records, search])
  const suggestion = search.trim() ? suggestPrice(search, '', propertyType) : null
  const totals = visible.map((record) => record.total)
  const average = totals.length ? totals.reduce((sum, value) => sum + value, 0) / totals.length : 0

  function addPricebookItem() {
    if (!newItem.name.trim()) return
    const now = new Date().toISOString()
    const item: PricebookItem = {
      id: typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `${Date.now()}`,
      name: newItem.name.trim(),
      category: newItem.category,
      unit: newItem.unit.trim() || 'each',
      unitCost: Math.max(0, newItem.unitCost),
      customerPrice: Math.max(0, newItem.customerPrice),
      notes: '',
      active: true,
      createdAt: now,
      updatedAt: now,
    }
    const next = [item, ...pricebook]
    setPricebook(next)
    savePricebook(next)
    setNewItem({ name: '', category: 'service', unit: 'each', unitCost: 0, customerPrice: 0 })
  }

  function deletePricebookItem(id: string) {
    const next = pricebook.filter((item) => item.id !== id)
    setPricebook(next)
    savePricebook(next)
  }

  return (
    <div className="feature-page pricing-page" data-tour="pricing-page">
      <header className="page-heading"><div><span className="eyebrow">SMART PRICING</span><h1>Price history</h1><p>Search past work and use real job history to quote consistently.</p></div><div className="metric-card"><strong>{records.length}</strong><span>Jobs analyzed</span></div></header>
      <section className="pricebook-panel" data-tour="pricebook">
        <header><div><span className="eyebrow">BUSINESS PRICEBOOK</span><h2>Your cost and customer-price references</h2><p>AI estimates use matching active entries. Internal cost stays off customer documents.</p></div><strong>{pricebook.length} items</strong></header>
        <div className="pricebook-form">
          <input aria-label="Pricebook item name" onChange={(event) => setNewItem({ ...newItem, name: event.target.value })} placeholder="Item or service name" value={newItem.name} />
          <select aria-label="Pricebook category" onChange={(event) => setNewItem({ ...newItem, category: event.target.value as PricebookCategory })} value={newItem.category}>{['labor','material','service','equipment','delivery','disposal','subcontractor','other'].map((category) => <option key={category} value={category}>{category}</option>)}</select>
          <input aria-label="Unit" onChange={(event) => setNewItem({ ...newItem, unit: event.target.value })} placeholder="Unit" value={newItem.unit} />
          <input aria-label="Your unit cost" min="0" onChange={(event) => setNewItem({ ...newItem, unitCost: Number(event.target.value) })} placeholder="Your cost" step="0.01" type="number" value={newItem.unitCost} />
          <input aria-label="Customer unit price" min="0" onChange={(event) => setNewItem({ ...newItem, customerPrice: Number(event.target.value) })} placeholder="Customer price" step="0.01" type="number" value={newItem.customerPrice} />
          <button onClick={addPricebookItem} type="button"><Plus size={17} /> Add</button>
        </div>
        <div className="pricebook-list">{pricebook.map((item) => <article key={item.id}><div><strong>{item.name}</strong><span>{item.category} · per {item.unit}</span></div><div><small>Cost {currency.format(item.unitCost)}</small><b>{currency.format(item.customerPrice)}</b><button aria-label={`Delete ${item.name}`} onClick={() => deletePricebookItem(item.id)} type="button"><Trash2 size={16} /></button></div></article>)}</div>
      </section>
      <div className="pricing-search-panel">
        <label className="search-field"><Search aria-hidden="true" /><input aria-label="Describe a job" onChange={(event) => setSearch(event.target.value)} placeholder="Try: drywall patch, TV mounting, door repair..." value={search} /></label>
        <select aria-label="Property type" onChange={(event) => setPropertyType(event.target.value as 'residential' | 'commercial')} value={propertyType}><option value="residential">Residential</option><option value="commercial">Commercial</option></select>
      </div>
      {suggestion && <section className="pricing-suggestion"><Sparkles aria-hidden="true" /><div><span className="eyebrow">SUGGESTED PRICE</span><h2>{currency.format(suggestion.suggestedPrice)}</h2><p>{suggestion.explanation}</p><strong>{suggestion.confidence}% confidence · Range {currency.format(suggestion.low)}–{currency.format(suggestion.high)}</strong></div></section>}
      <div className="analytics-grid compact"><div className="metric-card"><TrendingUp /><strong>{currency.format(average)}</strong><span>Average job</span></div><div className="metric-card"><strong>{totals.length ? currency.format(Math.min(...totals)) : '$0.00'}</strong><span>Lowest</span></div><div className="metric-card"><strong>{totals.length ? currency.format(Math.max(...totals)) : '$0.00'}</strong><span>Highest</span></div><div className="metric-card"><strong>{currency.format(visible.reduce((sum, record) => sum + record.materials, 0))}</strong><span>Materials tracked</span></div></div>
      <div className="pricing-history-list" data-tour="price-history">{visible.map((record) => <article className="history-row" key={`${record.documentType}-${record.id}`}><div><span className="status-pill">{record.documentType}</span><h3>{record.jobName || record.category}</h3><p>{record.category} · {record.propertyType} · {new Date(`${record.date}T12:00:00`).toLocaleDateString()}</p></div><div className="history-numbers"><strong>{currency.format(record.total)}</strong><span>Materials {currency.format(record.materials)} · Gross profit {currency.format(record.grossProfit)}</span></div></article>)}</div>
      {!visible.length && <div className="empty-state"><Sparkles size={42} /><h2>No matching job history yet</h2><p>Completed estimates and invoices automatically become pricing history.</p></div>}
    </div>
  )
}
