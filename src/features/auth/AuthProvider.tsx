import type { Session } from '@supabase/supabase-js'
import {
  type ReactNode,
  useEffect,
  useMemo,
  useState,
} from 'react'

import { cloudClient, isCloudConfigured } from '../cloud/cloudClient'
import {
  AuthContext,
  type AuthContextValue,
  type AuthMode,
} from './authContext'
import { recordStartupEvent } from '../../startup/startupDiagnostics'

const AUTH_STARTUP_TIMEOUT_MS = 12_000

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [mode, setMode] = useState<AuthMode>(() => {
    if (isCloudConfigured && cloudClient) return 'loading'
    return import.meta.env.DEV ? 'local' : 'unconfigured'
  })

  useEffect(() => {
    if (!isCloudConfigured || !cloudClient) {
      return
    }

    let isMounted = true
    const startupTimeout = window.setTimeout(() => {
      if (!isMounted) return

      recordStartupEvent('auth-startup-timeout')
      setSession(null)
      setMode('cloud')
    }, AUTH_STARTUP_TIMEOUT_MS)

    void cloudClient.auth.getSession().then(({ data, error }) => {
      if (!isMounted) return
      window.clearTimeout(startupTimeout)

      if (error) {
        console.error('Saved login session could not be loaded.', error)
      }

      setSession(data.session)
      setMode('cloud')
      recordStartupEvent('auth-session-loaded')
    }).catch((error: unknown) => {
      if (!isMounted) return
      window.clearTimeout(startupTimeout)
      recordStartupEvent('auth-session-failed', error)
      setSession(null)
      setMode('cloud')
    })

    const { data } = cloudClient.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      setMode('cloud')
    })

    return () => {
      isMounted = false
      window.clearTimeout(startupTimeout)
      data.subscription.unsubscribe()
    }
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      mode,
      session,
      async signIn(email, password) {
        if (!cloudClient) throw new Error('Cloud login is not configured.')

        const { error } = await cloudClient.auth.signInWithPassword({
          email: email.trim(),
          password,
        })

        if (error) throw error
      },
      async signUp(email, password, businessName, displayName) {
        if (!cloudClient) throw new Error('Cloud login is not configured.')

        const cleanBusinessName = businessName.trim()
        const cleanDisplayName = displayName.trim()
        if (!cleanBusinessName) throw new Error('Enter your business name.')
        if (!cleanDisplayName) throw new Error('Enter your name.')

        const { data, error } = await cloudClient.auth.signUp({
          email: email.trim(),
          password,
          options: {
            emailRedirectTo: window.location.origin,
            data: {
              organization_name: cleanBusinessName,
              display_name: cleanDisplayName,
            },
          },
        })

        if (error) throw error

        return data.session
          ? 'Your secure workspace is ready.'
          : 'Check your email to confirm the account, then sign in.'
      },
      async sendPasswordReset(email) {
        if (!cloudClient) throw new Error('Cloud login is not configured.')

        const { error } = await cloudClient.auth.resetPasswordForEmail(
          email.trim(),
          {
            redirectTo: window.location.origin,
          },
        )

        if (error) throw error
      },
      async signOut() {
        if (!cloudClient) return

        const { error } = await cloudClient.auth.signOut()
        if (error) throw error
      },
    }),
    [mode, session],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
