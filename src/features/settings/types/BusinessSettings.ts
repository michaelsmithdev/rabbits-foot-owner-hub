export interface BusinessSettings {
  id: 'business-settings'
  businessName: string
  phone: string
  email: string
  website: string
  streetAddress: string
  city: string
  state: string
  zipCode: string
  defaultTaxRate: number
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
