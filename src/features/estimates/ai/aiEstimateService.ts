import { cloudClient } from '../../cloud/cloudClient'
import { buildEstimateHistory } from './estimateHistory'
import { relevantPricebookItems } from '../../pricing/data/pricebookStore'
import { loadBusinessSettings } from '../../settings/data/businessSettingsStore'
import type {
  AiEstimateGeneration,
  AiEstimateRequest,
} from './types'

const REQUEST_TIMEOUT_MS = 55_000

export class AiEstimateServiceError extends Error {
  readonly code: string

  constructor(
    message: string,
    code: string,
  ) {
    super(message)
    this.name = 'AiEstimateServiceError'
    this.code = code
  }
}

function apiUrl(): string {
  const configuredOrigin = import.meta.env.VITE_OWNER_HUB_API_URL?.trim()
  const origin = configuredOrigin?.replace(/\/$/, '') ?? ''

  return `${origin}/api/ai-estimate`
}

function readErrorMessage(value: unknown): string | null {
  if (!value || typeof value !== 'object') return null
  const error = (value as { error?: unknown }).error

  return typeof error === 'string' ? error : null
}

export async function generateAiEstimate(input: {
  jobDescription: string
  answers: Record<string, string>
  customerId: string
  customerCity: string
  propertyType: 'residential' | 'commercial'
  jobCategory: string
  photos: Array<{ fileName: string; dataUrl: string }>
}): Promise<AiEstimateGeneration> {
  if (!cloudClient) {
    throw new AiEstimateServiceError(
      'Cloud authentication is required before using the AI Estimate Assistant.',
      'cloud_unavailable',
    )
  }

  const { data, error } = await cloudClient.auth.getSession()
  const accessToken = data.session?.access_token

  if (error || !accessToken) {
    throw new AiEstimateServiceError(
      'Your secure session expired. Sign in again and retry the estimate.',
      'authentication_required',
    )
  }

  const settings = loadBusinessSettings()
  const request: AiEstimateRequest = {
    jobDescription: input.jobDescription.trim(),
    answers: input.answers,
    customerCity: input.customerCity.trim(),
    propertyType: input.propertyType,
    jobCategory: input.jobCategory.trim(),
    history: buildEstimateHistory(input.jobDescription, input.customerId),
    photos: input.photos,
    pricingDefaults: {
      laborRate: settings.defaultLaborRate,
      minimumJobCharge: settings.minimumJobCharge,
      serviceCallCharge: settings.serviceCallCharge,
      diagnosticFee: settings.diagnosticFee,
      travelCharge: settings.travelCharge,
      afterHoursRatePercent: settings.afterHoursRatePercent,
      weekendRatePercent: settings.weekendRatePercent,
      emergencyRatePercent: settings.emergencyRatePercent,
      materialMarkupPercent: settings.defaultMaterialMarkupPercent,
      overheadPercent: settings.defaultOverheadPercent,
      targetGrossMarginPercent: settings.targetGrossMarginPercent,
      deliveryCost: settings.defaultDeliveryCost,
      disposalCost: settings.defaultDisposalCost,
    },
    pricebook: relevantPricebookItems(input.jobDescription).map((item) => ({
      name: item.name,
      category: item.category,
      unit: item.unit,
      unitCost: item.unitCost,
      customerPrice: item.customerPrice,
      notes: item.notes,
    })),
  }
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  try {
    const response = await fetch(apiUrl(), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
      signal: controller.signal,
    })
    const payload: unknown = await response.json().catch(() => null)

    if (!response.ok) {
      const message =
        readErrorMessage(payload) ??
        (response.status === 429
          ? 'The AI estimator is receiving too many requests. Wait briefly and retry.'
          : 'The AI estimate could not be generated. Please retry.')

      throw new AiEstimateServiceError(message, `http_${response.status}`)
    }

    if (!payload || typeof payload !== 'object' || !('draft' in payload)) {
      throw new AiEstimateServiceError(
        'The AI returned an incomplete estimate. Please regenerate it.',
        'invalid_response',
      )
    }

    return payload as AiEstimateGeneration
  } catch (requestError) {
    if (requestError instanceof AiEstimateServiceError) throw requestError

    if (requestError instanceof DOMException && requestError.name === 'AbortError') {
      throw new AiEstimateServiceError(
        'The AI estimate took too long. Your draft is safe—please retry.',
        'timeout',
      )
    }

    throw new AiEstimateServiceError(
      'The AI service could not be reached. Check your connection and retry.',
      'network_error',
    )
  } finally {
    window.clearTimeout(timeout)
  }
}
