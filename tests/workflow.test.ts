import assert from 'node:assert/strict'
import test from 'node:test'

import { customerInvoiceBalance, customerInvoiceCanPay } from '../api/customer-portal.ts'
import { calculateInvoiceBalance, calculateInvoiceTotal } from '../src/features/invoices/utils/invoiceMath.ts'
import { approvedChangeOrderTotal, jobRevenue } from '../src/features/jobs/utils/jobMath.ts'
import type { Job } from '../src/features/jobs/types/Job.ts'
import { appointmentConflicts } from '../src/features/schedule/data/appointmentStore.ts'
import type { Appointment } from '../src/features/schedule/types/Appointment.ts'
import {
  applyPaymentOverheadToAmount,
  applyPaymentOverheadToLineItems,
} from '../src/features/pricing/utils/paymentOverhead.ts'
import {
  isExactScopeLineItemAllowed,
  isUpsellRequested,
} from '../src/features/estimates/ai/scopePolicy.ts'
import { mergeRemoteLeadSnapshot } from '../src/features/leads/data/leadMerge.ts'
import type { Lead } from '../src/features/leads/types/Lead.ts'
import { nextEstimateNumber } from '../src/features/estimates/data/estimateNumber.ts'
import { isAllowedOrigin, requestedOrganizationId } from '../api/_http-security.js'

test('AI estimate scope stays exact unless upsells are explicitly requested', () => {
  assert.equal(isUpsellRequested('Replace 2 storm doors'), false)
  assert.equal(isUpsellRequested('Replace 2 storm doors and give me upsell ideas'), true)
  assert.equal(
    isExactScopeLineItemAllowed('Replace 2 storm doors', 'Project overhead and profit'),
    false,
  )
  assert.equal(
    isExactScopeLineItemAllowed('Replace 2 storm doors', 'Disposal fee'),
    false,
  )
  assert.equal(
    isExactScopeLineItemAllowed('Replace 2 storm doors and dispose of the old doors', 'Disposal fee'),
    true,
  )
  assert.equal(
    isExactScopeLineItemAllowed('Replace 2 storm doors', 'Install 2 standard storm doors'),
    true,
  )
})

test('payment overhead is folded into customer pricing without mutating base prices', () => {
  const baseLineItems = [{ id: 'line-1', quantity: 1, unitPrice: 500 }]
  const customerLineItems = applyPaymentOverheadToLineItems(baseLineItems, 3.5)

  assert.equal(applyPaymentOverheadToAmount(500, 3.5), 517.5)
  assert.equal(customerLineItems[0].unitPrice, 517.5)
  assert.equal(baseLineItems[0].unitPrice, 500)
})

test('invoice math applies tax and discount and never returns a negative balance', () => {
  const invoice = {
    lineItems: [{ id: 'line-1', description: 'Repair', quantity: 2, unitPrice: 100 }],
    taxRate: 5,
    discount: 10,
    payments: [{ id: 'pay-1', amount: 250, method: 'cash' as const, paidAt: '2026-08-08', note: '' }],
    status: 'paid' as const,
  }

  assert.equal(calculateInvoiceTotal(invoice), 200)
  assert.equal(calculateInvoiceBalance(invoice as never), 0)
})

test('Customer Hub allows on-demand Square checkout only for payable invoices', () => {
  const invoice = {
    status: 'sent',
    lineItems: [{ quantity: 1, unitPrice: 295 }],
    taxRate: 0,
    discount: 0,
    payments: [],
  }

  assert.equal(customerInvoiceBalance(invoice as never), 295)
  assert.equal(customerInvoiceCanPay(invoice as never), true)
  assert.equal(
    customerInvoiceCanPay({ ...invoice, status: 'draft' } as never),
    false,
  )
  assert.equal(
    customerInvoiceCanPay({
      ...invoice,
      status: 'paid',
      payments: [{ amount: 295 }],
    } as never),
    false,
  )
})

test('only approved change orders affect job revenue', () => {
  const changeOrders = [
    { id: 'approved', status: 'approved' as const, priceChange: 450 },
    { id: 'draft', status: 'draft' as const, priceChange: 900 },
    { id: 'declined', status: 'declined' as const, priceChange: 300 },
  ]
  assert.equal(approvedChangeOrderTotal(changeOrders as never), 450)
  assert.equal(jobRevenue({ quotedPrice: 1_000, changeOrders } as Job), 1_450)
})

test('schedule rejects overlapping active appointments but ignores canceled work', () => {
  const base = {
    id: 'first', customerId: 'customer', title: 'Drywall repair', serviceAddress: '',
    startAt: '2026-08-10T13:00:00.000Z', endAt: '2026-08-10T15:00:00.000Z',
    status: 'scheduled', notes: '', createdAt: '2026-08-08T00:00:00.000Z', updatedAt: '2026-08-08T00:00:00.000Z',
  } as Appointment
  const overlap = { ...base, id: 'second', startAt: '2026-08-10T14:00:00.000Z', endAt: '2026-08-10T16:00:00.000Z' }
  assert.equal(appointmentConflicts([base], overlap).length, 1)
  assert.equal(appointmentConflicts([{ ...base, status: 'canceled' }], overlap).length, 0)
})

test('lead sync removes remote deletions while preserving unsynced local work', () => {
  const makeLead = (id: string, updatedAt: string): Lead => ({
    id,
    organizationId: 'organization',
    source: 'website',
    status: 'unread',
    name: id,
    phone: '',
    email: '',
    service: '',
    address: '',
    description: '',
    photoPaths: [],
    activity: [],
    convertedCustomerId: null,
    estimateId: null,
    submittedAt: updatedAt,
    updatedAt,
  })

  const remoteLead = makeLead('remote', '2026-08-09T12:00:00.000Z')
  const unsyncedLead = makeLead('unsynced', '2026-08-09T13:00:00.000Z')
  const deletedLead = makeLead('deleting', '2026-08-09T14:00:00.000Z')

  assert.deepEqual(
    mergeRemoteLeadSnapshot(
      [remoteLead, deletedLead],
      [unsyncedLead],
      [{ id: deletedLead.id, photoPaths: [] }],
    ).map((lead) => lead.id),
    ['unsynced', 'remote'],
  )
})

test('estimate numbers never collide after an older estimate is deleted', () => {
  const estimates = ['EST-0001', 'EST-0003', 'EST-0003-R1']

  assert.equal(nextEstimateNumber(estimates), 'EST-0004')
})

test('API requests reject unrelated Vercel deployments', () => {
  assert.equal(isAllowedOrigin('https://rabbits-foot-owner-hub.vercel.app'), true)
  assert.equal(isAllowedOrigin('http://localhost:5173'), true)
  assert.equal(isAllowedOrigin('capacitor://localhost'), true)
  assert.equal(isAllowedOrigin('https://unrelated-project.vercel.app'), false)
  assert.equal(
    requestedOrganizationId({
      headers: { 'x-owner-hub-organization': '4ef5a752-9fb6-43e4-97bb-fbf6d2095ccb' },
    } as never),
    '4ef5a752-9fb6-43e4-97bb-fbf6d2095ccb',
  )
  assert.equal(
    requestedOrganizationId({ headers: { 'x-owner-hub-organization': 'not-a-workspace' } } as never),
    null,
  )
})
