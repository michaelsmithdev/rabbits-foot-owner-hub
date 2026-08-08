import { queueCollectionSync } from '../../cloud/syncQueue'
import type { PricebookCategory, PricebookItem } from '../types/PricebookItem'

const STORAGE_KEY = 'rabbits-foot-pricebook'

const categories: PricebookCategory[] = [
  'labor',
  'material',
  'service',
  'equipment',
  'delivery',
  'disposal',
  'subcontractor',
  'other',
]

function isPricebookItem(value: unknown): value is PricebookItem {
  if (!value || typeof value !== 'object') return false
  const item = value as Partial<PricebookItem>

  return (
    typeof item.id === 'string' &&
    typeof item.name === 'string' &&
    typeof item.category === 'string' &&
    categories.includes(item.category as PricebookCategory) &&
    typeof item.unit === 'string' &&
    typeof item.unitCost === 'number' &&
    Number.isFinite(item.unitCost) &&
    typeof item.customerPrice === 'number' &&
    Number.isFinite(item.customerPrice) &&
    typeof item.notes === 'string' &&
    typeof item.active === 'boolean' &&
    typeof item.createdAt === 'string' &&
    typeof item.updatedAt === 'string'
  )
}

export function loadPricebook(): PricebookItem[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    const parsed: unknown = stored ? JSON.parse(stored) : []
    return Array.isArray(parsed) ? parsed.filter(isPricebookItem) : []
  } catch {
    return []
  }
}

export function savePricebook(items: PricebookItem[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
  queueCollectionSync('pricebook', items)
}

export function relevantPricebookItems(description: string, limit = 20) {
  const tokens = new Set(
    description
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((token) => token.length > 2),
  )

  return loadPricebook()
    .filter((item) => item.active)
    .map((item) => {
      const searchable = `${item.name} ${item.category} ${item.notes}`.toLowerCase()
      const score = Array.from(tokens).filter((token) => searchable.includes(token)).length
      return { item, score }
    })
    .sort((first, second) => second.score - first.score || first.item.name.localeCompare(second.item.name))
    .slice(0, limit)
    .map(({ item }) => item)
}
