import { useEffect, useMemo, useRef } from 'react'
import { ArrowLeft, ArrowRight, CheckCircle2, Lightbulb, X } from 'lucide-react'

import { tutorialSections } from './tutorialConfig'
import { useTutorial } from './TutorialContext'
import './Tutorial.css'

const CARD_WIDTH = 390
const CARD_GAP = 18
const VIEWPORT_PADDING = 18
const CARD_SAFE_HEIGHT = 450

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), maximum)
}

export default function TutorialOverlay() {
  const {
    currentIndex,
    currentStep,
    exitTutorial,
    isActive,
    nextStep,
    previousStep,
    sequenceLength,
    targetState,
  } = useTutorial()
  const dialogRef = useRef<HTMLElement>(null)

  const section = tutorialSections.find((item) => item.id === currentStep?.section)
  const isFinalStep = currentIndex === sequenceLength - 1
  const isCentered = currentStep?.placement === 'center' || !targetState.rect

  const cardStyle = useMemo(() => {
    const rect = targetState.rect
    if (!rect || isCentered) return undefined
    const viewportWidth = window.innerWidth
    const viewportHeight = window.innerHeight
    const maxLeft = Math.max(VIEWPORT_PADDING, viewportWidth - CARD_WIDTH - VIEWPORT_PADDING)
    const preferred = currentStep?.placement ?? 'auto'
    let left = clamp(rect.left, VIEWPORT_PADDING, maxLeft)
    let top: number

    const fitsBelow = rect.bottom + CARD_GAP + CARD_SAFE_HEIGHT < viewportHeight
    const fitsAbove = rect.top - CARD_GAP - CARD_SAFE_HEIGHT > 0
    const fitsRight = rect.right + CARD_GAP + CARD_WIDTH < viewportWidth
    const fitsLeft = rect.left - CARD_GAP - CARD_WIDTH > 0

    if (preferred === 'right' || (preferred === 'auto' && fitsRight)) {
      left = rect.right + CARD_GAP
      top = clamp(rect.top, VIEWPORT_PADDING, Math.max(VIEWPORT_PADDING, viewportHeight - CARD_SAFE_HEIGHT))
    } else if (preferred === 'left' || (preferred === 'auto' && fitsLeft && !fitsBelow)) {
      left = rect.left - CARD_GAP - CARD_WIDTH
      top = clamp(rect.top, VIEWPORT_PADDING, Math.max(VIEWPORT_PADDING, viewportHeight - CARD_SAFE_HEIGHT))
    } else if (preferred === 'top' || (!fitsBelow && fitsAbove)) {
      top = Math.max(VIEWPORT_PADDING, rect.top - CARD_GAP - CARD_SAFE_HEIGHT)
    } else {
      top = Math.min(rect.bottom + CARD_GAP, Math.max(VIEWPORT_PADDING, viewportHeight - CARD_SAFE_HEIGHT))
    }

    return { left, top }
  }, [currentStep?.placement, isCentered, targetState.rect])

  useEffect(() => {
    if (!isActive) return
    const dialog = dialogRef.current
    dialog?.focus()

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault()
        exitTutorial()
      } else if (event.key === 'ArrowRight') {
        event.preventDefault()
        nextStep()
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault()
        previousStep()
      } else if (event.key === 'Tab' && dialog) {
        const focusable = Array.from(
          dialog.querySelectorAll<HTMLElement>('button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'),
        )
        if (!focusable.length) return
        const first = focusable[0]
        const last = focusable[focusable.length - 1]
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault()
          last.focus()
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault()
          first.focus()
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [exitTutorial, isActive, nextStep, previousStep])

  if (!isActive || !currentStep) return null

  const spotlightStyle = targetState.rect
    ? {
        height: targetState.rect.height + 12,
        left: targetState.rect.left - 6,
        top: targetState.rect.top - 6,
        width: targetState.rect.width + 12,
      }
    : undefined

  return (
    <div className="tutorial-overlay" data-tour-active="true">
      {spotlightStyle ? (
        <div aria-hidden="true" className="tutorial-spotlight" style={spotlightStyle} />
      ) : (
        <div aria-hidden="true" className="tutorial-full-backdrop" />
      )}

      <section
        aria-describedby="tutorial-description"
        aria-labelledby="tutorial-title"
        aria-modal="true"
        className={isCentered ? 'tutorial-card tutorial-card-centered' : 'tutorial-card'}
        ref={dialogRef}
        role="dialog"
        style={cardStyle}
        tabIndex={-1}
      >
        <header className="tutorial-card-header">
          <div>
            <span>{section?.shortLabel ?? 'Owner Hub tutorial'}</span>
            <strong>{currentIndex + 1} of {sequenceLength}</strong>
          </div>
          <button aria-label="Exit tutorial" className="tutorial-close" onClick={exitTutorial} type="button">
            <X aria-hidden="true" size={20} />
          </button>
        </header>

        <div aria-hidden="true" className="tutorial-progress-track">
          <span style={{ width: `${((currentIndex + 1) / sequenceLength) * 100}%` }} />
        </div>

        <div className="tutorial-card-copy">
          {isFinalStep ? <CheckCircle2 className="tutorial-finish-icon" size={34} /> : null}
          <h2 id="tutorial-title">{currentStep.title}</h2>
          <p id="tutorial-description">{currentStep.description}</p>
          {currentStep.tip ? (
            <div className="tutorial-tip">
              <Lightbulb aria-hidden="true" size={18} />
              <span>{currentStep.tip}</span>
            </div>
          ) : null}
          {currentStep.target && !targetState.found && targetState.element ? (
            <p className="tutorial-fallback-note">This control is not visible in the current data state, so the closest safe area is highlighted.</p>
          ) : null}
          {currentStep.target && !targetState.element ? (
            <p className="tutorial-fallback-note">This feature is not available in the current data state. You can continue safely.</p>
          ) : null}
        </div>

        <footer className="tutorial-card-actions">
          <button className="tutorial-skip" onClick={exitTutorial} type="button">Skip tutorial</button>
          <div>
            <button
              aria-label="Previous tutorial step"
              className="tutorial-back"
              disabled={currentIndex === 0}
              onClick={previousStep}
              type="button"
            >
              <ArrowLeft aria-hidden="true" size={18} /> Back
            </button>
            <button className="tutorial-next" onClick={nextStep} type="button">
              {isFinalStep ? 'Finish' : 'Next'}
              {!isFinalStep ? <ArrowRight aria-hidden="true" size={18} /> : null}
            </button>
          </div>
        </footer>
      </section>
    </div>
  )
}
