import {
  FileText,
  ClipboardList,
  BriefcaseBusiness,
  FolderArchive,
  Images,
  Inbox,
  LayoutDashboard,
  Settings,
  CalendarDays,
  Sparkles,
  UsersRound,
  type LucideIcon,
} from 'lucide-react'

export type PageName =
  | 'home'
  | 'customers'
  | 'walkthrough'
  | 'jobs'
  | 'documents'
  | 'archive'
  | 'pricing'
  | 'inbox'
  | 'photos'
  | 'settings'
  | 'schedule'

type NavigationItem = {
  id: PageName
  label: string
  shortLabel: string
  icon: LucideIcon
}

export const navigationItems: NavigationItem[] = [
  {
    id: 'home',
    label: 'Dashboard',
    shortLabel: 'Home',
    icon: LayoutDashboard,
  },
  {
    id: 'customers',
    label: 'Customers',
    shortLabel: 'Customers',
    icon: UsersRound,
  },
  {
    id: 'schedule',
    label: 'Schedule',
    shortLabel: 'Schedule',
    icon: CalendarDays,
  },
  {
    id: 'walkthrough',
    label: 'AI Walkthrough',
    shortLabel: 'Walkthrough',
    icon: ClipboardList,
  },
  {
    id: 'jobs',
    label: 'Jobs',
    shortLabel: 'Jobs',
    icon: BriefcaseBusiness,
  },
  {
    id: 'documents',
    label: 'Estimates & invoices',
    shortLabel: 'Documents',
    icon: FileText,
  },
  {
    id: 'archive',
    label: 'PDF archive',
    shortLabel: 'PDFs',
    icon: FolderArchive,
  },
  {
    id: 'pricing',
    label: 'Smart pricing',
    shortLabel: 'Pricing',
    icon: Sparkles,
  },
  {
    id: 'inbox',
    label: 'Inbox',
    shortLabel: 'Inbox',
    icon: Inbox,
  },
  {
    id: 'photos',
    label: 'Photos',
    shortLabel: 'Photos',
    icon: Images,
  },
  {
    id: 'settings',
    label: 'Settings',
    shortLabel: 'Settings',
    icon: Settings,
  },
]
