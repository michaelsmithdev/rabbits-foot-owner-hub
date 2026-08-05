import { useCallback, useState } from 'react'

import { generateAiEstimate } from './aiEstimateService'
import type { AiEstimateGeneration } from './types'

export function useAiEstimateAssistant(initialValue?: AiEstimateGeneration) {
  const [generation, setGeneration] = useState<AiEstimateGeneration | null>(
    initialValue ?? null,
  )
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')

  const generate = useCallback(
    async (input: Parameters<typeof generateAiEstimate>[0]) => {
      setIsLoading(true)
      setError('')

      try {
        const nextGeneration = await generateAiEstimate(input)
        setGeneration(nextGeneration)
        return nextGeneration
      } catch (requestError) {
        setError(
          requestError instanceof Error
            ? requestError.message
            : 'The AI estimate could not be generated.',
        )
        return null
      } finally {
        setIsLoading(false)
      }
    },
    [],
  )

  return {
    error,
    generate,
    generation,
    isLoading,
    setGeneration,
  }
}
