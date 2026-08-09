type PriceableLineItem = {
  unitPrice: number
}

function safePercent(percent: number): number {
  if (!Number.isFinite(percent)) return 0
  return Math.min(100, Math.max(0, percent))
}

export function applyPaymentOverheadToAmount(
  amount: number,
  percent: number,
): number {
  const safeAmount = Number.isFinite(amount) ? amount : 0
  return Math.round(safeAmount * (1 + safePercent(percent) / 100) * 100) / 100
}

export function applyPaymentOverheadToLineItems<T extends PriceableLineItem>(
  lineItems: T[],
  percent: number,
): T[] {
  return lineItems.map((lineItem) => ({
    ...lineItem,
    unitPrice: applyPaymentOverheadToAmount(lineItem.unitPrice, percent),
  }))
}
