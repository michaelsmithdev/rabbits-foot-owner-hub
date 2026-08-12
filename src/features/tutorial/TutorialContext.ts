import { createContext, useContext } from 'react'

import type { TutorialProgress, TutorialSectionId, TutorialStep } from './types'

export type TutorialTargetState = {
  element: HTMLElement | null
  rect: DOMRect | null
  found: boolean
}

export type TutorialContextValue = {
  activePageSection: TutorialSectionId | null
  currentIndex: number
  currentStep: TutorialStep | null
  exitTutorial: () => void
  isActive: boolean
  nextStep: () => void
  previousStep: () => void
  progress: TutorialProgress
  sequenceLength: number
  startCompleteTutorial: (options?: { restart?: boolean }) => void
  startPageTutorial: () => void
  startSectionTutorial: (sectionId: TutorialSectionId) => void
  targetState: TutorialTargetState
}

export const TutorialContext = createContext<TutorialContextValue | null>(null)

export function useTutorial() {
  const value = useContext(TutorialContext)
  if (!value) throw new Error('useTutorial must be used inside TutorialProvider.')
  return value
}
