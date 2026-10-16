export type ExpenseCategory =
  | 'materials'
  | 'tools'
  | 'fuel'
  | 'vehicle'
  | 'subcontractor'
  | 'equipment_rental'
  | 'office'
  | 'advertising'
  | 'software'
  | 'insurance'
  | 'permits'
  | 'miscellaneous'

export type ReceiptFieldConfidence = {
  merchant: number
  purchaseDate: number
  subtotal: number
  tax: number
  total: number
  paymentMethod: number
  receiptNumber: number
}

export type ReceiptLineItem = {
  description: string
  quantity: number | null
  unitPrice: number | null
  amount: number
  confidence: number
}

export type ExpenseRecord = {
  id: string
  category: ExpenseCategory
  merchant: string
  purchaseDate: string
  description: string
  subtotal: number
  tax: number
  total: number
  paymentMethod: string
  receiptNumber: string
  storeLocation: string
  notes: string
  customerId: string | null
  jobId: string | null
  billable: boolean
  receiptPhotoId: string | null
  lineItems: ReceiptLineItem[]
  scanConfidence: 'high' | 'medium' | 'low' | null
  fieldConfidence: ReceiptFieldConfidence | null
  suggestedJobId: string | null
  jobMatchConfidence: number | null
  jobMatchReason: string
  createdAt: string
  updatedAt: string
}
