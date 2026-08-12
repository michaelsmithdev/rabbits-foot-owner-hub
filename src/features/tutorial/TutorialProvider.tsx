import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'

import type { PageName } from '../../components/Sidebar/navigation'
import {
  safeTutorialActionTargets,
  stepsForSection,
  tutorialSectionForPage,
  tutorialSteps,
} from './tutorialConfig'
import { TutorialContext, type TutorialTargetState } from './TutorialContext'
import TutorialOverlay from './TutorialOverlay'
import {
  emptyTutorialProgress,
  loadTutorialProgress,
  saveTutorialProgress,
  tutorialStorageKey,
} from './tutorialStorage'
import type {
  TutorialProgress,
  TutorialRunMode,
  TutorialSectionId,
  TutorialStep,
} from './types'

type TutorialProviderProps = {
  activePage: PageName
  children: ReactNode
  onNavigate: (page: PageName) => void
  userScope: string
}

const EMPTY_TARGET: TutorialTargetState = {
  element: null,
  rect: null,
  found: false,
}

function isVisible(element: HTMLElement) {
  const style = window.getComputedStyle(element)
  const rect = element.getBoundingClientRect()
  return (
    style.display !== 'none' &&
    style.visibility !== 'hidden' &&
    Number(style.opacity || '1') > 0 &&
    rect.width > 0 &&
    rect.height > 0
  )
}

function findVisibleTarget(target?: string) {
  if (!target) return null
  const matches = Array.from(
    document.querySelectorAll<HTMLElement>(`[data-tour="${CSS.escape(target)}"]`),
  )
  return matches.find(isVisible) ?? null
}

function getSequence(mode: TutorialRunMode | null) {
  if (!mode) return []
  return mode.type === 'complete' ? tutorialSteps : stepsForSection(mode.sectionId)
}

export default function TutorialProvider({
  activePage,
  children,
  onNavigate,
  userScope,
}: TutorialProviderProps) {
  const storageKey = useMemo(() => tutorialStorageKey(userScope), [userScope])
  const [progress, setProgress] = useState<TutorialProgress>(() =>
    loadTutorialProgress(storageKey),
  )
  const [runMode, setRunMode] = useState<TutorialRunMode | null>(null)
  const [currentStepId, setCurrentStepId] = useState<string | null>(null)
  const [targetState, setTargetState] = useState<TutorialTargetState>(EMPTY_TARGET)
  const activatedStepRef = useRef<string | null>(null)

  const sequence = useMemo(() => getSequence(runMode), [runMode])
  const currentIndex = Math.max(
    0,
    sequence.findIndex((step) => step.id === currentStepId),
  )
  const currentStep = sequence[currentIndex] ?? null
  const isActive = Boolean(runMode && currentStep)
  const activePageSection = tutorialSectionForPage[activePage] ?? null

  const persistProgress = useCallback(
    (nextProgress: TutorialProgress) => {
      setProgress(nextProgress)
      saveTutorialProgress(storageKey, nextProgress)
    },
    [storageKey],
  )

  const startCompleteTutorial = useCallback(
    (options?: { restart?: boolean }) => {
      const canResume =
        !options?.restart &&
        progress.tutorialStarted &&
        !progress.tutorialCompleted &&
        progress.tutorialCurrentStepId &&
        tutorialSteps.some((step) => step.id === progress.tutorialCurrentStepId)
      const stepId = canResume ? progress.tutorialCurrentStepId : tutorialSteps[0]?.id
      if (!stepId) return

      const nextProgress: TutorialProgress = {
        ...emptyTutorialProgress(),
        tutorialStarted: true,
        tutorialCurrentStepId: stepId,
        lastTutorialDate: new Date().toISOString(),
      }
      persistProgress(nextProgress)
      setRunMode({ type: 'complete' })
      setCurrentStepId(stepId)
    },
    [persistProgress, progress],
  )

  const startSectionTutorial = useCallback((sectionId: TutorialSectionId) => {
    const steps = stepsForSection(sectionId)
    if (!steps.length) return
    setRunMode({ type: 'section', sectionId })
    setCurrentStepId(steps[0].id)
  }, [])

  const startPageTutorial = useCallback(() => {
    if (activePageSection) startSectionTutorial(activePageSection)
  }, [activePageSection, startSectionTutorial])

  const exitTutorial = useCallback(() => {
    setRunMode(null)
    setCurrentStepId(null)
    setTargetState(EMPTY_TARGET)
  }, [])

  const moveToStep = useCallback(
    (step: TutorialStep) => {
      setCurrentStepId(step.id)
      if (runMode?.type === 'complete') {
        persistProgress({
          ...progress,
          tutorialStarted: true,
          tutorialCompleted: false,
          tutorialCurrentStepId: step.id,
          lastTutorialDate: new Date().toISOString(),
        })
      }
    },
    [persistProgress, progress, runMode?.type],
  )

  const nextStep = useCallback(() => {
    if (!currentStep || !runMode) return
    const next = sequence[currentIndex + 1]
    if (next) {
      moveToStep(next)
      return
    }

    if (runMode.type === 'complete') {
      persistProgress({
        ...progress,
        tutorialStarted: true,
        tutorialCompleted: true,
        tutorialCurrentStepId: null,
        lastTutorialDate: new Date().toISOString(),
      })
    }
    exitTutorial()
  }, [currentIndex, currentStep, exitTutorial, moveToStep, persistProgress, progress, runMode, sequence])

  const previousStep = useCallback(() => {
    const previous = sequence[currentIndex - 1]
    if (previous) moveToStep(previous)
  }, [currentIndex, moveToStep, sequence])

  useEffect(() => {
    if (!currentStep || activePage === currentStep.page) return
    onNavigate(currentStep.page)
  }, [activePage, currentStep, onNavigate])

  useEffect(() => {
    if (!isActive) {
      document.body.classList.remove('tutorial-is-active')
      return
    }
    document.body.classList.add('tutorial-is-active')
    return () => document.body.classList.remove('tutorial-is-active')
  }, [isActive])

  useEffect(() => {
    if (!currentStep || activePage !== currentStep.page) {
      const clearFrame = window.requestAnimationFrame(() => setTargetState(EMPTY_TARGET))
      return () => window.cancelAnimationFrame(clearFrame)
    }

    if (currentStep.action && activatedStepRef.current !== currentStep.id) {
      const actionTarget = currentStep.action.target
      if (safeTutorialActionTargets.has(actionTarget)) {
        const actionElement = findVisibleTarget(actionTarget)
        actionElement?.click()
      }
      activatedStepRef.current = currentStep.id
    }

    let frame = 0
    let observer: MutationObserver | null = null
    const startedAt = Date.now()
    let selectedTarget: HTMLElement | null = null

    const updateTarget = () => {
      selectedTarget =
        findVisibleTarget(currentStep.target) ??
        findVisibleTarget(currentStep.fallbackTarget)

      if (selectedTarget) {
        const rect = selectedTarget.getBoundingClientRect()
        setTargetState({ element: selectedTarget, rect, found: Boolean(findVisibleTarget(currentStep.target)) })
        if (rect.top < 96 || rect.bottom > window.innerHeight - 96) {
          selectedTarget.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' })
        }
      } else {
        setTargetState(EMPTY_TARGET)
      }

      if (!selectedTarget && Date.now() - startedAt < 2800) {
        frame = window.requestAnimationFrame(updateTarget)
      }
    }

    const handleLayoutChange = () => window.requestAnimationFrame(updateTarget)
    frame = window.requestAnimationFrame(updateTarget)
    observer = new MutationObserver(handleLayoutChange)
    observer.observe(document.body, { childList: true, subtree: true, attributes: true })
    window.addEventListener('resize', handleLayoutChange)
    window.addEventListener('scroll', handleLayoutChange, true)

    return () => {
      window.cancelAnimationFrame(frame)
      observer?.disconnect()
      window.removeEventListener('resize', handleLayoutChange)
      window.removeEventListener('scroll', handleLayoutChange, true)
    }
  }, [activePage, currentStep])

  const value = useMemo(
    () => ({
      activePageSection,
      currentIndex,
      currentStep,
      exitTutorial,
      isActive,
      nextStep,
      previousStep,
      progress,
      sequenceLength: sequence.length,
      startCompleteTutorial,
      startPageTutorial,
      startSectionTutorial,
      targetState,
    }),
    [
      activePageSection,
      currentIndex,
      currentStep,
      exitTutorial,
      isActive,
      nextStep,
      previousStep,
      progress,
      sequence.length,
      startCompleteTutorial,
      startPageTutorial,
      startSectionTutorial,
      targetState,
    ],
  )

  return (
    <TutorialContext.Provider value={value}>
      {children}
      <TutorialOverlay />
    </TutorialContext.Provider>
  )
}
