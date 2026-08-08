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
  defaultLaborRate: 45,
  minimumJobCharge: 125,
  serviceCallCharge: 65,
  diagnosticFee: 65,
  travelCharge: 0,
  afterHoursRatePercent: 25,
  weekendRatePercent: 25,
  emergencyRatePercent: 50,
  defaultMaterialMarkupPercent: 25,
  defaultOverheadPercent: 12,
  targetGrossMarginPercent: 35,
  defaultDeliveryCost: 0,
  defaultDisposalCost: 0,
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
          ...defaultBusinessSettings,
          ...settingsRecord,
          defaultTaxReservePercent:
            typeof settingsRecord.defaultTaxReservePercent === 'number'
              ? settingsRecord.defaultTaxReservePercent
              : defaultBusinessSettings.defaultTaxReservePercent,
          defaultLaborRate:
            typeof settingsRecord.defaultLaborRate === 'number'
              ? settingsRecord.defaultLaborRate
              : defaultBusinessSettings.defaultLaborRate,
          minimumJobCharge:
            typeof settingsRecord.minimumJobCharge === 'number'
              ? settingsRecord.minimumJobCharge
              : defaultBusinessSettings.minimumJobCharge,
          serviceCallCharge:
            typeof settingsRecord.serviceCallCharge === 'number'
              ? settingsRecord.serviceCallCharge
              : defaultBusinessSettings.serviceCallCharge,
          diagnosticFee:
            typeof settingsRecord.diagnosticFee === 'number'
              ? settingsRecord.diagnosticFee
              : defaultBusinessSettings.diagnosticFee,
          travelCharge:
            typeof settingsRecord.travelCharge === 'number'
              ? settingsRecord.travelCharge
              : defaultBusinessSettings.travelCharge,
          afterHoursRatePercent:
            typeof settingsRecord.afterHoursRatePercent === 'number'
              ? settingsRecord.afterHoursRatePercent
              : defaultBusinessSettings.afterHoursRatePercent,
          weekendRatePercent:
            typeof settingsRecord.weekendRatePercent === 'number'
              ? settingsRecord.weekendRatePercent
              : defaultBusinessSettings.weekendRatePercent,
          emergencyRatePercent:
            typeof settingsRecord.emergencyRatePercent === 'number'
              ? settingsRecord.emergencyRatePercent
              : defaultBusinessSettings.emergencyRatePercent,
          defaultMaterialMarkupPercent:
            typeof settingsRecord.defaultMaterialMarkupPercent === 'number'
              ? settingsRecord.defaultMaterialMarkupPercent
              : defaultBusinessSettings.defaultMaterialMarkupPercent,
          defaultOverheadPercent:
            typeof settingsRecord.defaultOverheadPercent === 'number'
              ? settingsRecord.defaultOverheadPercent
              : defaultBusinessSettings.defaultOverheadPercent,
          targetGrossMarginPercent:
            typeof settingsRecord.targetGrossMarginPercent === 'number'
              ? settingsRecord.targetGrossMarginPercent
              : defaultBusinessSettings.targetGrossMarginPercent,
          defaultDeliveryCost:
            typeof settingsRecord.defaultDeliveryCost === 'number'
              ? settingsRecord.defaultDeliveryCost
              : defaultBusinessSettings.defaultDeliveryCost,
          defaultDisposalCost:
            typeof settingsRecord.defaultDisposalCost === 'number'
              ? settingsRecord.defaultDisposalCost
              : defaultBusinessSettings.defaultDisposalCost,
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
