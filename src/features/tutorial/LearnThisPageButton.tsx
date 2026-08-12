import { CircleHelp } from 'lucide-react'

import { useTutorial } from './TutorialContext'

export default function LearnThisPageButton() {
  const { activePageSection, startPageTutorial } = useTutorial()

  return (
    <button
      aria-label="Learn this page"
      className="learn-page-button"
      data-tour="learn-this-page"
      disabled={!activePageSection}
      onClick={startPageTutorial}
      type="button"
    >
      <CircleHelp aria-hidden="true" size={18} />
      <span>Learn this page</span>
    </button>
  )
}
