import type { Customer } from '../customers/types/Customer'
import type { Estimate } from '../estimates/types/Estimate'
import type { Invoice } from '../invoices/types/Invoice'
import { calculateInvoiceBalance } from '../invoices/utils/invoiceMath.ts'
import type { Appointment } from '../schedule/types/Appointment'
import type { Communication } from './types/Communication'

export type ActionCenterKind =
  | 'customer_request'
  | 'overdue_invoice'
  | 'estimate_follow_up'
  | 'appointment_reminder'
  | 'review_request'

export type ActionCenterItem = {
  id: string
  kind: ActionCenterKind
  priority: number
  customerId: string
  title: string
  detail: string
  actionLabel: string
  documentId?: string
  appointmentId?: string
  communicationId?: string
}

const DAY_MS = 24 * 60 * 60_000

function customerName(customers: Customer[], customerId: string) {
  const customer = customers.find((item) => item.id === customerId)
  return customer
    ? `${customer.firstName} ${customer.lastName}`.trim()
    : 'Customer'
}

function hasRecentCommunication(
  communications: Communication[],
  kind: Communication['kind'],
  referenceId: string,
  cutoff: number,
) {
  return communications.some((item) => {
    const matchesReference =
      item.documentId === referenceId || item.appointmentId === referenceId
    return (
      item.kind === kind &&
      matchesReference &&
      new Date(item.createdAt).getTime() >= cutoff
    )
  })
}

export function buildActionCenterItems(input: {
  customers: Customer[]
  estimates: Estimate[]
  invoices: Invoice[]
  appointments: Appointment[]
  communications: Communication[]
  now?: Date
}) {
  const now = input.now ?? new Date()
  const nowTime = now.getTime()
  const today = new Date(nowTime - now.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 10)
  const actions: ActionCenterItem[] = []

  input.communications
    .filter(
      (item) =>
        item.channel === 'system' &&
        item.kind === 'custom' &&
        item.status === 'delivered',
    )
    .forEach((item) => {
      actions.push({
        id: `request-${item.id}`,
        kind: 'customer_request',
        priority: 0,
        customerId: item.customerId,
        communicationId: item.id,
        title: item.subject || 'Customer request',
        detail: `${customerName(input.customers, item.customerId)} · ${item.body.slice(0, 120)}`,
        actionLabel: 'Review customer',
      })
    })

  input.invoices.forEach((invoice) => {
    if (
      !['sent', 'partial', 'overdue'].includes(invoice.status) ||
      calculateInvoiceBalance(invoice) <= 0 ||
      invoice.dueDate >= today
    ) {
      return
    }
    if (
      hasRecentCommunication(
        input.communications,
        'invoice_reminder',
        invoice.id,
        nowTime - 3 * DAY_MS,
      )
    ) {
      return
    }

    actions.push({
      id: `invoice-${invoice.id}`,
      kind: 'overdue_invoice',
      priority: 1,
      customerId: invoice.customerId,
      documentId: invoice.id,
      title: `${invoice.invoiceNumber} is overdue`,
      detail: `${customerName(input.customers, invoice.customerId)} · Due ${new Date(`${invoice.dueDate}T12:00:00`).toLocaleDateString()}`,
      actionLabel: 'Open invoice',
    })
  })

  input.estimates.forEach((estimate) => {
    if (
      estimate.status !== 'sent' ||
      new Date(estimate.updatedAt).getTime() > nowTime - 2 * DAY_MS ||
      hasRecentCommunication(
        input.communications,
        'estimate_follow_up',
        estimate.id,
        nowTime - 3 * DAY_MS,
      )
    ) {
      return
    }

    actions.push({
      id: `estimate-${estimate.id}`,
      kind: 'estimate_follow_up',
      priority: 2,
      customerId: estimate.customerId,
      documentId: estimate.id,
      title: `Follow up on ${estimate.estimateNumber}`,
      detail: `${customerName(input.customers, estimate.customerId)} · ${estimate.jobName || 'Estimate'}`,
      actionLabel: 'Open estimate',
    })
  })

  input.appointments.forEach((appointment) => {
    const startTime = new Date(appointment.startAt).getTime()
    if (
      !['scheduled', 'confirmed'].includes(appointment.status) ||
      startTime < nowTime ||
      startTime > nowTime + 48 * 60 * 60_000 ||
      appointment.reminderSentAt ||
      hasRecentCommunication(
        input.communications,
        'appointment_reminder',
        appointment.id,
        nowTime - 2 * DAY_MS,
      )
    ) {
      return
    }

    actions.push({
      id: `appointment-${appointment.id}`,
      kind: 'appointment_reminder',
      priority: 3,
      customerId: appointment.customerId,
      appointmentId: appointment.id,
      title: `Confirm ${appointment.title}`,
      detail: `${customerName(input.customers, appointment.customerId)} · ${new Date(appointment.startAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}`,
      actionLabel: 'Open schedule',
    })
  })

  input.invoices.forEach((invoice) => {
    const paidAt = invoice.paidAt ? new Date(invoice.paidAt).getTime() : 0
    if (
      invoice.status !== 'paid' ||
      !paidAt ||
      paidAt < nowTime - 30 * DAY_MS ||
      paidAt > nowTime - DAY_MS ||
      input.communications.some(
        (item) => item.kind === 'review_request' && item.documentId === invoice.id,
      )
    ) {
      return
    }

    actions.push({
      id: `review-${invoice.id}`,
      kind: 'review_request',
      priority: 4,
      customerId: invoice.customerId,
      documentId: invoice.id,
      title: 'Ask for a review',
      detail: `${customerName(input.customers, invoice.customerId)} · ${invoice.jobName}`,
      actionLabel: 'Text review request',
    })
  })

  return actions.sort((first, second) => first.priority - second.priority)
}
