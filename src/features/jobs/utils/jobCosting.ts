import type { Job } from '../types/Job'
import { actualJobHours } from '../data/jobStore'
import { approvedChangeOrderTotal } from './jobMath'
import { calculateJobCostingNumbers } from './jobCostingMath'

export type JobCostingSummary = {
  quotedRevenue: number
  actualRevenue: number
  estimatedMaterials: number
  actualMaterials: number
  estimatedLaborHours: number
  actualLaborHours: number
  estimatedLaborCost: number
  laborCost: number
  otherExpenses: number
  estimatedTotalCost: number
  totalJobCost: number
  estimatedProfit: number
  grossProfit: number
  estimatedMargin: number
  grossMargin: number
  approvedChangeOrderTotal: number
}

function money(value: number) {
  return Math.round((Number.isFinite(value) ? value : 0) * 100) / 100
}

export function calculateJobCosting(
  job: Job,
  internalLaborCostPerHour: number,
  actualRevenue = job.quotedPrice + approvedChangeOrderTotal(job.changeOrders),
  now = Date.now(),
): JobCostingSummary {
  const approvedChanges = job.changeOrders.filter((item) => item.status === 'approved')
  const changeLaborHours = approvedChanges.reduce((sum, item) => sum + item.additionalLaborHours, 0)
  const changeMaterialCost = approvedChanges.reduce((sum, item) => sum + item.estimatedMaterialCost, 0)
  const changeRevenue = approvedChangeOrderTotal(job.changeOrders)
  const actualMaterials = money(job.expenses
    .filter((expense) => expense.category === 'materials')
    .reduce((sum, expense) => sum + expense.amount, 0))
  const totalExpenses = money(job.expenses.reduce((sum, expense) => sum + expense.amount, 0))
  return {
    ...calculateJobCostingNumbers({
      quotedRevenue: job.quotedPrice + changeRevenue,
      actualRevenue,
      estimatedMaterials: job.estimatedMaterialCost + changeMaterialCost,
      actualMaterials,
      estimatedLaborHours: job.estimatedLaborHours + changeLaborHours,
      actualLaborHours: actualJobHours(job, now),
      estimatedLaborCost: job.estimatedLaborCost + changeLaborHours * internalLaborCostPerHour,
      totalRecordedExpenses: totalExpenses,
      estimatedTotalCost: job.estimatedCost + changeLaborHours * internalLaborCostPerHour + changeMaterialCost,
      internalLaborCostPerHour,
    }),
    approvedChangeOrderTotal: changeRevenue,
  }
}
