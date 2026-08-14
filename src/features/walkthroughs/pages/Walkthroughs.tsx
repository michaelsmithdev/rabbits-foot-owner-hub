import {
  AlertTriangle,
  Camera,
  Check,
  ClipboardList,
  FileText,
  RotateCcw,
  Sparkles,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'

import { loadCustomers } from '../../customers/data/customerStore'
import { generateAiEstimate } from '../../estimates/ai/aiEstimateService'
import { prepareEstimatePhoto } from '../../estimates/ai/estimatePhotos'
import { createEstimateNumber, loadEstimates, saveEstimates } from '../../estimates/data/estimateStore'
import type { Estimate } from '../../estimates/types/Estimate'
import { loadPendingPhotoBlob } from '../../photos/data/photoBlobStore'
import { getPhotoUrl, loadPhotos, queuePhotoFiles } from '../../photos/data/photoStore'
import { cloudClient } from '../../cloud/cloudClient'
import { loadBusinessSettings } from '../../settings/data/businessSettingsStore'
import VoiceCapture from '../../voice/components/VoiceCapture'
import type { VoiceNote } from '../../voice/types/VoiceNote'
import { latestDraftWalkthrough, upsertWalkthrough } from '../data/walkthroughStore'
import type { Walkthrough } from '../types/Walkthrough'
import './Walkthroughs.css'

const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })

function createId() {
  return typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function today() {
  return new Date().toISOString().slice(0, 10)
}

function dateAfter(days: number) {
  const date = new Date()
  date.setDate(date.getDate() + days)
  return date.toISOString().slice(0, 10)
}

function blankWalkthrough(): Walkthrough {
  const now = new Date().toISOString()
  return {
    id: createId(),
    customerId: '',
    serviceAddress: '',
    propertyType: 'residential',
    jobCategory: 'General handyman',
    typedNotes: '',
    originalTranscript: '',
    voiceNotes: [],
    photoIds: [],
    photoContext: {},
    answers: {},
    status: 'draft',
    createdAt: now,
    updatedAt: now,
  }
}

function customerAddress(customer: ReturnType<typeof loadCustomers>[number]) {
  return [customer.streetAddress, customer.city, customer.state, customer.zipCode].filter(Boolean).join(', ')
}

export default function Walkthroughs() {
  const customers = useMemo(() => loadCustomers(), [])
  const businessSettings = useMemo(() => loadBusinessSettings(), [])
  const [walkthrough, setWalkthrough] = useState<Walkthrough>(() => latestDraftWalkthrough() ?? blankWalkthrough())
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const photoInputRef = useRef<HTMLInputElement>(null)
  const initialRender = useRef(true)
  const selectedCustomer = customers.find((customer) => customer.id === walkthrough.customerId)
  const attachedPhotos = loadPhotos().filter((photo) => walkthrough.photoIds.includes(photo.id))
  const result = walkthrough.aiEstimate?.draft
  const quotedTotal = result?.economics.recommendedPrice ?? 0

  useEffect(() => {
    if (initialRender.current) {
      initialRender.current = false
      return
    }
    const timeout = window.setTimeout(() => {
      upsertWalkthrough({ ...walkthrough, updatedAt: new Date().toISOString() })
    }, 250)
    return () => window.clearTimeout(timeout)
  }, [walkthrough])

  function update(patch: Partial<Walkthrough>) {
    setWalkthrough((current) => ({ ...current, ...patch, updatedAt: new Date().toISOString() }))
    setMessage('Draft saved on this device.')
    setError('')
  }

  function chooseCustomer(customerId: string) {
    const customer = customers.find((item) => item.id === customerId)
    update({ customerId, serviceAddress: customer ? customerAddress(customer) : '' })
  }

  function updateVoiceNotes(voiceNotes: VoiceNote[]) {
    const originalTranscript = voiceNotes
      .map((note) => note.transcript.trim())
      .filter(Boolean)
      .join('\n\n')
    update({ voiceNotes, originalTranscript })
  }

  async function attachPhotos(files: File[]) {
    const available = 10 - walkthrough.photoIds.length
    if (available <= 0) {
      setError('This walkthrough already has the maximum of 10 photos.')
      return
    }
    const selectedFiles = files.slice(0, available)
    setBusy(true)
    setError('')
    try {
      const prepared = await Promise.all(selectedFiles.map(prepareEstimatePhoto))
      const saved = await queuePhotoFiles(
        prepared.map((photo) => photo.file),
        {
          customerId: walkthrough.customerId || null,
          jobName: walkthrough.jobCategory || 'AI walkthrough',
          category: 'before',
          caption: 'AI walkthrough evidence',
          capturedAt: new Date().toISOString(),
        },
      )
      const nearbyContext = [walkthrough.originalTranscript, walkthrough.typedNotes].filter(Boolean).join(' ').trim().slice(-1000)
      update({
        photoIds: [...walkthrough.photoIds, ...saved.map((photo) => photo.id)],
        photoContext: {
          ...walkthrough.photoContext,
          ...Object.fromEntries(saved.map((photo) => [photo.id, nearbyContext])),
        },
      })
      setMessage(`${saved.length} photo${saved.length === 1 ? '' : 's'} saved and attached.`)
    } catch (photoError) {
      setError(photoError instanceof Error ? photoError.message : 'The photos could not be attached.')
    } finally {
      setBusy(false)
      if (photoInputRef.current) photoInputRef.current.value = ''
    }
  }

  async function buildPhotoInputs() {
    const photos = loadPhotos().filter((photo) => walkthrough.photoIds.includes(photo.id))
    return Promise.all(photos.slice(0, 10).map(async (photo) => {
      let blob = await loadPendingPhotoBlob(photo.id)
      if (!blob) {
        const signedUrl = await getPhotoUrl(cloudClient, photo)
        if (signedUrl) blob = await fetch(signedUrl).then((response) => response.blob())
      }
      if (!blob) throw new Error(`${photo.fileName} is not available on this device yet.`)
      const prepared = await prepareEstimatePhoto(new File([blob], photo.fileName, { type: blob.type || photo.mimeType }))
      return { fileName: prepared.file.name, dataUrl: prepared.dataUrl, context: walkthrough.photoContext[photo.id] ?? '' }
    }))
  }

  async function analyze() {
    const description = [walkthrough.typedNotes.trim(), walkthrough.originalTranscript.trim()]
      .filter(Boolean)
      .join('\n\nVOICE WALKTHROUGH:\n')
    if (!walkthrough.customerId) {
      setError('Choose a customer before finishing the walkthrough.')
      return
    }
    if (description.length < 10 && walkthrough.photoIds.length === 0) {
      setError('Add a voice note, typed note, or photo before finishing the walkthrough.')
      return
    }

    setBusy(true)
    setError('')
    update({ status: 'analyzing' })
    try {
      const generation = await generateAiEstimate({
        jobDescription: description || 'Review the attached job photos and prepare a provisional handyman estimate.',
        answers: walkthrough.answers,
        customerId: walkthrough.customerId,
        customerCity: selectedCustomer?.city ?? '',
        propertyType: walkthrough.propertyType,
        jobCategory: walkthrough.jobCategory,
        photos: await buildPhotoInputs(),
      })
      const next = { ...walkthrough, status: 'ready' as const, aiEstimate: { ...generation, photoIds: walkthrough.photoIds }, updatedAt: new Date().toISOString() }
      setWalkthrough(next)
      upsertWalkthrough(next)
      setMessage('Walkthrough analyzed. Review the scope, risks, and price before creating the estimate.')
    } catch (analysisError) {
      update({ status: 'draft' })
      setError(analysisError instanceof Error ? analysisError.message : 'The walkthrough could not be analyzed.')
    } finally {
      setBusy(false)
    }
  }

  function createEstimate() {
    if (!result || !selectedCustomer) return
    const settings = businessSettings
    const estimates = loadEstimates()
    const now = new Date().toISOString()
    const estimate: Estimate = {
      id: createId(),
      estimateNumber: createEstimateNumber(estimates, settings.estimatePrefix),
      customerId: selectedCustomer.id,
      jobName: result.jobTitle || walkthrough.jobCategory,
      serviceAddress: walkthrough.serviceAddress,
      description: result.summary,
      scopeOfWork: result.customerScope,
      exclusions: result.exclusions,
      issueDate: today(),
      expirationDate: dateAfter(settings.estimateValidDays),
      lineItems: result.lineItems.map((item) => ({
        id: createId(),
        description: item.description,
        quantity: item.quantity,
        unit: item.unit,
        unitPrice: item.unitPrice,
      })),
      taxRate: settings.defaultTaxRate,
      discount: 0,
      notes: [result.customerNotes, settings.estimateTerms].filter(Boolean).join('\n\n'),
      propertyType: walkthrough.propertyType,
      jobCategory: walkthrough.jobCategory,
      materialCost: result.economics.materialCost,
      taxReservePercent: settings.defaultTaxReservePercent,
      cardProcessingFeePercent: settings.paymentProcessingOverheadPercent,
      paymentProcessingOverheadPercent: 0,
      photoIds: walkthrough.photoIds,
      aiEstimate: walkthrough.aiEstimate,
      economics: result.economics,
      walkthroughId: walkthrough.id,
      status: 'draft',
      createdAt: now,
      updatedAt: now,
    }
    saveEstimates([estimate, ...estimates])
    const converted = { ...walkthrough, status: 'converted' as const, estimateId: estimate.id, updatedAt: now }
    upsertWalkthrough(converted)
    setWalkthrough(blankWalkthrough())
    window.location.assign(`${window.location.pathname}#documents`)
  }

  function startOver() {
    if (!window.confirm('Start a new walkthrough? The current draft will remain saved in cloud history.')) return
    setWalkthrough(blankWalkthrough())
    setMessage('New walkthrough ready.')
    setError('')
  }

  return (
    <div className="walkthrough-page" data-tour="walkthrough-page">
      <header className="walkthrough-hero">
        <div>
          <span className="eyebrow">WALK IT · TALK IT · PRICE IT</span>
          <h1>AI Walkthrough</h1>
          <p>Capture the customer, jobsite story, and photos. Owner Hub turns them into a reviewable estimate—not an automatic promise.</p>
        </div>
        <button className="secondary-action" onClick={startOver} type="button"><RotateCcw size={18} /> New walkthrough</button>
      </header>

      {message && <div className="walkthrough-message" role="status"><Check size={18} /> {message}</div>}
      {error && <div className="walkthrough-error" role="alert"><AlertTriangle size={18} /> {error}</div>}

      <section className="walkthrough-grid">
        <article className="walkthrough-card" data-tour="walkthrough-customer">
          <span className="step-number">1</span>
          <h2>Customer and job</h2>
          <div className="walkthrough-fields">
            <label><span>Customer *</span><select onChange={(event) => chooseCustomer(event.target.value)} value={walkthrough.customerId}><option value="">Choose customer</option>{customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.firstName} {customer.lastName}</option>)}</select></label>
            <label><span>Service address</span><input onChange={(event) => update({ serviceAddress: event.target.value })} value={walkthrough.serviceAddress} /></label>
            <label><span>Property</span><select onChange={(event) => update({ propertyType: event.target.value as Walkthrough['propertyType'] })} value={walkthrough.propertyType}><option value="residential">Residential</option><option value="commercial">Commercial</option></select></label>
            <label><span>Job category</span><input onChange={(event) => update({ jobCategory: event.target.value })} value={walkthrough.jobCategory} /></label>
          </div>
        </article>

        <article className="walkthrough-card" data-tour="walkthrough-voice">
          <span className="step-number">2</span>
          <h2>Talk through the work</h2>
          <p className="card-help">Say what the customer wants, measurements, materials, access, damage, finish, and anything excluded.</p>
          <VoiceCapture notes={walkthrough.voiceNotes} onChange={updateVoiceNotes} />
          <label className="walkthrough-note"><span>Typed field notes</span><textarea onChange={(event) => update({ typedNotes: event.target.value })} placeholder="Example: Replace two damaged stair treads. Customer will supply stain. Basement access available…" rows={6} value={walkthrough.typedNotes} /></label>
        </article>

        <article className="walkthrough-card" data-tour="walkthrough-photos">
          <span className="step-number">3</span>
          <h2>Photograph the job</h2>
          <p className="card-help">Add up to 10 jobsite photos. Images are stored in the private business photo library.</p>
          <input accept="image/jpeg,image/png,image/webp" capture="environment" hidden multiple onChange={(event) => void attachPhotos(Array.from(event.target.files ?? []))} ref={photoInputRef} type="file" />
          <button className="photo-capture-button" disabled={busy || walkthrough.photoIds.length >= 10} onClick={() => photoInputRef.current?.click()} type="button"><Camera size={24} /> Add job photos <span>{walkthrough.photoIds.length}/10</span></button>
          <div className="walkthrough-photo-list">{attachedPhotos.map((photo) => <span key={photo.id}><Camera size={15} /> {photo.fileName}</span>)}</div>
        </article>
      </section>

      <section className="walkthrough-finish" data-tour="walkthrough-analyze">
        <div><span className="eyebrow">STEP 4 · PRICE IT</span><h2>Build the exact-scope estimate</h2><p>The AI quotes only the work you described. Optional upsells stay separate, and any card fee appears only if the customer chooses card checkout.</p></div>
        <button className="walkthrough-primary" disabled={busy} onClick={() => void analyze()} type="button"><Sparkles size={20} /> {busy ? 'Analyzing safely…' : result ? 'Reanalyze walkthrough' : 'Finish and analyze'}</button>
      </section>

      {result && (
        <section className="walkthrough-results" data-tour="walkthrough-results">
          <header><div><span className="eyebrow">OWNER REVIEW</span><h2>{result.jobTitle}</h2><p>{result.summary}</p></div><div className="recommended-price"><span>Customer total</span><strong>{currency.format(quotedTotal)}</strong><small>{result.confidence}</small></div></header>

          {result.warnings.length > 0 && <div className="profit-warnings"><AlertTriangle size={20} /><div><strong>Check before approval</strong>{result.warnings.map((warning) => <p key={warning}>{warning}</p>)}</div></div>}

          <div className="result-columns">
            <article><h3><ClipboardList size={18} /> Customer scope</h3><p>{result.customerScope}</p><h4>Exclusions</h4><ul>{result.exclusions.map((item) => <li key={item}>{item}</li>)}</ul></article>
            <article><h3><Sparkles size={18} /> Exact quote summary</h3><dl>
              <div><dt>Requested work</dt><dd>{currency.format(result.economics.recommendedPrice)}</dd></div>
              <div><dt>Estimate total</dt><dd>{currency.format(quotedTotal)}</dd></div>
              <div><dt>Labor hours / direct labor</dt><dd>{result.economics.laborHours.toFixed(1)} · {currency.format(result.economics.laborCost)}</dd></div>
              <div><dt>Direct materials</dt><dd>{currency.format(result.economics.materialCost)}</dd></div>
            </dl><small>Only the work you described is included. No automatic markup, overhead, contingency, or profit padding. A {businessSettings.paymentProcessingOverheadPercent.toFixed(1)}% fee is shown separately only if the customer chooses card checkout.</small></article>
          </div>

          {(result.upsellSuggestions ?? []).length > 0 && <article className="smart-questions"><h3>Optional upsell ideas</h3><p>These ideas are not included in the quoted total.</p><ul>{result.upsellSuggestions.map((item) => <li key={item}>{item}</li>)}</ul></article>}

          {result.questions.length > 0 && <article className="smart-questions"><h3>Optional price-sensitive questions</h3><p>The estimate is complete now. Answer only if you want the AI to refine it.</p>{result.questions.map((question) => <label key={question}><span>{question}</span><input onChange={(event) => update({ answers: { ...walkthrough.answers, [question]: event.target.value } })} value={walkthrough.answers[question] ?? ''} /></label>)}</article>}

          <button className="create-estimate-button" onClick={createEstimate} type="button"><FileText size={20} /> Create draft estimate for approval</button>
        </section>
      )}
    </div>
  )
}
