import { CheckCircle2, LoaderCircle } from 'lucide-react'
import { useEffect, useState } from 'react'

import { useAuth } from '../auth/authContext'
import './pages/BusinessWorkspace.css'

const apiOrigin = (import.meta.env.VITE_OWNER_HUB_API_URL ?? '').replace(/\/$/, '')

export default function InviteAcceptance({ token }: { token: string }) {
  const { session } = useAuth()
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading')
  const [message, setMessage] = useState('Joining the secure business workspace…')

  useEffect(() => {
    if (!session) return
    const controller = new AbortController()
    void fetch(`${apiOrigin}/api/saas`, {
      method: 'POST', signal: controller.signal,
      headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'accept-invite', token }),
    }).then(async (response) => {
      const payload = await response.json() as { error?: string; message?: string; organizationId?: string }
      if (!response.ok) throw new Error(payload.error || 'The invitation could not be accepted.')
      if (payload.organizationId) localStorage.setItem('owner-hub-active-organization', payload.organizationId)
      setStatus('success')
      setMessage(payload.message ?? 'You joined the workspace.')
      window.setTimeout(() => { window.location.hash = ''; window.location.reload() }, 1200)
    }).catch((error: unknown) => {
      if (controller.signal.aborted) return
      setStatus('error')
      setMessage(error instanceof Error ? error.message : 'The invitation could not be accepted.')
    })
    return () => controller.abort()
  }, [session, token])

  return <main className="auth-screen"><section className="auth-card"><p className="eyebrow">TEAM INVITATION</p>{status === 'loading' ? <LoaderCircle className="auth-spinner" size={34}/> : status === 'success' ? <CheckCircle2 color="#5d9300" size={38}/> : null}<h1>{status === 'error' ? 'Invitation needs attention.' : status === 'success' ? 'You’re in.' : 'Joining workspace…'}</h1><p className={status === 'error' ? 'auth-error' : 'auth-intro'}>{message}</p>{status === 'error' && <button className="auth-submit" onClick={() => { window.location.hash = ''; window.location.reload() }} type="button">Return to Owner Hub</button>}</section></main>
}

