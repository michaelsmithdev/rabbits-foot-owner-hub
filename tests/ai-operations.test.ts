import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import { AI_ACTION_POLICIES, isAutopilotSafe } from '../src/features/aiOperations/services/autonomyPolicy.ts'
import { calculateJobCostingNumbers } from '../src/features/jobs/utils/jobCostingMath.ts'

test('shared job costing keeps revenue, cost, profit, and margin distinct', () => {
  const result = calculateJobCostingNumbers({
    quotedRevenue: 600,
    actualRevenue: 600,
    estimatedMaterials: 60,
    actualMaterials: 90,
    estimatedLaborHours: 3,
    actualLaborHours: 4,
    estimatedLaborCost: 120,
    totalRecordedExpenses: 90,
    estimatedTotalCost: 180,
    internalLaborCostPerHour: 40,
  })
  assert.equal(result.actualRevenue, 600)
  assert.equal(result.actualMaterials, 90)
  assert.equal(result.actualLaborHours, 4)
  assert.equal(result.laborCost, 160)
  assert.equal(result.totalJobCost, 250)
  assert.equal(result.grossProfit, 350)
  assert.equal(Math.round(result.grossMargin * 10) / 10, 58.3)
})

test('customer labor pricing stays separate from private labor cost', () => {
  const settingsStore = readFileSync(new URL('../src/features/settings/data/businessSettingsStore.ts', import.meta.url), 'utf8')
  const estimateService = readFileSync(new URL('../src/features/estimates/ai/aiEstimateService.ts', import.meta.url), 'utf8')
  const operationsSnapshot = readFileSync(new URL('../src/features/aiOperations/services/operationsSnapshot.ts', import.meta.url), 'utf8')

  assert.match(settingsStore, /defaultLaborRate:\s*120/)
  assert.match(settingsStore, /internalLaborCostPerHour:\s*40/)
  assert.match(estimateService, /laborRate:\s*settings\.defaultLaborRate/)
  assert.match(operationsSnapshot, /internalLaborCostPerHour:\s*settings\.internalLaborCostPerHour/)
})

test('invoice creation and job-cost updates always require owner approval', () => {
  assert.equal(AI_ACTION_POLICIES.create_invoice_draft.requiresOwnerApproval, true)
  assert.equal(AI_ACTION_POLICIES.update_job_cost.requiresOwnerApproval, true)
  assert.equal(isAutopilotSafe('create_invoice_draft'), false)
})

test('autopilot is an explicit low-risk allowlist and cannot send messages', () => {
  assert.equal(isAutopilotSafe('create_job_checklist'), true)
  assert.equal(isAutopilotSafe('draft_customer_message'), true)
  assert.equal(isAutopilotSafe('send_customer_message'), false)
  assert.equal(isAutopilotSafe('create_invoice_draft'), false)
  assert.equal(AI_ACTION_POLICIES.send_customer_message.risk, 'high')
  assert.equal(AI_ACTION_POLICIES.send_customer_message.reversible, false)
})

test('AI records sync through the shared web and Android record model', () => {
  const syncQueue = readFileSync(new URL('../src/features/cloud/syncQueue.ts', import.meta.url), 'utf8')
  const workspaceStorage = readFileSync(new URL('../src/storage/workspaceStorage.ts', import.meta.url), 'utf8')
  const migration = readFileSync(new URL('../supabase/migrations/202608230010_ai_operations_foundation.sql', import.meta.url), 'utf8')
  for (const recordType of ['business_event', 'ai_action', 'ai_audit', 'automation_settings']) {
    assert.match(syncQueue, new RegExp(`'${recordType}'`))
    assert.match(migration, new RegExp(`'${recordType}'`))
  }
  assert.match(workspaceStorage, /rabbits-foot-expenses/)
  assert.match(workspaceStorage, /rabbits-foot-ai-actions/)
  assert.doesNotMatch(migration, /delete\s+from|truncate|drop\s+table/i)
})

test('AI Operations API is authenticated, workspace-scoped, rate-limited, and cannot execute tools', () => {
  const endpoint = readFileSync(new URL('../api/_ai-operations.ts', import.meta.url), 'utf8')
  const estimateRouter = readFileSync(new URL('../api/ai-estimate.ts', import.meta.url), 'utf8')
  const vercelConfig = readFileSync(new URL('../vercel.json', import.meta.url), 'utf8')
  assert.match(endpoint, /verifyUser\(accessToken\)/)
  assert.match(endpoint, /verifyWorkspace\(userId, requestedOrganizationId\(request\)\)/)
  assert.match(endpoint, /isRateLimited\(userId\)/)
  assert.match(endpoint, /store:\s*false/)
  assert.doesNotMatch(endpoint, /saveInvoices|saveExpenses|saveJobs|queueCollectionSync/)
  assert.match(estimateRouter, /route === 'operations'/)
  assert.match(vercelConfig, /\/api\/ai-operations[\s\S]*\/api\/ai-estimate\?route=operations/)
})
