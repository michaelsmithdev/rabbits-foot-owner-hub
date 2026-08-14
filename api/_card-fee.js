function cents(value) {
  return Math.round(value * 100) / 100
}

export function cardFeePercent(payload) {
  const raw = payload.cardProcessingFeePercent
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return 0
  return Math.min(15, Math.max(0, raw))
}

export function cardCheckoutAmounts(invoiceAmount, payload) {
  const safeInvoiceAmount = Math.max(0, cents(invoiceAmount))
  const percent = cardFeePercent(payload)
  const feeAmount = cents(safeInvoiceAmount * percent / 100)
  return {
    invoiceAmount: safeInvoiceAmount,
    feePercent: percent,
    feeAmount,
    checkoutAmount: cents(safeInvoiceAmount + feeAmount),
  }
}
