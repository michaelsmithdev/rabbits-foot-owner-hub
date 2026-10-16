import {
  FileText,
  ClipboardList,
  BriefcaseBusiness,
  FolderArchive,
  Images,
  Inbox,
  ReceiptText,
  LayoutDashboard,
  Settings,
  CalendarDays,
  Building2,
  Clapperboard,
  Bot,
  Sparkles,
  ShieldCheck,
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
  | 'receipts'
  | 'settings'
  | 'schedule'
  | 'business'
  | 'content-autopilot'
  | 'ai-operations'
  | 'reliability'

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
    id: 'receipts',
    label: 'Receipts & expenses',
    shortLabel: 'Receipts',
    icon: ReceiptText,
  },
  {
    id: 'ai-operations',
    label: 'AI Operations',
    shortLabel: 'AI Ops',
    icon: Bot,
  },
  {
    id: 'content-autopilot',
    label: 'Content Autopilot',
    shortLabel: 'Content',
    icon: Clapperboard,
  },
  {
    id: 'business',
    label: 'Business & billing',
    shortLabel: 'Business',
    icon: Building2,
  },
  {
    id: 'reliability',
    label: 'Reliability & sync',
    shortLabel: 'Sync',
    icon: ShieldCheck,
  },
  {
    id: 'settings',
    label: 'Settings',
    shortLabel: 'Settings',
    icon: Settings,
  },
]
