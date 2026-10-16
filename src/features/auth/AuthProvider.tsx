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
import { markDemoTutorialPending } from '../demo/demoWorkspace'
import {
  clearCompletedAuthRedirect,
  getAuthRedirectUrl,
} from './authRedirect'
import { recordReliabilityEvent } from '../reliability/data/reliabilityStore'
import { requireValidEmail } from '../../shared/email/emailValidation'
import { protectAuthEmailRequest } from './authEmailProtection'

const AUTH_STARTUP_TIMEOUT_MS = 12_000

function friendlyAuthEmailError(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : ''
  if (/rate|too many|security purposes/i.test(message)) {
    return new Error('Too many email attempts. Please wait a moment and try again.')
  }
  if (/invalid.*email|email.*invalid/i.test(message)) {
    return new Error('Enter a valid email address before continuing.')
  }
  return new Error(fallback)
}

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
      recordReliabilityEvent({
        area: 'auth',
        severity: 'warning',
        message: 'Account authentication took too long to respond.',
      })
      setSession(null)
      setMode('cloud')
    }, AUTH_STARTUP_TIMEOUT_MS)

    void cloudClient.auth.getSession().then(({ data, error }) => {
      if (!isMounted) return
      window.clearTimeout(startupTimeout)

      if (error) {
        console.error('Saved login session could not be loaded.', error)
        recordReliabilityEvent({
          area: 'auth',
          severity: 'error',
          message: 'The saved login session could not be loaded.',
          detail: error,
        })
      }

      setSession(data.session)
      setMode('cloud')
      if (data.session) clearCompletedAuthRedirect()
      recordStartupEvent('auth-session-loaded')
    }).catch((error: unknown) => {
      if (!isMounted) return
      window.clearTimeout(startupTimeout)
      recordStartupEvent('auth-session-failed', error)
      recordReliabilityEvent({
        area: 'auth',
        severity: 'error',
        message: 'The saved login session failed to open.',
        detail: error,
      })
      setSession(null)
      setMode('cloud')
    })

    const { data } = cloudClient.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      setMode('cloud')
      if (nextSession) clearCompletedAuthRedirect()
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
        const cleanEmail = requireValidEmail(email)

        const { data, error } = await cloudClient.auth.signInWithPassword({
          email: cleanEmail,
          password,
        })

        if (error) {
          recordReliabilityEvent({
            area: 'auth',
            severity: 'error',
            message: 'Sign in failed.',
            detail: error,
          })
          throw error
        }
        markDemoTutorialPending(data.session)
        setSession(data.session)
      },
      async signUp(email, password, businessName, displayName) {
        if (!cloudClient) throw new Error('Cloud login is not configured.')

        const cleanEmail = requireValidEmail(email)
        const cleanBusinessName = businessName.trim()
        const cleanDisplayName = displayName.trim()
        if (!cleanBusinessName) throw new Error('Enter your business name.')
        if (!cleanDisplayName) throw new Error('Enter your name.')
        protectAuthEmailRequest('confirmation', cleanEmail)

        const { data, error } = await cloudClient.auth.signUp({
          email: cleanEmail,
          password,
          options: {
            emailRedirectTo: getAuthRedirectUrl('confirm'),
            data: {
              organization_name: cleanBusinessName,
              display_name: cleanDisplayName,
            },
          },
        })

        if (error) {
          recordReliabilityEvent({
            area: 'auth',
            severity: 'error',
            message: 'Account creation failed.',
            detail: error,
          })
          throw friendlyAuthEmailError(
            error,
            'The account could not be created right now. Please try again.',
          )
        }

        return data.session
          ? 'Your secure workspace is ready.'
          : 'Check your email to confirm the account, then sign in.'
      },
      async resendSignUpConfirmation(email) {
        if (!cloudClient) throw new Error('Cloud login is not configured.')
        const cleanEmail = requireValidEmail(email)
        protectAuthEmailRequest('confirmation', cleanEmail)

        const { error } = await cloudClient.auth.resend({
          type: 'signup',
          email: cleanEmail,
          options: {
            emailRedirectTo: getAuthRedirectUrl('confirm'),
          },
        })

        if (error) {
          recordReliabilityEvent({
            area: 'auth',
            severity: 'error',
            message: 'Confirmation email could not be resent.',
            detail: error,
          })
          throw friendlyAuthEmailError(
            error,
            'Confirmation email could not be resent. Please try again.',
          )
        }
      },
      async sendPasswordReset(email) {
        if (!cloudClient) throw new Error('Cloud login is not configured.')
        const cleanEmail = requireValidEmail(email)
        protectAuthEmailRequest('password-reset', cleanEmail)

        const { error } = await cloudClient.auth.resetPasswordForEmail(
          cleanEmail,
          {
            redirectTo: getAuthRedirectUrl('recovery'),
          },
        )

        if (error) {
          recordReliabilityEvent({
            area: 'auth',
            severity: 'error',
            message: 'Password reset email could not be sent.',
            detail: error,
          })
          throw friendlyAuthEmailError(
            error,
            'Password reset email could not be sent. Please try again.',
          )
        }
      },
      async signOut() {
        if (!cloudClient) return

        const { error } = await cloudClient.auth.signOut()
        if (error) {
          recordReliabilityEvent({
            area: 'auth',
            severity: 'error',
            message: 'Sign out failed.',
            detail: error,
          })
          throw error
        }
      },
    }),
    [mode, session],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
