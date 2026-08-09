import { queueCollectionSync } from '../../cloud/syncQueue'
import type { Communication } from '../types/Communication'

const STORAGE_KEY = 'rabbits-foot-communications'

export function loadCommunications(): Communication[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]')
    return Array.isArray(parsed)
      ? parsed.filter((value): value is Communication => Boolean(
          value && typeof value === 'object' &&
          typeof (value as Partial<Communication>).id === 'string' &&
          typeof (value as Partial<Communication>).customerId === 'string' &&
          typeof (value as Partial<Communication>).body === 'string' &&
          typeof (value as Partial<Communication>).createdAt === 'string',
        ))
      : []
  } catch {
    return []
  }
}

export function saveCommunications(items: Communication[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
  queueCollectionSync('communication', items)
}
