export type JobCostingNumbers = {
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
}

function money(value: number) {
  return Math.round((Number.isFinite(value) ? value : 0) * 100) / 100
}

export function calculateJobCostingNumbers(input: {
  quotedRevenue: number
  actualRevenue: number
  estimatedMaterials: number
  actualMaterials: number
  estimatedLaborHours: number
  actualLaborHours: number
  estimatedLaborCost: number
  totalRecordedExpenses: number
  estimatedTotalCost: number
  internalLaborCostPerHour: number
}): JobCostingNumbers {
  const quotedRevenue = money(input.quotedRevenue)
  const actualRevenue = money(input.actualRevenue)
  const estimatedMaterials = money(input.estimatedMaterials)
  const actualMaterials = money(input.actualMaterials)
  const estimatedLaborHours = money(input.estimatedLaborHours)
  const actualLaborHours = money(input.actualLaborHours)
  const estimatedLaborCost = money(input.estimatedLaborCost)
  const laborCost = money(actualLaborHours * input.internalLaborCostPerHour)
  const otherExpenses = money(input.totalRecordedExpenses - actualMaterials)
  const estimatedTotalCost = money(input.estimatedTotalCost)
  const totalJobCost = money(laborCost + input.totalRecordedExpenses)
  const estimatedProfit = money(quotedRevenue - estimatedTotalCost)
  const grossProfit = money(actualRevenue - totalJobCost)

  return {
    quotedRevenue,
    actualRevenue,
    estimatedMaterials,
    actualMaterials,
    estimatedLaborHours,
    actualLaborHours,
    estimatedLaborCost,
    laborCost,
    otherExpenses,
    estimatedTotalCost,
    totalJobCost,
    estimatedProfit,
    grossProfit,
    estimatedMargin: quotedRevenue > 0 ? estimatedProfit / quotedRevenue * 100 : 0,
    grossMargin: actualRevenue > 0 ? grossProfit / actualRevenue * 100 : 0,
  }
}
