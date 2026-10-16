import { cloudClient } from '../../cloud/cloudClient'
import {
  prepareEstimatePhoto,
  type PreparedEstimatePhoto,
} from '../../estimates/ai/estimatePhotos'
import type { ExpenseCategory, ReceiptFieldConfidence, ReceiptLineItem } from '../types/ExpenseRecord'

const REQUEST_TIMEOUT_MS = 45_000

export type ReceiptScanResult = {
  merchant: string
  purchaseDate: string
  subtotal: number
  tax: number
  total: number
  paymentMethod: string
  receiptNumber: string
  storeLocation: string
  suggestedCategory: ExpenseCategory
  description: string
  confidence: 'high' | 'medium' | 'low'
  lineItems: ReceiptLineItem[]
  fieldConfidence: ReceiptFieldConfidence
  warnings: string[]
}

export class ReceiptScannerError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ReceiptScannerError'
  }
}

function apiUrl() {
  const configuredOrigin = import.meta.env.VITE_OWNER_HUB_API_URL?.trim()
  const origin = configuredOrigin?.replace(/\/$/, '') ?? ''
  return `${origin}/api/receipt-scan`
}

function readErrorMessage(value: unknown) {
  if (!value || typeof value !== 'object') return null
  const error = (value as { error?: unknown }).error
  return typeof error === 'string' ? error : null
}

export async function prepareReceiptPhoto(file: File): Promise<PreparedEstimatePhoto> {
  return prepareEstimatePhoto(file)
}

export async function scanReceiptPhoto(photo: PreparedEstimatePhoto): Promise<ReceiptScanResult> {
  if (!cloudClient) {
    throw new ReceiptScannerError('Cloud sign-in is required for receipt scanning. You can still enter the receipt manually.')
  }

  const { data, error } = await cloudClient.auth.getSession()
  const accessToken = data.session?.access_token
  if (error || !accessToken) {
    throw new ReceiptScannerError('Your secure session expired. Sign in again or enter the receipt manually.')
  }

  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  try {
    const response = await fetch(apiUrl(), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'X-Owner-Hub-Organization': localStorage.getItem('owner-hub-active-organization') ?? '',
      },
      body: JSON.stringify({ fileName: photo.file.name, dataUrl: photo.dataUrl }),
      signal: controller.signal,
    })
    const payload: unknown = await response.json().catch(() => null)

    if (!response.ok) {
      throw new ReceiptScannerError(
        readErrorMessage(payload) ?? 'The receipt could not be scanned. Enter the details manually or retry.',
      )
    }
    if (!payload || typeof payload !== 'object' || !('merchant' in payload)) {
      throw new ReceiptScannerError('The scan was incomplete. Enter the receipt details manually.')
    }

    return payload as ReceiptScanResult
  } catch (requestError) {
    if (requestError instanceof ReceiptScannerError) throw requestError
    if (requestError instanceof DOMException && requestError.name === 'AbortError') {
      throw new ReceiptScannerError('The scan took too long. Your photo is still selected; retry or enter the details manually.')
    }
    throw new ReceiptScannerError('The scanner could not connect. Your photo is still selected; retry or enter the details manually.')
  } finally {
    window.clearTimeout(timeout)
  }
}
