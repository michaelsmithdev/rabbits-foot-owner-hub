import { useEffect, useState } from 'react'
import { AlertTriangle, CheckCircle2, Clock3, Mail } from 'lucide-react'

import { useAuth } from '../../auth/authContext'
import { cloudClient } from '../../cloud/cloudClient'
import type { Customer } from '../../customers/types/Customer'
import './EmailDeliveryStatus.css'

type DeliveryStatus = 'pending' | 'sent' | 'delivered' | 'delayed' | 'failed' | 'bounced' | 'complained' | 'suppressed'

type DeliveryLog = {
  id: string
  email_type: string
  recipient: string
  status: DeliveryStatus
  created_at: string
  delivered_at: string | null
}

type EmailHealth = {
  status: 'unknown' | 'valid' | 'delivered' | 'bounced' | 'complained' | 'suppressed'
  email_bounce_count: number
  last_email_bounced_at: string | null
}

const blockedStatuses = new Set(['bounced', 'complained', 'suppressed'])

function StatusIcon({ status }: { status: DeliveryStatus }) {
  if (status === 'delivered') return <CheckCircle2 aria-hidden="true" size={16} />
  if (blockedStatuses.has(status) || status === 'failed') return <AlertTriangle aria-hidden="true" size={16} />
  return <Clock3 aria-hidden="true" size={16} />
}

export default function EmailDeliveryStatus({ customer }: { customer: Customer }) {
  const { session } = useAuth()
  const [logs, setLogs] = useState<DeliveryLog[]>([])
  const [health, setHealth] = useState<EmailHealth | null>(null)
  const [message, setMessage] = useState('')

  useEffect(() => {
    let active = true
    async function load() {
      if (!cloudClient || !session || !customer.email.trim()) {
        setLogs([])
        setHealth(null)
        return
      }
      const organizationId = localStorage.getItem('owner-hub-active-organization')
      if (!organizationId) return
      const [logsResult, healthResult] = await Promise.all([
        cloudClient.from('email_delivery_logs')
          .select('id,email_type,recipient,status,created_at,delivered_at')
          .eq('organization_id', organizationId)
          .eq('customer_id', customer.id)
          .order('created_at', { ascending: false })
          .limit(5),
        cloudClient.from('customer_email_health')
          .select('status,email_bounce_count,last_email_bounced_at')
          .eq('organization_id', organizationId)
          .eq('customer_id', customer.id)
          .eq('email', customer.email.trim().toLowerCase())
          .maybeSingle(),
      ])
      if (!active) return
      if (logsResult.error || healthResult.error) {
        setMessage('Email delivery tracking will appear after production email setup is completed.')
        return
      }
      setLogs((logsResult.data ?? []) as DeliveryLog[])
      setHealth((healthResult.data as EmailHealth | null) ?? null)
      setMessage('')
    }
    void load()
    return () => { active = false }
  }, [customer.email, customer.id, session])

  const isBlocked = Boolean(health && blockedStatuses.has(health.status))

  return (
    <article className="customer-card email-delivery-card">
      <div className="customer-card-header">
        <span className="email-delivery-icon"><Mail aria-hidden="true" size={20} /></span>
        <div className="customer-card-name">
          <h2>Email delivery</h2>
          <p>Recent estimate and invoice emails</p>
        </div>
      </div>
      {!customer.email.trim() && <p>No email address saved for this customer.</p>}
      {isBlocked && (
        <p className="email-delivery-warning" role="alert">
          <AlertTriangle aria-hidden="true" size={17} />
          Previous email delivery failed. Verify this customer's email address before sending again.
        </p>
      )}
      {message && <p className="email-delivery-note">{message}</p>}
      {customer.email.trim() && !message && logs.length === 0 && (
        <p className="email-delivery-note">No email has been sent to this customer yet.</p>
      )}
      {logs.length > 0 && (
        <ul className="email-delivery-list">
          {logs.map((log) => (
            <li key={log.id}>
              <span className={`email-delivery-badge status-${log.status}`}>
                <StatusIcon status={log.status} />
                {log.status}
              </span>
              <span>{log.email_type.replaceAll('_', ' ')}</span>
              <time dateTime={log.created_at}>{new Date(log.created_at).toLocaleString()}</time>
            </li>
          ))}
        </ul>
      )}
    </article>
  )
}
