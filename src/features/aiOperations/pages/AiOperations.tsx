import {
  AlertTriangle,
  ArrowRight,
  Bot,
  Check,
  CheckCircle2,
  ClipboardCheck,
  FileCheck2,
  History,
  Link2,
  Megaphone,
  ReceiptText,
  RefreshCw,
  Settings2,
  ShieldCheck,
  Sparkles,
  X,
} from 'lucide-react'
import { useMemo, useState } from 'react'

import {
  loadAiActions,
  loadAiAudit,
  loadAutomationSettings,
  saveAutomationSettings,
  updateAiAction,
  upsertAiRecommendations,
} from '../data/operationsStore'
import {
  dismissAiAction,
  executeAiAction,
  runPermittedAutopilot,
} from '../services/actionExecutor'
import { loadOperationsSnapshot } from '../services/operationsSnapshot'
import { generateOperationsBrief, type GeneratedOperationsBrief } from '../services/operationsApi'
import { buildAiRecommendations, buildDailyBrief } from '../services/recommendationEngine'
import {
  AUTOPILOT_ELIGIBLE_ACTIONS,
  type AiAction,
  type AiActionSection,
  type AiActionType,
  type AutomationSettings,
} from '../types'
import './AiOperations.css'
import './AiOperationsExtras.css'

const sectionDetails: Record<AiActionSection, {
  title: string
  description: string
  icon: typeof AlertTriangle
}> = {
  needs_attention: {
    title: 'Needs attention',
    description: 'Time-sensitive follow-ups and field preparation.',
    icon: AlertTriangle,
  },
  ready_to_invoice: {
    title: 'Ready to invoice',
    description: 'Completed work that is ready for owner-approved billing.',
    icon: FileCheck2,
  },
  expense_alert: {
    title: 'Expense alerts',
    description: 'Receipt and job-cost matches that need a decision.',
    icon: ReceiptText,
  },
  marketing_opportunity: {
    title: 'Marketing opportunities',
    description: 'Real project proof ready for a private content draft.',
    icon: Megaphone,
  },
  pricing_intelligence: {
    title: 'Pricing intelligence',
    description: 'Historical cost and margin patterns worth reviewing.',
    icon: Sparkles,
  },
}

const actionLabels: Record<AiActionType, string> = {
  create_customer_task: 'Lead follow-up task',
  create_estimate_draft: 'Estimate draft',
  create_invoice_draft: 'Create invoice draft',
  create_expense: 'Expense draft',
  link_expense_to_job: 'Approve match',
  categorize_expense: 'Update category',
  send_customer_message: 'Send message',
  draft_customer_message: 'Create message draft',
  create_job_checklist: 'Create checklist',
  update_job_cost: 'Update job cost',
  request_review: 'Draft review request',
  create_social_draft: 'Generate post brief',
  generate_material_list: 'Create material list',
  flag_pricing_problem: 'Record pricing alert',
  create_owner_alert: 'Record owner alert',
}

const sections = Object.keys(sectionDetails) as AiActionSection[]

function formatCurrency(value: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value)
}

function initializeOperationsSnapshot() {
  const snapshot = loadOperationsSnapshot()
  upsertAiRecommendations(buildAiRecommendations(snapshot))
  runPermittedAutopilot()
  return loadOperationsSnapshot()
}

function AiOperations() {
  const [snapshot, setSnapshot] = useState(initializeOperationsSnapshot)
  const [actions, setActions] = useState(loadAiActions)
  const [audit, setAudit] = useState(loadAiAudit)
  const [settings, setSettings] = useState(loadAutomationSettings)
  const [expandedActionId, setExpandedActionId] = useState<string | null>(null)
  const [busyActionId, setBusyActionId] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const [activityOpen, setActivityOpen] = useState(false)
  const [generatedBrief, setGeneratedBrief] = useState<GeneratedOperationsBrief | null>(null)
  const [isGeneratingBrief, setIsGeneratingBrief] = useState(false)

  const brief = useMemo(() => buildDailyBrief(snapshot), [snapshot])
  const pending = actions.filter((action) => action.status === 'pending')

  function refresh(options: { runAutopilot?: boolean } = {}) {
    const nextSnapshot = loadOperationsSnapshot()
    upsertAiRecommendations(buildAiRecommendations(nextSnapshot))
    const autopilotResults = options.runAutopilot ? runPermittedAutopilot() : []
    setSnapshot(loadOperationsSnapshot())
    setActions(loadAiActions())
    setAudit(loadAiAudit())
    if (autopilotResults.length > 0) {
      const completed = autopilotResults.filter((result) => result.status === 'completed').length
      setMessage(`Autopilot reviewed ${autopilotResults.length} permitted action${autopilotResults.length === 1 ? '' : 's'} and completed ${completed}.`)
    }
  }

  function changeSettings(patch: Partial<AutomationSettings>) {
    const saved = saveAutomationSettings({ ...settings, ...patch })
    setSettings(saved)
    if (saved.mode === 'autopilot') {
      window.setTimeout(() => refresh({ runAutopilot: true }), 0)
    }
  }

  function toggleAutopilotAction(type: AiActionType) {
    const allowed = settings.allowedAutopilotActions.includes(type)
      ? settings.allowedAutopilotActions.filter((item) => item !== type)
      : [...settings.allowedAutopilotActions, type]
    changeSettings({ allowedAutopilotActions: allowed })
  }

  function approve(action: AiAction) {
    setBusyActionId(action.id)
    setMessage('')
    try {
      const completed = executeAiAction(action.id, 'owner')
      setMessage(completed?.result && typeof completed.result.summary === 'string'
        ? completed.result.summary
        : 'The approved action was completed and logged.')
      refresh()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'The action could not be completed.')
      setActions(loadAiActions())
      setAudit(loadAiAudit())
    } finally {
      setBusyActionId(null)
    }
  }

  function dismiss(action: AiAction) {
    setBusyActionId(action.id)
    try {
      dismissAiAction(action.id)
      setMessage('Recommendation dismissed and recorded in AI Activity.')
      setActions(loadAiActions())
      setAudit(loadAiAudit())
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'The recommendation could not be dismissed.')
    } finally {
      setBusyActionId(null)
    }
  }

  function chooseJob(action: AiAction, jobId: string) {
    updateAiAction(action.id, {
      jobId,
      input: { ...action.input, jobId },
    })
    setActions(loadAiActions())
  }

  async function requestAiBrief() {
    setIsGeneratingBrief(true)
    setMessage('')
    try {
      setGeneratedBrief(await generateOperationsBrief(brief, pending))
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'AI briefing is temporarily unavailable. Your normal recommendations still work.')
    } finally {
      setIsGeneratingBrief(false)
    }
  }

  return (
    <div className="ai-operations-page" data-tour="ai-operations-page">
      <section className="ai-operations-hero">
        <div>
          <span className="eyebrow">CONNECTED BUSINESS INTELLIGENCE</span>
          <h1>AI Operations</h1>
          <p>Owner-controlled recommendations built from your current customers, leads, jobs, documents, receipts, costs, photos, and history.</p>
        </div>
        <button onClick={() => refresh({ runAutopilot: true })} type="button">
          <RefreshCw aria-hidden="true" size={18} /> Refresh analysis
        </button>
      </section>

      {message ? <p className="ai-operations-message" role="status">{message}</p> : null}

      <section className="ai-control-grid">
        <article className="ai-brief-card">
          <header><span><Bot size={22} /></span><div><p className="eyebrow">DAILY BRIEF</p><h2>{generatedBrief?.headline ?? brief.greeting}</h2></div><button disabled={isGeneratingBrief} onClick={() => void requestAiBrief()} type="button"><Sparkles size={16}/>{isGeneratingBrief ? 'Analyzing…' : 'AI insight'}</button></header>
          <div className="ai-brief-metrics">
            <span><strong>{brief.scheduledJobs}</strong> jobs scheduled</span>
            <span><strong>{formatCurrency(brief.outstanding)}</strong> outstanding</span>
            <span><strong>{brief.estimatesNeedingFollowUp}</strong> estimates need follow-up</span>
            <span><strong>{brief.receiptsNeedingAssignment}</strong> receipts need jobs</span>
            <span><strong>{formatCurrency(brief.yesterdayProfit)}</strong> yesterday&apos;s estimated gross profit</span>
          </div>
          {generatedBrief ? <div className="ai-generated-brief"><p>{generatedBrief.summary}</p><p><b>Priority:</b> {generatedBrief.priority}</p>{generatedBrief.watchouts.length > 0 ? <ul>{generatedBrief.watchouts.map((watchout) => <li key={watchout}>{watchout}</li>)}</ul> : null}</div> : <p><b>Priority:</b> {brief.priority}</p>}
        </article>

        <article className="ai-mode-card">
          <header><Settings2 size={21}/><div><p className="eyebrow">OWNER CONTROL</p><h2>Operating mode</h2></div></header>
          <div className="ai-mode-options" role="radiogroup" aria-label="AI operating mode">
            {(['manual', 'approval', 'autopilot'] as const).map((mode) => (
              <button aria-checked={settings.mode === mode} className={settings.mode === mode ? 'active' : ''} key={mode} onClick={() => changeSettings({ mode })} role="radio" type="button">
                <strong>{mode}</strong>
                <span>{mode === 'manual' ? 'Recommendations only' : mode === 'approval' ? 'You approve every action' : 'Only your safe allowlist runs'}</span>
              </button>
            ))}
          </div>
          <p className="ai-safety-note"><ShieldCheck size={17}/> Payments, deletion, balances, accounting history, and business configuration are never available to autopilot.</p>
          <div className="ai-follow-up-settings">
            <label><input checked={settings.customerFollowUpsEnabled} onChange={(event) => changeSettings({ customerFollowUpsEnabled: event.target.checked })} type="checkbox"/><span><strong>Follow-up assistant</strong><small>Creates staged drafts for estimates, overdue invoices, and reviews. Nothing sends without your approval.</small></span></label>
            {settings.customerFollowUpsEnabled ? <div className="ai-cadence-grid">
              <label><span>Estimate follow-ups (days)</span><input onChange={(event) => changeSettings({ estimateFollowUpScheduleDays: event.target.value.split(',').map(Number).filter(Number.isFinite) })} value={settings.estimateFollowUpScheduleDays.join(', ')}/></label>
              <label><span>Invoice reminders (days overdue)</span><input onChange={(event) => changeSettings({ invoiceReminderScheduleDays: event.target.value.split(',').map(Number).filter(Number.isFinite) })} value={settings.invoiceReminderScheduleDays.join(', ')}/></label>
              <label><span>Review request after payment</span><input min="0" onChange={(event) => changeSettings({ reviewRequestDelayDays: Number(event.target.value) })} type="number" value={settings.reviewRequestDelayDays}/></label>
            </div> : null}
          </div>
          {settings.mode === 'autopilot' ? (
            <div className="ai-autopilot-settings">
              <strong>Allowed low-risk actions</strong>
              {AUTOPILOT_ELIGIBLE_ACTIONS.map((type) => (
                <label key={type}><input checked={settings.allowedAutopilotActions.includes(type)} onChange={() => toggleAutopilotAction(type)} type="checkbox"/><span>{actionLabels[type]}</span></label>
              ))}
              <label className="ai-confidence-slider"><span>Minimum confidence: {Math.round(settings.minimumConfidence * 100)}%</span><input max="0.99" min="0.5" onChange={(event) => changeSettings({ minimumConfidence: Number(event.target.value) })} step="0.01" type="range" value={settings.minimumConfidence}/></label>
            </div>
          ) : null}
        </article>
      </section>

      <section className="ai-queue-heading">
        <div><p className="eyebrow">OWNER QUEUE</p><h2>{pending.length} recommendation{pending.length === 1 ? '' : 's'} ready</h2></div>
        <span>{settings.mode === 'manual' ? 'Analysis only' : settings.mode === 'approval' ? 'Approval required' : 'Guarded autopilot'}</span>
      </section>

      {pending.length === 0 ? (
        <section className="ai-empty-state"><CheckCircle2 size={38}/><h2>You&apos;re caught up</h2><p>New recommendations will appear as business records change on mobile or web.</p></section>
      ) : sections.map((section) => {
        const sectionActions = pending.filter((action) => action.section === section)
        if (sectionActions.length === 0) return null
        const details = sectionDetails[section]
        const Icon = details.icon
        return (
          <section className="ai-action-section" key={section}>
            <header><span className={`ai-section-icon ${section}`}><Icon size={21}/></span><div><h2>{details.title}</h2><p>{details.description}</p></div><b>{sectionActions.length}</b></header>
            <div className="ai-action-list">
              {sectionActions.map((action) => {
                const expanded = expandedActionId === action.id
                const selectedJobId = typeof action.input.jobId === 'string' ? action.input.jobId : ''
                return (
                  <article className="ai-action-card" key={action.id}>
                    <div className="ai-action-main">
                      <div className="ai-action-title"><div><h3>{action.title}</h3><p>{action.summary}</p></div><span className={`ai-confidence ${action.confidence >= .9 ? 'high' : action.confidence >= .75 ? 'medium' : 'low'}`}>{Math.round(action.confidence * 100)}% confidence</span></div>
                      {action.type === 'link_expense_to_job' && expanded ? (
                        <label className="ai-job-choice"><span>Expense belongs to</span><select onChange={(event) => chooseJob(action, event.target.value)} value={selectedJobId}>{snapshot.jobs.filter((job) => !['completed', 'invoiced'].includes(job.status) || job.id === selectedJobId).map((job) => <option key={job.id} value={job.id}>{job.jobNumber} · {job.jobName}</option>)}</select></label>
                      ) : null}
                      {expanded ? <div className="ai-action-details"><div><strong>Why this appeared</strong><p>{action.reason}</p></div><div><strong>What approval does</strong><p>{action.proposedResult}</p></div><div><strong>Safety</strong><p>{action.risk === 'low' ? 'Low risk and reversible where practical.' : 'This action changes a business record and always requires owner approval.'}</p></div></div> : null}
                    </div>
                    <div className="ai-action-buttons">
                      <button className="secondary" onClick={() => setExpandedActionId(expanded ? null : action.id)} type="button">Review</button>
                      {settings.mode !== 'manual' ? <button className="approve" disabled={busyActionId === action.id} onClick={() => approve(action)} type="button"><Check size={17}/>{actionLabels[action.type]}</button> : null}
                      <button aria-label="Dismiss recommendation" className="dismiss" disabled={busyActionId === action.id} onClick={() => dismiss(action)} title="Dismiss" type="button"><X size={18}/></button>
                    </div>
                  </article>
                )
              })}
            </div>
          </section>
        )
      })}

      <section className="ai-activity-panel">
        <button aria-expanded={activityOpen} onClick={() => setActivityOpen((open) => !open)} type="button"><History size={20}/><span><strong>AI Activity</strong><small>{audit.length} logged owner and autopilot decision{audit.length === 1 ? '' : 's'}</small></span><ArrowRight className={activityOpen ? 'open' : ''} size={19}/></button>
        {activityOpen ? <div className="ai-activity-list">{audit.length === 0 ? <p>No AI actions have been approved or dismissed yet.</p> : audit.slice(0, 100).map((entry) => <article key={entry.id}><span className={`ai-activity-status ${entry.status}`}>{entry.status === 'completed' ? <CheckCircle2 size={17}/> : entry.status === 'dismissed' ? <X size={17}/> : <AlertTriangle size={17}/>}</span><div><strong>{actionLabels[entry.action]}</strong><p>{typeof entry.result.summary === 'string' ? entry.result.summary : entry.reason}</p><small>{new Date(entry.timestamp).toLocaleString()} · {entry.ownerApproval === 'owner' ? 'Approved by owner' : entry.ownerApproval === 'autopilot' ? 'Permitted autopilot' : 'Dismissed by owner'}</small></div></article>)}</div> : null}
      </section>

      <footer className="ai-operations-footer"><ClipboardCheck size={18}/><span>All financial math is deterministic and shared. AI may recommend, but validated Owner Hub tools perform every approved change.</span><Link2 size={16}/></footer>
    </div>
  )
}

export default AiOperations
