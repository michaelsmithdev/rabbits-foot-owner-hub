import type { PageName } from '../../components/Sidebar/navigation'

export type TutorialSectionId =
  | 'overview'
  | 'customers'
  | 'schedule'
  | 'estimates'
  | 'ai-estimating'
  | 'communication'
  | 'customer-hub'
  | 'invoices'
  | 'jobs'
  | 'inbox'
  | 'photos-documents'
  | 'pricing'
  | 'settings'
  | 'business'
  | 'finish'

export type TutorialPlacement = 'auto' | 'top' | 'right' | 'bottom' | 'left' | 'center'

export type TutorialAction = {
  type: 'activate-target'
  target: string
}

export type TutorialStep = {
  id: string
  section: TutorialSectionId
  page: PageName
  target?: string
  fallbackTarget?: string
  title: string
  description: string
  tip?: string
  placement?: TutorialPlacement
  action?: TutorialAction
}

export type TutorialSection = {
  id: TutorialSectionId
  label: string
  shortLabel: string
  description: string
  hiddenFromPicker?: boolean
}

export type TutorialProgress = {
  tutorialVersion: number
  tutorialStarted: boolean
  tutorialCompleted: boolean
  tutorialCurrentStepId: string | null
  lastTutorialDate: string | null
}

export type TutorialRunMode =
  | { type: 'complete' }
  | { type: 'section'; sectionId: TutorialSectionId }
