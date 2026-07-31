import { CloudOff, LoaderCircle, ShieldCheck } from 'lucide-react'
import { type FormEvent, type ReactNode, useState } from 'react'

import { useAuth } from './authContext'
import './auth.css'

type LoginView = 'sign-in' | 'sign-up' | 'reset'

function LoginScreen() {
  const { sendPasswordReset, signIn, signUp } = useAuth()
  const [view, setView] = useState<LoginView>('sign-in')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [message, setMessage] = useState('')
  const [errorMessage, setErrorMessage] = useState('')

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setIsSubmitting(true)
    setMessage('')
    setErrorMessage('')

    try {
      if (view === 'sign-in') {
        await signIn(email, password)
      } else if (view === 'sign-up') {
        setMessage(await signUp(email, password))
      } else {
        await sendPasswordReset(email)
        setMessage('Password reset instructions were sent to your email.')
      }
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'The request could not be completed.',
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="auth-screen">
      <section className="auth-card" aria-labelledby="auth-title">
        <img
          alt="Rabbit's Foot Handyman Services"
          className="auth-logo"
          height="112"
          src="/rabbits-foot-logo.png"
          width="112"
        />
        <p className="eyebrow">SECURE OWNER WORKSPACE</p>
        <h1 id="auth-title">
          {view === 'sign-in'
            ? 'Welcome back.'
            : view === 'sign-up'
              ? 'Create the owner account.'
              : 'Reset your password.'}
        </h1>
        <p className="auth-intro">
          Customers, estimates, invoices, payments, and website leads stay
          protected behind your login.
        </p>

        <form className="auth-form" onSubmit={handleSubmit}>
          <label>
            <span>Email address</span>
            <input
              autoComplete="email"
              onChange={(event) => setEmail(event.target.value)}
              required
              type="email"
              value={email}
            />
          </label>

          {view !== 'reset' && (
            <label>
              <span>Password</span>
              <input
                autoComplete={view === 'sign-in' ? 'current-password' : 'new-password'}
                minLength={10}
                onChange={(event) => setPassword(event.target.value)}
                required
                type="password"
                value={password}
              />
              {view === 'sign-up' && (
                <small>Use at least 10 characters.</small>
              )}
            </label>
          )}

          {errorMessage && <p className="auth-error" role="alert">{errorMessage}</p>}
          {message && <p className="auth-success" role="status">{message}</p>}

          <button className="auth-submit" disabled={isSubmitting} type="submit">
            {isSubmitting ? (
              <LoaderCircle aria-hidden="true" className="auth-spinner" size={20} />
            ) : (
              <ShieldCheck aria-hidden="true" size={20} />
            )}
            {view === 'sign-in'
              ? 'Sign in securely'
              : view === 'sign-up'
                ? 'Create secure account'
                : 'Send reset link'}
          </button>
        </form>

        <div className="auth-links">
          {view !== 'sign-in' && (
            <button onClick={() => setView('sign-in')} type="button">
              Back to sign in
            </button>
          )}
          {view === 'sign-in' && (
            <>
              <button onClick={() => setView('sign-up')} type="button">
                First-time setup
              </button>
              <button onClick={() => setView('reset')} type="button">
                Forgot password?
              </button>
            </>
          )}
        </div>
      </section>
    </main>
  )
}

function CloudSetupRequired() {
  return (
    <main className="auth-screen">
      <section className="auth-card" aria-labelledby="cloud-setup-title">
        <span className="auth-setup-icon"><CloudOff aria-hidden="true" size={30} /></span>
        <p className="eyebrow">SECURE SETUP REQUIRED</p>
        <h1 id="cloud-setup-title">Connect the Owner Hub cloud.</h1>
        <p className="auth-intro">
          Production access is locked until the Supabase URL and publishable key
          are added. No business data is exposed without authentication.
        </p>
      </section>
    </main>
  )
}

export function AuthGate({ children }: { children: ReactNode }) {
  const { mode, session } = useAuth()

  if (mode === 'loading') {
    return (
      <main className="auth-screen">
        <LoaderCircle aria-label="Loading secure workspace" className="auth-spinner" size={34} />
      </main>
    )
  }

  if (mode === 'unconfigured') return <CloudSetupRequired />
  if (mode === 'cloud' && !session) return <LoginScreen />

  return children
}
