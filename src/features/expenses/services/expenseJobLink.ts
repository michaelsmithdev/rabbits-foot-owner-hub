import { loadJobs, saveJobs } from '../../jobs/data/jobStore'
import type { Job, JobExpenseCategory } from '../../jobs/types/Job'
import type { ExpenseCategory, ExpenseRecord } from '../types/ExpenseRecord'

function categoryForJob(category: ExpenseCategory): JobExpenseCategory {
  if (category === 'equipment_rental') return 'equipment'
  return category
}

export function syncExpenseToJobs(expense: ExpenseRecord | null, expenseId: string) {
  const jobs = loadJobs()
  const nextJobs = jobs.map((job): Job => {
    const withoutExpense = job.expenses.filter((item) => item.id !== expenseId)
    if (!expense || expense.jobId !== job.id) {
      return withoutExpense.length === job.expenses.length
        ? job
        : { ...job, expenses: withoutExpense, updatedAt: new Date().toISOString() }
    }

    return {
      ...job,
      expenses: [
        ...withoutExpense,
        {
          id: expense.id,
          category: categoryForJob(expense.category),
          description: expense.description || `${expense.category} purchase`,
          vendor: expense.merchant,
          notes: expense.notes,
          amount: expense.total,
          billable: expense.billable,
          receiptPhotoIds: expense.receiptPhotoId ? [expense.receiptPhotoId] : [],
          createdAt: expense.createdAt,
        },
      ],
      updatedAt: new Date().toISOString(),
    }
  })

  if (JSON.stringify(nextJobs) !== JSON.stringify(jobs)) saveJobs(nextJobs)
}
