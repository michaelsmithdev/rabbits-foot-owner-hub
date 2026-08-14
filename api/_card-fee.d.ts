export type CardFeePayload = Record<string, unknown>

export type CardCheckoutAmounts = {
  invoiceAmount: number
  feePercent: number
  feeAmount: number
  checkoutAmount: number
}

export function cardFeePercent(payload: CardFeePayload): number
export function cardCheckoutAmounts(invoiceAmount: number, payload: CardFeePayload): CardCheckoutAmounts
