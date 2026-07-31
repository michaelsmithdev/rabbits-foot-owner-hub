import type { Session } from '@supabase/supabase-js'
import { createContext, useContext } from 'react'

export type AuthMode = 'loading' | 'local' | 'cloud' | 'unconfigured'

export type AuthContextValue = {
  mode: AuthMode
  session: Session | null
  signIn: (email: string, password: string) => Promise<void>
  signUp: (email: string, password: string) => Promise<string>
  sendPasswordReset: (email: string) => Promise<void>
  signOut: () => Promise<void>
}
export const AuthContext = createContext<AuthContextValue | null>(null)

export function useAuth() {
  const context = useContext(AuthContext)

  if (!context) {
    throw new Error('useAuth must be used inside AuthProvider.')
  }

  return context
}
