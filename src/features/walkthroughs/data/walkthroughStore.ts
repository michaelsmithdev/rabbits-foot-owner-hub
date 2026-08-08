import { queueCollectionSync } from '../../cloud/syncQueue'
import type { Walkthrough, WalkthroughStatus } from '../types/Walkthrough'

const STORAGE_KEY = 'rabbits-foot-walkthroughs'
const statuses: WalkthroughStatus[] = ['draft', 'analyzing', 'ready', 'converted']

function normalizeWalkthrough(value: unknown): Walkthrough | null {
  if (!value || typeof value !== 'object') return null
  const walkthrough = value as Partial<Walkthrough>
  if (
    typeof walkthrough.id !== 'string' ||
    typeof walkthrough.customerId !== 'string' ||
    typeof walkthrough.serviceAddress !== 'string' ||
    (walkthrough.propertyType !== 'residential' && walkthrough.propertyType !== 'commercial') ||
    typeof walkthrough.jobCategory !== 'string' ||
    typeof walkthrough.typedNotes !== 'string' ||
    typeof walkthrough.originalTranscript !== 'string' ||
    !Array.isArray(walkthrough.voiceNotes) ||
    !Array.isArray(walkthrough.photoIds) ||
    !walkthrough.photoIds.every((id) => typeof id === 'string') ||
    typeof walkthrough.answers !== 'object' ||
    !walkthrough.answers ||
    typeof walkthrough.status !== 'string' ||
    !statuses.includes(walkthrough.status as WalkthroughStatus) ||
    typeof walkthrough.createdAt !== 'string' ||
    typeof walkthrough.updatedAt !== 'string'
  ) return null

  return {
    ...walkthrough,
    photoContext:
      walkthrough.photoContext && typeof walkthrough.photoContext === 'object'
        ? walkthrough.photoContext
        : {},
  } as Walkthrough
}

export function loadWalkthroughs(): Walkthrough[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    const parsed: unknown = stored ? JSON.parse(stored) : []
    return Array.isArray(parsed)
      ? parsed.map(normalizeWalkthrough).filter((item): item is Walkthrough => item !== null)
      : []
  } catch {
    return []
  }
}

export function saveWalkthroughs(walkthroughs: Walkthrough[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(walkthroughs))
  queueCollectionSync('walkthrough', walkthroughs)
}

export function upsertWalkthrough(walkthrough: Walkthrough) {
  const current = loadWalkthroughs()
  const next = current.some((item) => item.id === walkthrough.id)
    ? current.map((item) => item.id === walkthrough.id ? walkthrough : item)
    : [walkthrough, ...current]
  saveWalkthroughs(next)
}

export function latestDraftWalkthrough() {
  return loadWalkthroughs()
    .filter((item) => item.status !== 'converted')
    .sort((first, second) => second.updatedAt.localeCompare(first.updatedAt))[0] ?? null
}
