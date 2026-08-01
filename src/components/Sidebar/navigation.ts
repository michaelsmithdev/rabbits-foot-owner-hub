import {
  FileText,
  Images,
  Inbox,
  LayoutDashboard,
  Settings,
  UsersRound,
  type LucideIcon,
} from 'lucide-react'

export type PageName =
  | 'home'
  | 'customers'
  | 'documents'
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
