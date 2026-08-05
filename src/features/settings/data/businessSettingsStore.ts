import { queueCollectionSync } from '../../cloud/syncQueue'
import type { BusinessSettings } from '../types/BusinessSettings'

const SETTINGS_STORAGE_KEY = 'rabbits-foot-business-settings'

export const defaultBusinessSettings: BusinessSettings = {
  id: 'business-settings',
  businessName: "Rabbit's Foot Handyman Services",
  phone: '(574) 703-5978',
  email: 'callrabbitsfoot@gmail.com',
  website: 'callrabbitsfoot.com',
  streetAddress: '',
  city: '',
  state: 'IN',
  zipCode: '',
  defaultTaxRate: 0,
  defaultTaxReservePercent: 30,
  darkMode: false,
  estimateValidDays: 30,
  invoiceDueDays: 14,
  estimatePrefix: 'EST',
  invoicePrefix: 'INV',
  estimateTerms: 'Estimate valid for 30 days.',
  invoiceTerms: 'Payment is due within 14 days.',
  emailNotifications: true,
  leadNotifications: true,
  updatedAt: new Date(0).toISOString(),
}

function isBusinessSettings(value: unknown): value is BusinessSettings {
  if (!value || typeof value !== 'object') return false

  const settings = value as Partial<BusinessSettings>

  return (
    settings.id === 'business-settings' &&
    typeof settings.businessName === 'string' &&
    typeof settings.phone === 'string' &&
    typeof settings.email === 'string' &&
    typeof settings.website === 'string' &&
    typeof settings.streetAddress === 'string' &&
    typeof settings.city === 'string' &&
    typeof settings.state === 'string' &&
    typeof settings.zipCode === 'string' &&
    typeof settings.defaultTaxRate === 'number' &&
    typeof settings.estimateValidDays === 'number' &&
    typeof settings.invoiceDueDays === 'number' &&
    typeof settings.estimatePrefix === 'string' &&
    typeof settings.invoicePrefix === 'string' &&
    typeof settings.estimateTerms === 'string' &&
    typeof settings.invoiceTerms === 'string' &&
    typeof settings.emailNotifications === 'boolean' &&
    typeof settings.leadNotifications === 'boolean' &&
    typeof settings.updatedAt === 'string'
  )
}

export function loadBusinessSettings(): BusinessSettings {
  try {
    const storedSettings = localStorage.getItem(SETTINGS_STORAGE_KEY)

    if (!storedSettings) return { ...defaultBusinessSettings }

    const parsedSettings: unknown = JSON.parse(storedSettings)
    const settingsRecord = Array.isArray(parsedSettings)
      ? parsedSettings[0]
      : parsedSettings

    return isBusinessSettings(settingsRecord)
      ? {
          ...settingsRecord,
          defaultTaxReservePercent:
            typeof settingsRecord.defaultTaxReservePercent === 'number'
              ? settingsRecord.defaultTaxReservePercent
              : 30,
          darkMode:
            typeof settingsRecord.darkMode === 'boolean'
              ? settingsRecord.darkMode
              : false,
        }
      : { ...defaultBusinessSettings }
  } catch {
    return { ...defaultBusinessSettings }
  }
}

export function saveBusinessSettings(settings: BusinessSettings) {
  localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify([settings]))
  queueCollectionSync('settings', [settings])
}
