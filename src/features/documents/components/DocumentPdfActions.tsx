import { useState } from 'react'
import { Check, Download, Eye, LoaderCircle, Printer, Share2 } from 'lucide-react'

import type { Customer } from '../../customers/types/Customer'
import type { Estimate } from '../../estimates/types/Estimate'
import type { Invoice } from '../../invoices/types/Invoice'
import { loadBusinessSettings } from '../../settings/data/businessSettingsStore'
import { actOnDocument, createAndArchiveDocument } from '../services/documentPdf'
import type { BusinessDocumentRecord, PdfDocumentInput } from '../types/BusinessDocument'

type Props =
  | { kind: 'estimate'; document: Estimate; customer?: Customer }
  | { kind: 'invoice'; document: Invoice; customer?: Customer }

function customerName(customer?: Customer) {
  return customer ? `${customer.firstName} ${customer.lastName}`.trim() : 'Customer'
}

function customerAddress(customer?: Customer) {
  if (!customer) return ''
  return [customer.streetAddress, [customer.city, customer.state, customer.zipCode].filter(Boolean).join(' ')].filter(Boolean).join(', ')
}

function toPdfInput(props: Props): PdfDocumentInput {
  const settings = loadBusinessSettings()
  const common = { id: props.document.id, kind: props.kind, customerName: customerName(props.customer), customerEmail: props.customer?.email, customerPhone: props.customer?.phone, customerAddress: customerAddress(props.customer), jobName: props.document.jobName, serviceAddress: props.document.serviceAddress, description: props.document.description, scopeOfWork: props.document.scopeOfWork, exclusions: props.document.exclusions, issueDate: props.document.issueDate, lineItems: props.document.lineItems, taxRate: props.document.taxRate, discount: props.document.discount, notes: props.document.notes }
  return props.kind === 'invoice'
    ? { ...common, number: props.document.invoiceNumber, dueDate: props.document.dueDate, terms: settings.invoiceTerms }
    : { ...common, number: props.document.estimateNumber, dueDate: props.document.expirationDate, terms: settings.estimateTerms }
}

export default function DocumentPdfActions(props: Props) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [ready, setReady] = useState<{ record: BusinessDocumentRecord; blob: Blob } | null>(null)
  const [message, setMessage] = useState('')

  async function getReadyDocument() {
    if (ready) return ready
    const result = await createAndArchiveDocument(toPdfInput(props))
    const created = { record: result.record, blob: new Blob([result.bytes as BlobPart], { type: 'application/pdf' }) }
    setReady(created)
    return created
  }

  async function run(action: 'preview' | 'save' | 'share' | 'print') {
    setBusy(true)
    setMessage('')
    try {
      const generated = await getReadyDocument()
      await actOnDocument(generated.record, generated.blob, action)
      setMessage(action === 'save' ? 'Saved' : 'Ready')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Try again')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="document-pdf-actions">
      <button aria-expanded={open} onClick={() => setOpen((value) => !value)} type="button">
        {busy ? <LoaderCircle className="spin" size={16} /> : ready ? <Check size={16} /> : <Printer size={16} />}
        PDF
      </button>
      {open && <div className="pdf-action-menu" role="group" aria-label="PDF actions">
        <button disabled={busy} onClick={() => run('preview')} type="button"><Eye size={16} /> Preview</button>
        <button disabled={busy} onClick={() => run('save')} type="button"><Download size={16} /> Save</button>
        <button disabled={busy} onClick={() => run('share')} type="button"><Share2 size={16} /> Send</button>
        <button disabled={busy} onClick={() => run('print')} type="button"><Printer size={16} /> Print</button>
        {message && <small role="status">{message}</small>}
      </div>}
    </div>
  )
}
