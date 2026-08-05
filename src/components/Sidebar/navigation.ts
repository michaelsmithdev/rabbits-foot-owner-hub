import {
  FileText,
  FolderArchive,
  Images,
  Inbox,
  LayoutDashboard,
  Settings,
  Sparkles,
  UsersRound,
  type LucideIcon,
} from 'lucide-react'

export type PageName =
  | 'home'
  | 'customers'
  | 'documents'
  | 'archive'
  | 'pricing'
  | 'inbox'
  | 'photos'
  | 'settings'

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
