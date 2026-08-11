import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, ArrowRight, Check, X } from 'lucide-react'

import type { PageName } from '../../components/Sidebar/navigation'
import './ProductTour.css'

type TourStep = {
  page: PageName
  selector: string
  eyebrow: string
  title: string
  body: string
}

const steps: TourStep[] = [
  { page: 'home', selector: '[data-tour="dashboard"]', eyebrow: '1 · DASHBOARD', title: 'Start with what needs attention', body: 'Your schedule, recent work, money, and highest-priority follow-ups stay together here.' },
  { page: 'customers', selector: '[data-tour="customers"]', eyebrow: '2 · CUSTOMERS', title: 'Keep every customer organized', body: 'Open a customer to see their contact details, documents, payments, notes, and secure Customer Hub.' },
  { page: 'customers', selector: '[data-tour="add-customer"]', eyebrow: '3 · ADD A CUSTOMER', title: 'Create a clean customer record', body: 'Save the phone number and email once, then reuse them for documents, reminders, and Customer Hub texts.' },
  { page: 'documents', selector: '[data-tour="estimates"]', eyebrow: '4 · ESTIMATES', title: 'Build and track estimates', body: 'Create exact-scope estimates, change their status, produce a PDF, and text the customer securely.' },
  { page: 'walkthrough', selector: '[data-tour="ai-estimate"]', eyebrow: '5 · AI WALKTHROUGH', title: 'Capture the job in the field', body: 'Talk through the work, attach photos, and turn only the work you described into an editable estimate.' },
  { page: 'documents', selector: '[data-tour="send-estimate"]', eyebrow: '6 · SEND ESTIMATE', title: 'Save before you send', body: 'Text estimate saves the latest document to the cloud first, then opens a ready-to-review customer message.' },
  { page: 'customers', selector: '[data-tour="customer-hub"]', eyebrow: '7 · CUSTOMER HUB', title: 'Give customers one secure place', body: 'Text a private link where the customer can review work, approve estimates, see appointments, and pay invoices.' },
  { page: 'documents', selector: '[data-tour="invoices"]', eyebrow: '8 · INVOICES', title: 'Invoice and collect payment', body: 'Convert accepted work, send the invoice, and let Square create checkout only when the customer chooses to pay.' },
  { page: 'inbox', selector: '[data-tour="inbox"]', eyebrow: '9 · INBOX', title: 'Never lose a new lead', body: 'Website requests arrive here so you can review, create a customer, and start an estimate.' },
  { page: 'settings', selector: '[data-tour="settings"]', eyebrow: '10 · SETTINGS', title: 'Make Owner Hub yours', body: 'Set your business identity, pricing defaults, document terms, backup, sync, and notification preferences.' },
]

type ProductTourProps = {
  initialWelcome: boolean
  onClose: (completed: boolean) => void
  onNavigate: (page: PageName) => void
}

export default function ProductTour({ initialWelcome, onClose, onNavigate }: ProductTourProps) {
  const [showWelcome, setShowWelcome] = useState(initialWelcome)
  const [stepIndex, setStepIndex] = useState(0)
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null)
  const step = steps[stepIndex]
  const progress = useMemo(() => `${stepIndex + 1} of ${steps.length}`, [stepIndex])

  useEffect(() => {
    if (showWelcome) return
    onNavigate(step.page)

    let attempts = 0
    const locateTarget = () => {
      const target = document.querySelector<HTMLElement>(step.selector)
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'center' })
        window.setTimeout(() => setTargetRect(target.getBoundingClientRect()), 220)
        return
      }
      attempts += 1
      if (attempts < 8) window.setTimeout(locateTarget, 180)
      else setTargetRect(null)
    }

    const timeout = window.setTimeout(locateTarget, 180)
    const updateRect = () => {
      const target = document.querySelector<HTMLElement>(step.selector)
      setTargetRect(target?.getBoundingClientRect() ?? null)
    }
    window.addEventListener('resize', updateRect)
    window.addEventListener('scroll', updateRect, true)

    return () => {
      window.clearTimeout(timeout)
      window.removeEventListener('resize', updateRect)
      window.removeEventListener('scroll', updateRect, true)
    }
  }, [onNavigate, showWelcome, step])

  if (showWelcome) {
    return (
      <div className="tour-welcome-backdrop" role="presentation">
        <section aria-labelledby="tour-welcome-title" aria-modal="true" className="tour-welcome" role="dialog">
          <span className="tour-welcome-mark">RF</span>
          <p>WELCOME TO OWNER HUB</p>
          <h2 id="tour-welcome-title">Let&apos;s get your workspace ready.</h2>
          <span>This quick guided tour shows where customers, estimates, the AI walkthrough, Customer Hub, invoices, and settings live.</span>
          <div>
            <button className="tour-secondary" onClick={() => onClose(false)} type="button">Skip for now</button>
            <button className="tour-primary" onClick={() => setShowWelcome(false)} type="button">Start tour <ArrowRight size={18} /></button>
          </div>
        </section>
      </div>
    )
  }

  const isLast = stepIndex === steps.length - 1

  return (
    <div className="product-tour-layer" role="presentation">
      {targetRect ? (
        <div
          aria-hidden="true"
          className="tour-highlight"
          style={{
            height: Math.max(48, targetRect.height + 12),
            left: Math.max(8, targetRect.left - 6),
            top: Math.max(8, targetRect.top - 6),
            width: Math.min(window.innerWidth - 16, targetRect.width + 12),
          }}
        />
      ) : null}
      <section aria-live="polite" aria-modal="true" className="tour-card" role="dialog">
        <div className="tour-card-topline">
          <span>{progress}</span>
          <button aria-label="Close product tour" onClick={() => onClose(false)} type="button"><X size={19} /></button>
        </div>
        <div className="tour-progress"><span style={{ width: `${((stepIndex + 1) / steps.length) * 100}%` }} /></div>
        <p>{step.eyebrow}</p>
        <h2>{step.title}</h2>
        <span>{step.body}</span>
        <div className="tour-actions">
          <button className="tour-secondary" disabled={stepIndex === 0} onClick={() => setStepIndex((current) => Math.max(0, current - 1))} type="button"><ArrowLeft size={17} /> Back</button>
          <button className="tour-primary" onClick={() => isLast ? onClose(true) : setStepIndex((current) => current + 1)} type="button">
            {isLast ? <>Finish <Check size={18} /></> : <>Next <ArrowRight size={18} /></>}
          </button>
        </div>
      </section>
    </div>
  )
}
