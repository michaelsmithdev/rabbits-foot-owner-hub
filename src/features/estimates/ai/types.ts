export type AiEstimateLineItem = {
  description: string
  quantity: number
  unit: string
  unitPrice: number
  total: number
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
  questions: string[]
  lineItems: AiEstimateLineItem[]
}

export type AiEstimateGeneration = {
  jobDescription: string
  generatedAt: string
  model: string
  historyUsed: number
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
    questions: {
      type: 'array',
      maxItems: 12,
      items: { type: 'string' },
    },
    lineItems: {
      type: 'array',
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
