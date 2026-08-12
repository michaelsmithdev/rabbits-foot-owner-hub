import { BookOpen, CheckCircle2, PlayCircle, RotateCcw } from 'lucide-react'

import { tutorialSections, tutorialSteps } from './tutorialConfig'
import { useTutorial } from './TutorialContext'

export default function TutorialSettingsCard() {
  const { progress, startCompleteTutorial, startSectionTutorial } = useTutorial()
  const resumeStepIndex = progress.tutorialCurrentStepId
    ? tutorialSteps.findIndex((step) => step.id === progress.tutorialCurrentStepId)
    : -1
  const primaryLabel = progress.tutorialCompleted
    ? 'Restart complete tutorial'
    : progress.tutorialStarted && progress.tutorialCurrentStepId
      ? 'Resume complete tutorial'
      : 'Start complete tutorial'

  return (
    <article className="settings-card tutorial-settings-card" data-tour="tutorial-settings-card">
      <span className="settings-card-icon"><BookOpen size={24} /></span>
      <div className="tutorial-settings-copy">
        <p className="eyebrow">HELP &amp; TUTORIAL</p>
        <h2>Learn Owner Hub at your pace</h2>
        <p>
          Follow the complete business workflow, resume where you stopped, or open a focused tutorial for one feature.
        </p>
        <div className="tutorial-settings-status" role="status">
          {progress.tutorialCompleted ? (
            <><CheckCircle2 size={17} /> Complete tutorial finished</>
          ) : progress.tutorialStarted ? (
            <>Complete tutorial progress: step {Math.max(1, resumeStepIndex + 1)} of {tutorialSteps.length}</>
          ) : (
            <>About {Math.max(8, Math.ceil(tutorialSteps.length * 0.18))} minutes · progress saves automatically</>
          )}
        </div>
      </div>

      <div className="tutorial-settings-actions">
        <button
          className="settings-secondary-button tutorial-primary-launch"
          onClick={() => startCompleteTutorial({ restart: progress.tutorialCompleted })}
          type="button"
        >
          {progress.tutorialCompleted ? <RotateCcw size={17} /> : <PlayCircle size={17} />}
          {primaryLabel}
        </button>
        {progress.tutorialStarted && !progress.tutorialCompleted ? (
          <button className="tutorial-restart-button" onClick={() => startCompleteTutorial({ restart: true })} type="button">
            <RotateCcw size={16} /> Restart from beginning
          </button>
        ) : null}
      </div>

      <div className="tutorial-section-picker">
        <strong>Learn one feature</strong>
        <div>
          {tutorialSections.filter((section) => !section.hiddenFromPicker).map((section) => (
            <button key={section.id} onClick={() => startSectionTutorial(section.id)} type="button">
              <span>{section.shortLabel}</span>
              <small>{section.description}</small>
            </button>
          ))}
        </div>
      </div>
    </article>
  )
}
