import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import {
  clearResolvedReliabilityEvents,
  loadReliabilityEvents,
  recordReliabilityEvent,
  resolveReliabilityEvent,
  sanitizeReliabilityText,
} from '../src/features/reliability/data/reliabilityStore.ts'
import {
  clearSyncQueue,
  loadSyncQueue,
  type QueuedRecordChange,
} from '../src/features/cloud/syncQueue.ts'

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>()

  get length() { return this.values.size }
  clear() { this.values.clear() }
  getItem(key: string) { return this.values.get(key) ?? null }
  key(index: number) { return Array.from(this.values.keys())[index] ?? null }
  removeItem(key: string) { this.values.delete(key) }
  setItem(key: string, value: string) { this.values.set(key, String(value)) }
}

const storage = new MemoryStorage()
Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage })

test('reliability diagnostics remove private credentials and contact details', () => {
  const sanitized = sanitizeReliabilityText(
    'mike@example.com (574) 555-1212 token=secret-value Bearer eyJabc.def.ghi',
  )

  assert.doesNotMatch(sanitized, /mike@example\.com/)
  assert.doesNotMatch(sanitized, /574/)
  assert.doesNotMatch(sanitized, /secret-value/)
  assert.doesNotMatch(sanitized, /eyJabc/)
  assert.match(sanitized, /\[email\]/)
  assert.match(sanitized, /\[phone\]/)
})

test('repeated reliability events are deduplicated and can be resolved', () => {
  storage.clear()
  recordReliabilityEvent({
    area: 'upload',
    severity: 'error',
    message: 'Receipt attachment failed.',
  })
  recordReliabilityEvent({
    area: 'upload',
    severity: 'error',
    message: 'Receipt attachment failed.',
  })

  const events = loadReliabilityEvents()
  assert.equal(events.length, 1)
  assert.equal(events[0].occurrences, 2)

  resolveReliabilityEvent(events[0].id)
  assert.ok(loadReliabilityEvents()[0].resolvedAt)
  clearResolvedReliabilityEvents()
  assert.equal(loadReliabilityEvents().length, 0)
})

test('finishing an older sync cannot discard a newer edit to the same record', () => {
  storage.clear()
  const older: QueuedRecordChange = {
    recordType: 'customer',
    recordId: 'customer-1',
    payload: { id: 'customer-1', name: 'Older name' },
    isDeleted: false,
    clientUpdatedAt: '2026-08-23T12:00:00.000Z',
  }
  const newer: QueuedRecordChange = {
    ...older,
    payload: { id: 'customer-1', name: 'Newest name' },
    clientUpdatedAt: '2026-08-23T12:00:01.000Z',
  }
  localStorage.setItem('rabbits-foot-cloud-sync-queue', JSON.stringify([newer]))

  clearSyncQueue([older])

  assert.deepEqual(loadSyncQueue(), [newer])
})

test('2.4.6 exposes recovery controls and stores reports in the protected workspace', () => {
  const center = readFileSync(
    new URL('../src/features/reliability/pages/ReliabilityCenter.tsx', import.meta.url),
    'utf8',
  )
  const auth = readFileSync(
    new URL('../src/features/auth/AuthProvider.tsx', import.meta.url),
    'utf8',
  )
  const migration = readFileSync(
    new URL('../supabase/migrations/202608230011_reliability_support_reports.sql', import.meta.url),
    'utf8',
  )

  assert.match(center, /Sync and verify now/)
  assert.match(center, /Retry failed attachments/)
  assert.match(center, /Download private diagnostics/)
  assert.match(center, /Send private problem report/)
  assert.match(auth, /Account creation failed/)
  assert.match(auth, /Confirmation email could not be resent/)
  assert.match(migration, /'support_report'/)
  assert.doesNotMatch(migration, /delete\s+from|truncate|drop\s+table/i)
})
