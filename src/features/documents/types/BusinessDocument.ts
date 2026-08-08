export type BusinessDocumentKind = 'estimate' | 'invoice'

export type BusinessDocumentRecord = {
  id: string
  sourceId: string
  kind: BusinessDocumentKind
  number: string
  customerName: string
  fileName: string
  createdAt: string
  nativePath?: string
}

export type PdfLineItem = {
  description: string
  quantity: number
  unitPrice: number
}

export type PdfDocumentInput = {
  id: string
  kind: BusinessDocumentKind
  number: string
  customerName: string
  customerEmail?: string
  customerPhone?: string
  customerAddress?: string
  jobName: string
  serviceAddress: string
  description: string
  scopeOfWork?: string
  exclusions?: string[]
  issueDate: string
  dueDate: string
  lineItems: PdfLineItem[]
  taxRate: number
  discount: number
  notes: string
  terms: string
}
