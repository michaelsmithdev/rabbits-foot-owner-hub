import type { Customer } from '../types/Customer'
import { queueCollectionSync } from '../../cloud/syncQueue'

const STORAGE_KEY = 'rabbits-foot-customers'

const LEGACY_STORAGE_KEYS = [
  'rabbitfoot-customers',
  'rabbit-foot-customers',
]

function isCustomer(value: unknown): value is Customer {
  if (!value || typeof value !== 'object') {
    return false
  }

  const customer = value as Partial<Customer>

  return (
    typeof customer.id === 'string' &&
    typeof customer.firstName === 'string' &&
    typeof customer.lastName === 'string' &&
    typeof customer.phone === 'string' &&
    typeof customer.email === 'string' &&
    typeof customer.streetAddress === 'string' &&
    typeof customer.city === 'string' &&
    typeof customer.state === 'string' &&
    typeof customer.zipCode === 'string' &&
    typeof customer.notes === 'string' &&
    typeof customer.createdAt === 'string'
  )
}

function parseCustomers(storedValue: string | null): Customer[] {
  if (!storedValue) {
    return []
  }

  try {
    const parsedValue: unknown = JSON.parse(storedValue)

    if (!Array.isArray(parsedValue)) {
      return []
    }

    return parsedValue.filter(isCustomer)
  } catch {
    return []
  }
}

export function loadCustomers(): Customer[] {
  try {
    const currentCustomers = parseCustomers(
      localStorage.getItem(STORAGE_KEY),
    )

    if (currentCustomers.length > 0) {
      return currentCustomers
    }

    for (const legacyKey of LEGACY_STORAGE_KEYS) {
      const legacyCustomers = parseCustomers(
        localStorage.getItem(legacyKey),
      )

      if (legacyCustomers.length > 0) {
        localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify(legacyCustomers),
        )

        localStorage.removeItem(legacyKey)

        return legacyCustomers
      }
    }

    return []
  } catch (error) {
    console.error('Customer data could not be loaded.', error)
    return []
  }
}

export function saveCustomers(customers: Customer[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(customers))
    queueCollectionSync('customer', customers)
  } catch (error) {
    console.error('Customer data could not be saved.', error)
  }
}
