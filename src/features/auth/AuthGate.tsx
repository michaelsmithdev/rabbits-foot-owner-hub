import { BriefcaseBusiness, CloudOff, LoaderCircle, ShieldCheck } from 'lucide-react'
import { type FormEvent, type ReactNode, useState } from 'react'

import { useAuth } from './authContext'
import './auth.css'

type LoginView = 'sign-in' | 'sign-up' | 'reset'

function LoginScreen() {
  const joiningTeam = window.location.hash.startsWith('#invite/')
  const { sendPasswordReset, signIn, signUp } = useAuth()
  const [view, setView] = useState<LoginView>('sign-in')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [businessName, setBusinessName] = useState('')
  const [displayName, setDisplayName] = useState('')
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
        setMessage(await signUp(email, password, businessName || (joiningTeam ? 'Invitation pending' : ''), displayName))
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
          alt="Owner Hub"
          className="auth-logo"
          height="112"
          src="/rabbits-foot-logo.png"
          width="112"
        />
        <p className="eyebrow">CONTRACTOR BUSINESS PLATFORM</p>
        <h1 id="auth-title">
          {view === 'sign-in'
            ? 'Welcome back.'
            : view === 'sign-up'
              ? joiningTeam ? 'Create your team login.' : 'Start your 14-day trial.'
              : 'Reset your password.'}
        </h1>
        <p className="auth-intro">
          Run estimates, jobs, customer communication, invoices, and payments
          from one protected workspace.
        </p>

        <form className="auth-form" onSubmit={handleSubmit}>
          {view === 'sign-up' && (
            <>
              <label>
                <span>Your name</span>
                <input autoComplete="name" onChange={(event) => setDisplayName(event.target.value)} required value={displayName} />
              </label>
              {!joiningTeam && <label>
                <span>Business name</span>
                <input autoComplete="organization" onChange={(event) => setBusinessName(event.target.value)} required value={businessName} />
              </label>}
            </>
          )}
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
              view === 'sign-up' ? <BriefcaseBusiness aria-hidden="true" size={20} /> : <ShieldCheck aria-hidden="true" size={20} />
            )}
            {view === 'sign-in'
              ? 'Sign in securely'
              : view === 'sign-up'
                ? 'Start free trial'
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
                Start free trial
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
