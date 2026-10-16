import type { Estimate } from '../../estimates/types/Estimate'
import type { ExpenseRecord } from '../../expenses/types/ExpenseRecord'
import type { Invoice } from '../../invoices/types/Invoice'
import { calculateInvoiceBalance, calculateInvoiceTotal } from '../../invoices/utils/invoiceMath'
import type { Job } from '../../jobs/types/Job'
import { calculateJobCosting } from '../../jobs/utils/jobCosting'

export type DateRange = { start: string; end: string }

export type ProfitabilityMetrics = {
  totalRevenue: number
  totalExpenses: number
  grossProfit: number
  grossMargin: number
  outstandingInvoices: number
  averageJobValue: number
  averageMaterialPercentage: number
  mostProfitableServiceType: string
  leastProfitableServiceType: string
  estimateWinRate: number
  averageActualVsEstimatedCost: number
  unpaidRevenue: number
  completedJobs: number
}

function inRange(value: string | null | undefined, range: DateRange) {
  if (!value) return false
  const date = value.slice(0, 10)
  return date >= range.start && date <= range.end
}

function money(value: number) {
  return Math.round((Number.isFinite(value) ? value : 0) * 100) / 100
}

export function calculateProfitabilityMetrics(input: {
  estimates: Estimate[]
  invoices: Invoice[]
  jobs: Job[]
  expenses: ExpenseRecord[]
  internalLaborCostPerHour: number
  range: DateRange
}): ProfitabilityMetrics {
  const { estimates, invoices, jobs, expenses, internalLaborCostPerHour, range } = input
  const paidInvoices = invoices.filter((invoice) =>
    invoice.status === 'paid' && inRange(invoice.paidAt ?? invoice.updatedAt, range),
  )
  const totalRevenue = money(paidInvoices.reduce((sum, invoice) => sum + calculateInvoiceTotal(invoice), 0))
  const rangeExpenses = expenses.filter((expense) => inRange(expense.purchaseDate, range))
  const totalExpenses = money(rangeExpenses.reduce((sum, expense) => sum + expense.total, 0))
  const completedJobs = jobs.filter((job) =>
    ['completed', 'invoiced'].includes(job.status) && inRange(job.completedAt ?? job.updatedAt, range),
  )
  const actualRevenueByJob = new Map(invoices.map((invoice) => [invoice.jobId, calculateInvoiceTotal(invoice)]))
  const jobSummaries = completedJobs.map((job) =>
    calculateJobCosting(
      job,
      internalLaborCostPerHour,
      actualRevenueByJob.get(job.id),
    ),
  )
  const totalJobCost = money(jobSummaries.reduce((sum, summary) => sum + summary.totalJobCost, 0))
  const grossProfit = money(totalRevenue - totalJobCost)
  const outstandingInvoices = money(invoices
    .filter((invoice) => !['paid', 'void'].includes(invoice.status))
    .reduce((sum, invoice) => sum + calculateInvoiceBalance(invoice), 0))
  const totalJobRevenue = jobSummaries.reduce((sum, summary) => sum + summary.actualRevenue, 0)
  const totalMaterials = jobSummaries.reduce((sum, summary) => sum + summary.actualMaterials, 0)
  const decidedEstimates = estimates.filter((estimate) => ['approved', 'declined'].includes(estimate.status))
  const wonEstimates = decidedEstimates.filter((estimate) => estimate.status === 'approved')
  const costVariance = jobSummaries.map((summary) => summary.totalJobCost - summary.estimatedTotalCost)

  const estimateById = new Map(estimates.map((estimate) => [estimate.id, estimate]))
  const serviceGroups = new Map<string, { profit: number; count: number }>()
  completedJobs.forEach((job, index) => {
    const service = estimateById.get(job.estimateId)?.jobCategory?.trim() || job.jobName.trim() || 'General handyman'
    const current = serviceGroups.get(service) ?? { profit: 0, count: 0 }
    current.profit += jobSummaries[index]?.grossProfit ?? 0
    current.count += 1
    serviceGroups.set(service, current)
  })
  const rankedServices = [...serviceGroups.entries()]
    .map(([service, value]) => ({ service, averageProfit: value.profit / value.count }))
    .sort((first, second) => second.averageProfit - first.averageProfit)

  return {
    totalRevenue,
    totalExpenses,
    grossProfit,
    grossMargin: totalRevenue > 0 ? grossProfit / totalRevenue * 100 : 0,
    outstandingInvoices,
    averageJobValue: jobSummaries.length > 0 ? money(totalJobRevenue / jobSummaries.length) : 0,
    averageMaterialPercentage: totalJobRevenue > 0 ? totalMaterials / totalJobRevenue * 100 : 0,
    mostProfitableServiceType: rankedServices[0]?.service ?? 'Not enough completed jobs',
    leastProfitableServiceType: rankedServices.at(-1)?.service ?? 'Not enough completed jobs',
    estimateWinRate: decidedEstimates.length > 0 ? wonEstimates.length / decidedEstimates.length * 100 : 0,
    averageActualVsEstimatedCost: costVariance.length > 0
      ? money(costVariance.reduce((sum, variance) => sum + variance, 0) / costVariance.length)
      : 0,
    unpaidRevenue: outstandingInvoices,
    completedJobs: completedJobs.length,
  }
}

export function dateRangeForPreset(
  preset: 'today' | 'week' | 'month' | 'last_month',
  now = new Date(),
): DateRange {
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000)
  const today = local.toISOString().slice(0, 10)
  if (preset === 'today') return { start: today, end: today }
  if (preset === 'week') {
    const start = new Date(local)
    const weekday = (start.getDay() + 6) % 7
    start.setDate(start.getDate() - weekday)
    return { start: start.toISOString().slice(0, 10), end: today }
  }
  if (preset === 'last_month') {
    const start = new Date(local.getFullYear(), local.getMonth() - 1, 1)
    const end = new Date(local.getFullYear(), local.getMonth(), 0)
    return {
      start: new Date(start.getTime() - start.getTimezoneOffset() * 60_000).toISOString().slice(0, 10),
      end: new Date(end.getTime() - end.getTimezoneOffset() * 60_000).toISOString().slice(0, 10),
    }
  }
  return { start: `${today.slice(0, 7)}-01`, end: today }
}
