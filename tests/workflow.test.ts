import assert from 'node:assert/strict'
import test from 'node:test'

import { calculateInvoiceBalance, calculateInvoiceTotal } from '../src/features/invoices/utils/invoiceMath.ts'
import { invoiceNeedsSquarePaymentLink } from '../src/features/invoices/utils/squarePaymentLink.ts'
import type { Invoice } from '../src/features/invoices/types/Invoice.ts'
import { approvedChangeOrderTotal, jobRevenue } from '../src/features/jobs/utils/jobMath.ts'
import type { Job } from '../src/features/jobs/types/Job.ts'
import { appointmentConflicts } from '../src/features/schedule/data/appointmentStore.ts'
import type { Appointment } from '../src/features/schedule/types/Appointment.ts'

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

test('Square checkout is automatic only for finalized invoices with a balance', () => {
  const invoice = {
    id: 'invoice-1',
    invoiceNumber: 'INV-2026-0001',
    customerId: 'customer-1',
    estimateId: null,
    jobName: 'Repair',
    serviceAddress: '123 Main St',
    description: 'Repair',
    issueDate: '2026-08-08',
    dueDate: '2026-08-22',
    lineItems: [
      { id: 'line-1', description: 'Repair', quantity: 1, unitPrice: 100 },
    ],
    taxRate: 0,
    discount: 0,
    notes: '',
    status: 'sent',
    payments: [],
    createdAt: '2026-08-08T00:00:00.000Z',
    updatedAt: '2026-08-08T00:00:00.000Z',
    paidAt: null,
  } as Invoice

  assert.equal(invoiceNeedsSquarePaymentLink(invoice), true)
  assert.equal(
    invoiceNeedsSquarePaymentLink({ ...invoice, status: 'draft' }),
    false,
  )
  assert.equal(
    invoiceNeedsSquarePaymentLink({
      ...invoice,
      squarePaymentLink: {
        url: 'https://square.link/example',
        amount: 100,
        createdAt: '2026-08-08T00:01:00.000Z',
      },
    }),
    false,
  )
  assert.equal(
    invoiceNeedsSquarePaymentLink({
      ...invoice,
      payments: [
        {
          id: 'payment-1',
          date: '2026-08-08',
          amount: 25,
          method: 'online',
          referenceNumber: '',
          notes: '',
          createdAt: '2026-08-08T00:02:00.000Z',
        },
      ],
      squarePaymentLink: {
        url: 'https://square.link/example',
        amount: 100,
        createdAt: '2026-08-08T00:01:00.000Z',
      },
    }),
    true,
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
