import { CalendarDays, Clock3, Link, Mail, MapPin, MessageSquareText, Plus, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'

import { loadCommunications, saveCommunications } from '../../communications/data/communicationStore'
import type { Communication } from '../../communications/types/Communication'
import { loadCustomers } from '../../customers/data/customerStore'
import type { Customer } from '../../customers/types/Customer'
import { useAuth } from '../../auth/authContext'
import { appointmentConflicts, loadAppointments, saveAppointments } from '../data/appointmentStore'
import type { Appointment, AppointmentStatus } from '../types/Appointment'
import './Schedule.css'

const statusLabels: Record<AppointmentStatus, string> = {
  scheduled: 'Scheduled', confirmed: 'Confirmed', en_route: 'En route', arrived: 'Arrived', completed: 'Completed', canceled: 'Canceled',
}

function localDateTime(date = new Date()) {
  const adjusted = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return adjusted.toISOString().slice(0, 16)
}

function localDateKey(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value)
  return localDateTime(date).slice(0, 10)
}

function customerName(customer?: Customer) {
  return customer ? `${customer.firstName} ${customer.lastName}`.trim() : 'Customer'
}

function fullAddress(customer?: Customer) {
  if (!customer) return ''
  return [customer.streetAddress, customer.city, customer.state, customer.zipCode].filter(Boolean).join(', ')
}

function appointmentMessage(item: Appointment, customer: Customer | undefined, kind: Communication['kind']) {
  const when = new Date(item.startAt).toLocaleString([], { dateStyle: 'full', timeStyle: 'short' })
  const greeting = `Hi ${customer?.firstName || 'there'},`
  if (kind === 'on_my_way') return `${greeting} Rabbit's Foot Handyman Services is on the way for ${item.title}. See you soon.`
  if (kind === 'appointment_reminder') return `${greeting} this is a reminder that ${item.title} is scheduled for ${when} at ${item.serviceAddress}. Reply if anything has changed.`
  return `${greeting} your appointment for ${item.title} is confirmed for ${when} at ${item.serviceAddress}. Thank you for choosing Rabbit's Foot Handyman Services.`
}

export default function Schedule() {
  const { session } = useAuth()
  const customers = loadCustomers()
  const [appointments, setAppointments] = useState(loadAppointments)
  const [communications, setCommunications] = useState(loadCommunications)
  const firstStart = useMemo(() => {
    const date = new Date(); date.setHours(date.getHours() + 1, 0, 0, 0); return localDateTime(date)
  }, [])
  const [draft, setDraft] = useState({ customerId: '', title: '', startAt: firstStart, endAt: localDateTime(new Date(new Date(firstStart).getTime() + 60 * 60_000)), notes: '' })
  const [error, setError] = useState('')
  const [portalMessage, setPortalMessage] = useState('')

  function persist(next: Appointment[]) { setAppointments(next); saveAppointments(next) }

  function createAppointment() {
    const customer = customers.find((item) => item.id === draft.customerId)
    if (!customer || !draft.title.trim()) { setError('Choose a customer and enter the work being scheduled.'); return }
    if (new Date(draft.endAt) <= new Date(draft.startAt)) { setError('The ending time must be after the starting time.'); return }
    const now = new Date().toISOString()
    const appointment: Appointment = {
      id: crypto.randomUUID(), customerId: customer.id, title: draft.title.trim(), serviceAddress: fullAddress(customer),
      startAt: new Date(draft.startAt).toISOString(), endAt: new Date(draft.endAt).toISOString(), status: 'scheduled',
      notes: draft.notes.trim(), createdAt: now, updatedAt: now,
    }
    const conflicts = appointmentConflicts(appointments, appointment)
    if (conflicts.length) { setError(`This overlaps ${conflicts[0].title}. Choose another time.`); return }
    persist([...appointments, appointment])
    setDraft({ customerId: '', title: '', startAt: firstStart, endAt: localDateTime(new Date(new Date(firstStart).getTime() + 60 * 60_000)), notes: '' })
    setError('')
  }

  function updateStatus(id: string, status: AppointmentStatus) {
    persist(appointments.map((item) => item.id === id ? { ...item, status, updatedAt: new Date().toISOString() } : item))
  }

  function removeAppointment(id: string) {
    if (!window.confirm('Delete this appointment?')) return
    persist(appointments.filter((item) => item.id !== id))
  }

  function handOffMessage(item: Appointment, channel: 'sms' | 'email', kind: Communication['kind']) {
    const customer = customers.find((entry) => entry.id === item.customerId)
    const body = appointmentMessage(item, customer, kind)
    const record: Communication = {
      id: crypto.randomUUID(), customerId: item.customerId, appointmentId: item.id, channel, kind,
      status: 'copied', subject: kind === 'on_my_way' ? 'On the way' : "Rabbit's Foot appointment", body, createdAt: new Date().toISOString(),
    }
    const next = [record, ...communications]; setCommunications(next); saveCommunications(next)
    if (kind === 'appointment_reminder') persist(appointments.map((entry) => entry.id === item.id ? { ...entry, reminderSentAt: record.createdAt, updatedAt: record.createdAt } : entry))
    const recipient = channel === 'sms' ? customer?.phone : customer?.email
    const handoffUrl = channel === 'sms'
      ? `sms:${recipient ?? ''}?body=${encodeURIComponent(body)}`
      : `mailto:${recipient ?? ''}?subject=${encodeURIComponent(record.subject)}&body=${encodeURIComponent(body)}`
    window.open(handoffUrl, '_self')
  }

  async function createCustomerHubLink(customerId: string) {
    if (!session?.access_token) { setPortalMessage('Sign in before creating a Customer Hub link.'); return }
    setPortalMessage('Creating secure Customer Hub link...')
    try {
      const apiOrigin = import.meta.env.VITE_OWNER_HUB_API_URL?.trim().replace(/\/$/, '') ?? ''
      const response = await fetch(`${apiOrigin}/api/customer-portal`, { method: 'POST', headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'create', customerId }) })
      const payload = await response.json() as { url?: string; error?: string }
      if (!response.ok || !payload.url) throw new Error(payload.error || 'Customer Hub link failed.')
      await navigator.clipboard.writeText(payload.url).catch(() => undefined)
      setPortalMessage(`Customer Hub link copied: ${payload.url}`)
    } catch (reason) {
      setPortalMessage(reason instanceof Error ? reason.message : 'Customer Hub link failed.')
    }
  }

  const grouped = appointments.reduce<Record<string, Appointment[]>>((groups, item) => {
    const key = localDateKey(item.startAt); (groups[key] ??= []).push(item); return groups
  }, {})

  return <section className="schedule-page">
    <header className="schedule-header"><div><p className="eyebrow">FIELD CALENDAR</p><h1>Schedule</h1><p>Book work, prevent overlaps, and keep customers informed.</p></div></header>
    {portalMessage && <div className="schedule-error" role="status">{portalMessage}</div>}
    <div className="schedule-layout">
      <article className="schedule-card schedule-builder"><h2><Plus size={20}/> New appointment</h2>
        <label><span>Customer</span><select value={draft.customerId} onChange={(event) => setDraft({ ...draft, customerId: event.target.value })}><option value="">Choose customer</option>{customers.map((customer) => <option key={customer.id} value={customer.id}>{customerName(customer)}</option>)}</select></label>
        {draft.customerId && <button className="schedule-primary" onClick={()=>void createCustomerHubLink(draft.customerId)} type="button"><Link size={16}/> Copy Customer Hub link</button>}
        <label><span>Work</span><input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} placeholder="Drywall repair" /></label>
        <div className="schedule-time-grid"><label><span>Starts</span><input type="datetime-local" value={draft.startAt} onChange={(event) => setDraft({ ...draft, startAt: event.target.value })}/></label><label><span>Ends</span><input type="datetime-local" value={draft.endAt} onChange={(event) => setDraft({ ...draft, endAt: event.target.value })}/></label></div>
        <label><span>Appointment notes</span><textarea rows={3} value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })}/></label>
        {error && <p className="schedule-error" role="alert">{error}</p>}
        <button className="schedule-primary" onClick={createAppointment} type="button">Add to schedule</button>
      </article>
      <div className="schedule-agenda">
        {Object.keys(grouped).length === 0 ? <article className="schedule-empty"><CalendarDays size={32}/><h2>No appointments yet</h2><p>Scheduled work will appear here.</p></article> : Object.entries(grouped).sort(([a],[b]) => a.localeCompare(b)).map(([date, items]) => <section className="schedule-day" key={date}><h2>{new Date(`${date}T12:00:00`).toLocaleDateString([], { weekday:'long', month:'long', day:'numeric' })}</h2>{items.sort((a,b)=>a.startAt.localeCompare(b.startAt)).map((item) => { const customer=customers.find((entry)=>entry.id===item.customerId); return <article className="appointment-card" key={item.id}><header><div><strong>{item.title}</strong><span>{customerName(customer)}</span></div><select aria-label="Appointment status" value={item.status} onChange={(event)=>updateStatus(item.id,event.target.value as AppointmentStatus)}>{Object.entries(statusLabels).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></header><p><Clock3 size={16}/>{new Date(item.startAt).toLocaleTimeString([], {hour:'numeric',minute:'2-digit'})}-{new Date(item.endAt).toLocaleTimeString([], {hour:'numeric',minute:'2-digit'})}</p><p><MapPin size={16}/>{item.serviceAddress || 'No service address'}</p>{item.notes && <small>{item.notes}</small>}<footer><button onClick={()=>handOffMessage(item,'sms','appointment_confirmation')} type="button"><MessageSquareText size={16}/> Confirm</button><button onClick={()=>handOffMessage(item,'email','appointment_reminder')} type="button"><Mail size={16}/> Remind</button><button onClick={()=>handOffMessage(item,'sms','on_my_way')} type="button"><MessageSquareText size={16}/> On my way</button><button onClick={()=>void createCustomerHubLink(item.customerId)} type="button"><Link size={16}/> Customer Hub</button><button className="danger" onClick={()=>removeAppointment(item.id)} type="button"><Trash2 size={16}/></button></footer></article>})}</section>)}
        {communications.length > 0 && <section className="schedule-day"><h2>Recent customer messages</h2>{communications.slice(0,5).map((item)=><article className="appointment-card" key={item.id}><header><div><strong>{customerName(customers.find((customer)=>customer.id===item.customerId))}</strong><span>{item.channel.toUpperCase()} - {new Date(item.createdAt).toLocaleString()}</span></div></header><small>{item.body}</small></article>)}</section>}
      </div>
    </div>
  </section>
}
