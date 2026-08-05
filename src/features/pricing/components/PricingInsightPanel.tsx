import { useMemo } from 'react'
import { Sparkles } from 'lucide-react'

import { suggestPrice } from '../services/pricingEngine'

type Props = { description: string; category: string; propertyType: 'residential' | 'commercial'; customerId?: string; onUsePrice: (price: number) => void }
const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })

export default function PricingInsightPanel({ description, category, propertyType, customerId, onUsePrice }: Props) {
  const suggestion = useMemo(() => suggestPrice(description, category, propertyType, customerId), [category, customerId, description, propertyType])
  if (!suggestion) return <div className="pricing-insight muted"><Sparkles size={18} /><span>Smart pricing will appear as your completed-job history grows.</span></div>
  return <div className="pricing-insight"><Sparkles size={20} /><div><strong>Suggested {currency.format(suggestion.suggestedPrice)}</strong><span>{suggestion.confidence}% confidence · {suggestion.sampleSize} similar job{suggestion.sampleSize === 1 ? '' : 's'} · {currency.format(suggestion.low)}–{currency.format(suggestion.high)}</span></div><button onClick={() => onUsePrice(Number(suggestion.suggestedPrice.toFixed(2)))} type="button">Use price</button></div>
}
