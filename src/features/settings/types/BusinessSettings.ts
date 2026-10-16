export interface BusinessSettings {
  id: 'business-settings'
  businessContactVersion: number
  businessName: string
  phone: string
  email: string
  website: string
  streetAddress: string
  city: string
  state: string
  zipCode: string
  defaultTaxRate: number
  defaultTaxReservePercent: number
  /** Customer-facing hourly rate used when building estimate and invoice pricing. */
  defaultLaborRate: number
  /** Private owner cost used only for profitability and job-cost calculations. */
  internalLaborCostPerHour: number
  minimumJobCharge: number
  serviceCallCharge: number
  diagnosticFee: number
  travelCharge: number
  afterHoursRatePercent: number
  weekendRatePercent: number
  emergencyRatePercent: number
  defaultMaterialMarkupPercent: number
  defaultOverheadPercent: number
  paymentProcessingOverheadPercent: number
  targetGrossMarginPercent: number
  defaultDeliveryCost: number
  defaultDisposalCost: number
  darkMode: boolean
  estimateValidDays: number
  invoiceDueDays: number
  estimatePrefix: string
  invoicePrefix: string
  estimateTerms: string
  invoiceTerms: string
  emailNotifications: boolean
  leadNotifications: boolean
  updatedAt: string
}
