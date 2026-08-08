import { AlertTriangle, ShieldCheck } from 'lucide-react'

import type { AiEstimateEconomics } from '../ai/types'

type Props = {
  economics: AiEstimateEconomics | null
  currentPrice: number
  targetMargin: number
  onUsePrice: (price: number) => void
}

const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })

function roundedPrice(value: number) {
  return Math.ceil(value / 25) * 25
}

export default function ProfitGuard({ economics, currentPrice, targetMargin, onUsePrice }: Props) {
  if (!economics) {
    return (
      <aside className="profit-guard profit-guard-empty">
        <ShieldCheck size={20} />
        <div><strong>Profit Guard</strong><span>Use AI Walkthrough or AI Estimate to calculate the full contractor-only cost breakdown.</span></div>
      </aside>
    )
  }

  const profit = currentPrice - economics.totalEstimatedCost
  const margin = currentPrice > 0 ? profit / currentPrice * 100 : 0
  const belowTarget = margin + 0.01 < targetMargin
  const recommendation = economics.recommendedPrice
  const quickPrices = [
    { label: 'Recommended', value: recommendation },
    { label: '+10%', value: recommendation * 1.1 },
    { label: '+15%', value: recommendation * 1.15 },
    { label: '+20%', value: recommendation * 1.2 },
    { label: 'Round up', value: roundedPrice(Math.max(currentPrice, recommendation)) },
  ]

  return (
    <aside className={belowTarget ? 'profit-guard is-warning' : 'profit-guard'}>
      <header><div>{belowTarget ? <AlertTriangle size={20} /> : <ShieldCheck size={20} />}<strong>Profit Guard</strong></div><span>Contractor only</span></header>
      <dl>
        <div><dt>Estimated job cost</dt><dd>{currency.format(economics.totalEstimatedCost)}</dd></div>
        <div><dt>Current gross profit</dt><dd>{currency.format(profit)}</dd></div>
        <div><dt>Current margin</dt><dd>{margin.toFixed(1)}%</dd></div>
        <div><dt>Target margin</dt><dd>{targetMargin.toFixed(1)}%</dd></div>
      </dl>
      {belowTarget && <p>Current price is below your target margin. Review costs or choose a protected price.</p>}
      <div className="profit-price-actions">{quickPrices.map((option) => <button key={option.label} onClick={() => onUsePrice(Math.round(option.value * 100) / 100)} type="button"><span>{option.label}</span><strong>{currency.format(option.value)}</strong></button>)}</div>
    </aside>
  )
}
