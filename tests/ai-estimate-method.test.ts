import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import {
  calculateDirectEstimatePrice,
  describeEstimatedDuration,
} from '../src/features/estimates/ai/directEstimatePricing.ts'

test('AI estimate total is labor cost plus material cost only', () => {
  const price = calculateDirectEstimatePrice(4, 120, 90)

  assert.deepEqual(price, {
    laborHours: 4,
    laborRate: 120,
    laborCost: 480,
    materialCost: 90,
    total: 570,
  })
})

test('AI estimate explains labor time and onsite crew time plainly', () => {
  assert.equal(
    describeEstimatedDuration(4),
    'About 4 labor hours — about 4 hours onsite for one person.',
  )
  assert.equal(
    describeEstimatedDuration(10, 2),
    'About 10 labor hours — about 5 hours onsite for 2 people.',
  )
})

test('AI endpoint enforces the owner method after the model responds', () => {
  const endpoint = readFileSync(
    new URL('../api/ai-estimate.ts', import.meta.url),
    'utf8',
  )

  assert.match(endpoint, /calculateDirectEstimatePrice\(/)
  assert.match(endpoint, /const finalBid = directPricing\.total/)
  assert.match(endpoint, /materialMarkup = 0/)
  assert.match(endpoint, /overheadCost = 0/)
  assert.match(endpoint, /contingencyCost = 0/)
  assert.match(endpoint, /estimatedDuration: describeEstimatedDuration\(laborHours, crewSize\)/)
  assert.match(endpoint, /formula: 'estimate total = labor hours × labor rate \+ direct material cost'/)
})

test('older matching estimates are supplied as learning evidence', () => {
  const history = readFileSync(
    new URL('../src/features/estimates/ai/estimateHistory.ts', import.meta.url),
    'utf8',
  )
  const service = readFileSync(
    new URL('../src/features/estimates/ai/aiEstimateService.ts', import.meta.url),
    'utf8',
  )

  assert.match(history, /estimate\.status !== 'declined'/)
  assert.match(history, /relevanceScore\(description, item\)/)
  assert.match(history, /\.filter\(\(\{ score \}\) => score > 0\)/)
  assert.match(
    service,
    /buildEstimateHistory\([\s\S]*`\$\{input\.jobCategory\} \$\{input\.jobDescription\}`/,
  )
})
