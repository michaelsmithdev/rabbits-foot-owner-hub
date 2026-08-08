export type PricebookCategory =
  | 'labor'
  | 'material'
  | 'service'
  | 'equipment'
  | 'delivery'
  | 'disposal'
  | 'subcontractor'
  | 'other'

export type PricebookItem = {
  id: string
  name: string
  category: PricebookCategory
  unit: string
  unitCost: number
  customerPrice: number
  notes: string
  active: boolean
  createdAt: string
  updatedAt: string
}
