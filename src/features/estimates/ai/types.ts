export type AiEstimateLineItem = {
  description: string
  quantity: number
  unit: string
  unitPrice: number
  total: number
}

export type AiEstimatePhotoInput = {
  fileName: string
  dataUrl: string
  context?: string
}

export type EvidenceClassification =
  | 'OBSERVED'
  | 'CONTRACTOR_PROVIDED'
  | 'INFERRED'
  | 'UNKNOWN'

export type AiJobAnalysis = {
  customerRequest: string
  scope: string[]
  quantities: string[]
  dimensions: string[]
  units: string[]
  crewSize: number
  laborOperations: string[]
  demolition: string[]
  preparation: string[]
  installation: string[]
  materials: string[]
  equipment: string[]
  delivery: string
  disposal: string
  afterHours: string
  subcontractors: string[]
  permitConcerns: string[]
  licensingConcerns: string[]
  access: string
  assumptions: string[]
  exclusions: string[]
  unknowns: string[]
  evidence: Array<{
    statement: string
    classification: EvidenceClassification
  }>
}

export type AiEstimateEconomics = {
  laborHours: number
  laborCost: number
  materialCost: number
  materialMarkup: number
  equipmentCost: number
  deliveryCost: number
  disposalCost: number
  subcontractorCost: number
  overheadCost: number
  contingencyCost: number
  totalEstimatedCost: number
  recommendedLow: number
  recommendedHigh: number
  recommendedPrice: number
  projectedGrossProfit: number
  projectedMargin: number
  effectiveHourlyRevenue: number
}

export type EstimatePricingDefaults = {
  laborRate: number
  minimumJobCharge: number
  serviceCallCharge: number
  diagnosticFee: number
  travelCharge: number
  afterHoursRatePercent: number
  weekendRatePercent: number
  emergencyRatePercent: number
  materialMarkupPercent: number
  overheadPercent: number
  targetGrossMarginPercent: number
  deliveryCost: number
  disposalCost: number
}

export type EstimatePricebookItem = {
  name: string
  category: string
  unit: string
  unitCost: number
  customerPrice: number
  notes: string
}

export type AiEstimateResult = {
  jobTitle: string
  summary: string
  recommendedBid: number
  laborHours: number
  laborCost: number
  materialCost: number
  markup: number
  difficulty: string
  confidence: string
  estimatedDuration: string
  customerNotes: string
  contractorNotes: string
  customerScope: string
  exclusions: string[]
  warnings: string[]
  pricingSources: string[]
  analysis: AiJobAnalysis
  economics: AiEstimateEconomics
  questions: string[]
  lineItems: AiEstimateLineItem[]
}

export type AiEstimateGeneration = {
  jobDescription: string
  generatedAt: string
  model: string
  historyUsed: number
  photoIds?: string[]
  voiceNotes?: import('../../voice/types/VoiceNote.js').VoiceNote[]
  draft: AiEstimateResult
}

export type EstimateHistoryItem = {
  source: 'estimate' | 'invoice'
  documentNumber: string
  jobTitle: string
  jobDescription: string
  finalTotal: number
  laborHours: number
  laborCost: number
  materialCost: number
  completionDate: string
  customerCity: string
  propertyType: 'residential' | 'commercial'
  jobCategory: string
  lineItems: AiEstimateLineItem[]
}

export type AiEstimateRequest = {
  jobDescription: string
  answers: Record<string, string>
  customerCity: string
  propertyType: 'residential' | 'commercial'
  jobCategory: string
  history: EstimateHistoryItem[]
  photos: AiEstimatePhotoInput[]
  pricingDefaults: EstimatePricingDefaults
  pricebook: EstimatePricebookItem[]
}

export const aiEstimateJsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'jobTitle',
    'summary',
    'recommendedBid',
    'laborHours',
    'laborCost',
    'materialCost',
    'markup',
    'difficulty',
    'confidence',
    'estimatedDuration',
    'customerNotes',
    'contractorNotes',
    'customerScope',
    'exclusions',
    'warnings',
    'pricingSources',
    'analysis',
    'economics',
    'questions',
    'lineItems',
  ],
  properties: {
    jobTitle: { type: 'string' },
    summary: { type: 'string' },
    recommendedBid: { type: 'number', minimum: 0 },
    laborHours: { type: 'number', minimum: 0 },
    laborCost: { type: 'number', minimum: 0 },
    materialCost: { type: 'number', minimum: 0 },
    markup: { type: 'number', minimum: 0 },
    difficulty: { type: 'string' },
    confidence: { type: 'string' },
    estimatedDuration: { type: 'string' },
    customerNotes: { type: 'string' },
    contractorNotes: { type: 'string' },
    customerScope: { type: 'string' },
    exclusions: {
      type: 'array',
      maxItems: 12,
      items: { type: 'string' },
    },
    warnings: {
      type: 'array',
      maxItems: 8,
      items: { type: 'string' },
    },
    pricingSources: {
      type: 'array',
      maxItems: 8,
      items: { type: 'string' },
    },
    analysis: {
      type: 'object',
      additionalProperties: false,
      required: [
        'customerRequest',
        'scope',
        'quantities',
        'dimensions',
        'units',
        'crewSize',
        'laborOperations',
        'demolition',
        'preparation',
        'installation',
        'materials',
        'equipment',
        'delivery',
        'disposal',
        'afterHours',
        'subcontractors',
        'permitConcerns',
        'licensingConcerns',
        'access',
        'assumptions',
        'exclusions',
        'unknowns',
        'evidence',
      ],
      properties: {
        customerRequest: { type: 'string' },
        scope: { type: 'array', maxItems: 20, items: { type: 'string' } },
        quantities: { type: 'array', maxItems: 20, items: { type: 'string' } },
        dimensions: { type: 'array', maxItems: 20, items: { type: 'string' } },
        units: { type: 'array', maxItems: 15, items: { type: 'string' } },
        crewSize: { type: 'number', minimum: 1, maximum: 20 },
        laborOperations: { type: 'array', maxItems: 20, items: { type: 'string' } },
        demolition: { type: 'array', maxItems: 15, items: { type: 'string' } },
        preparation: { type: 'array', maxItems: 15, items: { type: 'string' } },
        installation: { type: 'array', maxItems: 20, items: { type: 'string' } },
        materials: { type: 'array', maxItems: 30, items: { type: 'string' } },
        equipment: { type: 'array', maxItems: 15, items: { type: 'string' } },
        delivery: { type: 'string' },
        disposal: { type: 'string' },
        afterHours: { type: 'string' },
        subcontractors: { type: 'array', maxItems: 15, items: { type: 'string' } },
        permitConcerns: { type: 'array', maxItems: 15, items: { type: 'string' } },
        licensingConcerns: { type: 'array', maxItems: 15, items: { type: 'string' } },
        access: { type: 'string' },
        assumptions: { type: 'array', maxItems: 15, items: { type: 'string' } },
        exclusions: { type: 'array', maxItems: 15, items: { type: 'string' } },
        unknowns: { type: 'array', maxItems: 15, items: { type: 'string' } },
        evidence: {
          type: 'array',
          maxItems: 30,
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['statement', 'classification'],
            properties: {
              statement: { type: 'string' },
              classification: {
                type: 'string',
                enum: ['OBSERVED', 'CONTRACTOR_PROVIDED', 'INFERRED', 'UNKNOWN'],
              },
            },
          },
        },
      },
    },
    economics: {
      type: 'object',
      additionalProperties: false,
      required: [
        'laborHours',
        'laborCost',
        'materialCost',
        'materialMarkup',
        'equipmentCost',
        'deliveryCost',
        'disposalCost',
        'subcontractorCost',
        'overheadCost',
        'contingencyCost',
        'totalEstimatedCost',
        'recommendedLow',
        'recommendedHigh',
        'recommendedPrice',
        'projectedGrossProfit',
        'projectedMargin',
        'effectiveHourlyRevenue',
      ],
      properties: {
        laborHours: { type: 'number', minimum: 0 },
        laborCost: { type: 'number', minimum: 0 },
        materialCost: { type: 'number', minimum: 0 },
        materialMarkup: { type: 'number', minimum: 0 },
        equipmentCost: { type: 'number', minimum: 0 },
        deliveryCost: { type: 'number', minimum: 0 },
        disposalCost: { type: 'number', minimum: 0 },
        subcontractorCost: { type: 'number', minimum: 0 },
        overheadCost: { type: 'number', minimum: 0 },
        contingencyCost: { type: 'number', minimum: 0 },
        totalEstimatedCost: { type: 'number', minimum: 0 },
        recommendedLow: { type: 'number', minimum: 0 },
        recommendedHigh: { type: 'number', minimum: 0 },
        recommendedPrice: { type: 'number', minimum: 0 },
        projectedGrossProfit: { type: 'number' },
        projectedMargin: { type: 'number' },
        effectiveHourlyRevenue: { type: 'number', minimum: 0 },
      },
    },
    questions: {
      type: 'array',
      maxItems: 2,
      items: { type: 'string' },
    },
    lineItems: {
      type: 'array',
      minItems: 1,
      maxItems: 30,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['description', 'quantity', 'unit', 'unitPrice', 'total'],
        properties: {
          description: { type: 'string' },
          quantity: { type: 'number', minimum: 0 },
          unit: { type: 'string' },
          unitPrice: { type: 'number', minimum: 0 },
          total: { type: 'number', minimum: 0 },
        },
      },
    },
  },
} as const
