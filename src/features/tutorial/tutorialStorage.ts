import { TUTORIAL_VERSION, tutorialSteps } from './tutorialConfig'
import type { TutorialProgress } from './types'

const STORAGE_PREFIX = 'rabbits-foot-complete-tutorial'

export function tutorialStorageKey(userScope: string) {
  return `${STORAGE_PREFIX}:${userScope || 'local'}`
}

export function emptyTutorialProgress(): TutorialProgress {
  return {
    tutorialVersion: TUTORIAL_VERSION,
    tutorialStarted: false,
    tutorialCompleted: false,
    tutorialCurrentStepId: null,
    lastTutorialDate: null,
  }
}

export function loadTutorialProgress(storageKey: string): TutorialProgress {
  try {
    const raw = localStorage.getItem(storageKey)
    if (!raw) return emptyTutorialProgress()
    const parsed = JSON.parse(raw) as Partial<TutorialProgress>
    if (parsed.tutorialVersion !== TUTORIAL_VERSION) return emptyTutorialProgress()
    const currentStepExists = tutorialSteps.some((step) => step.id === parsed.tutorialCurrentStepId)
    return {
      tutorialVersion: TUTORIAL_VERSION,
      tutorialStarted: Boolean(parsed.tutorialStarted),
      tutorialCompleted: Boolean(parsed.tutorialCompleted),
      tutorialCurrentStepId: currentStepExists ? parsed.tutorialCurrentStepId ?? null : null,
      lastTutorialDate: typeof parsed.lastTutorialDate === 'string' ? parsed.lastTutorialDate : null,
    }
  } catch {
    return emptyTutorialProgress()
  }
}

export function saveTutorialProgress(storageKey: string, progress: TutorialProgress) {
  try {
    localStorage.setItem(storageKey, JSON.stringify(progress))
  } catch {
    // Tutorial progress is helpful but must never prevent the business app from opening.
  }
}
