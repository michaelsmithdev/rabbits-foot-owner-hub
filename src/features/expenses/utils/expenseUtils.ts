import type { ExpenseCategory, ExpenseRecord } from '../types/ExpenseRecord'

export const expenseCategoryLabels: Record<ExpenseCategory, string> = {
  materials: 'Materials',
  tools: 'Tools',
  fuel: 'Gas / fuel',
  vehicle: 'Vehicle parts',
  subcontractor: 'Subcontractor',
  equipment_rental: 'Equipment rental',
  office: 'Office',
  advertising: 'Advertising',
  software: 'Software',
  insurance: 'Insurance',
  permits: 'Permits',
  miscellaneous: 'Miscellaneous',
}

export function receiptPhotoDescription(category: ExpenseCategory) {
  if (category === 'fuel') return 'Receipt/Gas'
  if (category === 'vehicle') return 'Receipt/Vehicle Part'
  return 'Receipt/Material'
}

export function expenseAmountLabel(category: ExpenseCategory) {
  if (category === 'materials') return 'Material cost'
  if (category === 'fuel') return 'Gas cost'
  if (category === 'vehicle') return 'Vehicle parts cost'
  return 'Receipt total'
}

export function money(value: number) {
  return Math.round(Math.max(0, Number.isFinite(value) ? value : 0) * 100) / 100
}

export function expenseTotals(
  expenses: ExpenseRecord[],
  startDate: string,
  endDate = '9999-12-31',
) {
  const totals: Record<ExpenseCategory | 'all', number> = {
    materials: 0,
    tools: 0,
    fuel: 0,
    vehicle: 0,
    subcontractor: 0,
    equipment_rental: 0,
    office: 0,
    advertising: 0,
    software: 0,
    insurance: 0,
    permits: 0,
    miscellaneous: 0,
    all: 0,
  }

  expenses
    .filter((expense) => expense.purchaseDate >= startDate && expense.purchaseDate <= endDate)
    .forEach((expense) => {
      totals[expense.category] = money(totals[expense.category] + expense.total)
      totals.all = money(totals.all + expense.total)
    })

  return totals
}

function csvCell(value: string | number | boolean) {
  const text = String(value).replace(/\r?\n/g, ' ')
  return /[",]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

export function expensesToCsv(
  expenses: ExpenseRecord[],
  customerNames: Readonly<Record<string, string>> = {},
) {
  const header = [
    'Date', 'Category', 'Merchant', 'Description', 'Subtotal',
    'Tax', 'Total', 'Payment Method', 'Receipt Number', 'Store Location',
    'Billable', 'Customer', 'Customer ID', 'Job ID', 'Notes',
  ]
  const rows = expenses.map((expense) => [
    expense.purchaseDate,
    expense.category,
    expense.merchant,
    expense.description,
    expense.subtotal.toFixed(2),
    expense.tax.toFixed(2),
    expense.total.toFixed(2),
    expense.paymentMethod,
    expense.receiptNumber,
    expense.storeLocation,
    expense.billable,
    expense.customerId ? customerNames[expense.customerId] ?? '' : '',
    expense.customerId ?? '',
    expense.jobId ?? '',
    expense.notes,
  ])

  return [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n')
}
