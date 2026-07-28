import type { Invoice } from '../types/Invoice'

const INVOICES_STORAGE_KEY =
  'rabbits-foot-invoices'

export function loadInvoices(): Invoice[] {
  try {
    const storedInvoices = localStorage.getItem(
      INVOICES_STORAGE_KEY,
    )

    if (!storedInvoices) {
      return []
    }

    const parsedInvoices = JSON.parse(
      storedInvoices,
    )

    return Array.isArray(parsedInvoices)
      ? parsedInvoices
      : []
  } catch (error) {
    console.error(
      'Unable to load invoices:',
      error,
    )

    return []
  }
}

export function saveInvoices(
  invoices: Invoice[],
) {
  try {
    localStorage.setItem(
      INVOICES_STORAGE_KEY,
      JSON.stringify(invoices),
    )
  } catch (error) {
    console.error(
      'Unable to save invoices:',
      error,
    )
  }
}

export function createInvoiceNumber(
  invoices: Invoice[],
) {
  const currentYear = new Date().getFullYear()

  const invoiceNumbers = invoices
    .map((invoice) => {
      const match = invoice.invoiceNumber.match(
        /^INV-(\d{4})-(\d+)$/,
      )

      if (!match) {
        return null
      }

      const invoiceYear = Number(match[1])
      const sequenceNumber = Number(match[2])

      if (invoiceYear !== currentYear) {
        return null
      }

      return sequenceNumber
    })
    .filter(
      (number): number is number =>
        number !== null,
    )

  const nextSequence =
    invoiceNumbers.length > 0
      ? Math.max(...invoiceNumbers) + 1
      : 1

  return `INV-${currentYear}-${String(
    nextSequence,
  ).padStart(4, '0')}`
}