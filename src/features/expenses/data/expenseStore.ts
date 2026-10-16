import { queueCollectionSync } from '../../cloud/syncQueue'
import { recordBusinessEvent } from '../../aiOperations/data/operationsStore'
import { loadJobs } from '../../jobs/data/jobStore'
import type { ExpenseCategory, ExpenseRecord } from '../types/ExpenseRecord'

export const EXPENSES_STORAGE_KEY = 'rabbits-foot-expenses'
const categories: ExpenseCategory[] = [
  'materials', 'tools', 'fuel', 'vehicle', 'subcontractor',
  'equipment_rental', 'office', 'advertising', 'software', 'insurance',
  'permits', 'miscellaneous',
]

function normalizeCategory(value: unknown): ExpenseCategory {
  if (value === 'gas') return 'fuel'
  if (value === 'other') return 'vehicle'
  return categories.includes(value as ExpenseCategory)
    ? value as ExpenseCategory
    : 'miscellaneous'
}

function isExpenseRecord(value: unknown): value is ExpenseRecord {
  if (!value || typeof value !== 'object') return false
  const record = value as Partial<ExpenseRecord>

  return (
    typeof record.id === 'string' &&
    typeof record.category === 'string' &&
    typeof record.merchant === 'string' &&
    typeof record.purchaseDate === 'string' &&
    typeof record.description === 'string' &&
    typeof record.subtotal === 'number' &&
    typeof record.tax === 'number' &&
    typeof record.total === 'number' &&
    typeof record.notes === 'string' &&
    (record.customerId === undefined || record.customerId === null || typeof record.customerId === 'string') &&
    (record.jobId === null || typeof record.jobId === 'string') &&
    typeof record.billable === 'boolean' &&
    (record.receiptPhotoId === null || typeof record.receiptPhotoId === 'string') &&
    Array.isArray(record.lineItems) &&
    (record.scanConfidence === null || ['high', 'medium', 'low'].includes(record.scanConfidence ?? '')) &&
    typeof record.createdAt === 'string' &&
    typeof record.updatedAt === 'string'
  )
}

export function loadExpenses(): ExpenseRecord[] {
  try {
    const stored = localStorage.getItem(EXPENSES_STORAGE_KEY)
    const parsed: unknown = stored ? JSON.parse(stored) : []
    const jobsById = new Map(loadJobs().map((job) => [job.id, job]))

    return Array.isArray(parsed)
      ? parsed.filter(isExpenseRecord).map((record) => ({
          ...record,
          category: normalizeCategory(record.category),
          customerId: typeof record.customerId === 'string'
            ? record.customerId
            : (record.jobId ? jobsById.get(record.jobId)?.customerId ?? null : null),
          paymentMethod: typeof record.paymentMethod === 'string' ? record.paymentMethod : '',
          receiptNumber: typeof record.receiptNumber === 'string' ? record.receiptNumber : '',
          storeLocation: typeof record.storeLocation === 'string' ? record.storeLocation : '',
          lineItems: record.lineItems.map((item) => ({
            description: typeof item.description === 'string' ? item.description : '',
            quantity: typeof item.quantity === 'number' ? item.quantity : null,
            unitPrice: typeof item.unitPrice === 'number' ? item.unitPrice : null,
            amount: typeof item.amount === 'number' ? item.amount : 0,
            confidence: typeof item.confidence === 'number' ? item.confidence : 0,
          })),
          fieldConfidence: record.fieldConfidence && typeof record.fieldConfidence === 'object'
            ? record.fieldConfidence
            : null,
          suggestedJobId: typeof record.suggestedJobId === 'string' ? record.suggestedJobId : null,
          jobMatchConfidence: typeof record.jobMatchConfidence === 'number' ? record.jobMatchConfidence : null,
          jobMatchReason: typeof record.jobMatchReason === 'string' ? record.jobMatchReason : '',
        })).sort((first, second) =>
          second.purchaseDate.localeCompare(first.purchaseDate) ||
          second.createdAt.localeCompare(first.createdAt),
        )
      : []
  } catch {
    return []
  }
}

export function saveExpenses(expenses: ExpenseRecord[]) {
  const previous = loadExpenses()
  localStorage.setItem(EXPENSES_STORAGE_KEY, JSON.stringify(expenses))
  try {
    queueCollectionSync('expense', expenses)
    const previousById = new Map(previous.map((expense) => [expense.id, expense]))
    expenses.forEach((expense) => {
      const oldExpense = previousById.get(expense.id)
      if (oldExpense && JSON.stringify(oldExpense) === JSON.stringify(expense)) return
      recordBusinessEvent({
        type: oldExpense ? 'expense_updated' : 'expense_created',
        timestamp: expense.updatedAt,
        entityType: 'expense',
        entityId: expense.id,
        customerId: expense.customerId ?? undefined,
        jobId: expense.jobId ?? undefined,
        metadata: { category: expense.category, total: expense.total },
      })
      if (expense.receiptPhotoId) {
        recordBusinessEvent({
          type: 'receipt_processed',
          timestamp: expense.updatedAt,
          entityType: 'expense',
          entityId: expense.id,
          customerId: expense.customerId ?? undefined,
          jobId: expense.jobId ?? undefined,
          metadata: { confidence: expense.scanConfidence, total: expense.total },
        })
      }
    })
    return true
  } catch {
    return false
  }
}
