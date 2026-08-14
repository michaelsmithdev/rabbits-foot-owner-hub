import type { Customer } from '../customers/types/Customer'
import { APP_SETTINGS } from '../../config/appSettings.ts'

export function resolveCustomer(
  customers: Customer[],
  customerId: string,
) {
  return customers.find((customer) => customer.id === customerId) ?? null
}

export function normalizePhoneNumber(phone: string) {
  const trimmed = phone.trim()
  const hasLeadingPlus = trimmed.startsWith('+')
  const digits = trimmed.replace(/\D/g, '')

  if (!digits) return ''
  return `${hasLeadingPlus ? '+' : ''}${digits}`
}

export function getCustomerSmsRecipient(customer: Customer) {
  return normalizePhoneNumber(customer.phone)
}

export function openSmsComposer(customer: Customer, message: string) {
  const recipient = getCustomerSmsRecipient(customer)

  if (!recipient) {
    throw new Error('No phone number is saved for this customer.')
  }

  window.location.href = `sms:${recipient}?body=${encodeURIComponent(message)}`
}

export function buildReviewRequestMessage(customer: Customer) {
  const customerName = customer.firstName.trim()
  const greeting = customerName ? `Hi ${customerName},` : 'Hi,'

  return `${greeting} thank you for choosing ${APP_SETTINGS.business.name}. If you were happy with our work, would you mind leaving us a Google review? It really helps our small business: ${APP_SETTINGS.business.googleReviewUrl}`
}
