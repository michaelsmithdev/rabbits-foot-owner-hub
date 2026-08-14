import { Download, ExternalLink, FileText, LoaderCircle, X } from 'lucide-react'
import { useEffect, useState } from 'react'

import { generateBusinessDocumentPdf } from '../documents/services/documentPdf'
import type { PdfDocumentInput } from '../documents/types/BusinessDocument'
import type {
  PortalData,
  PortalEstimate,
  PortalInvoice,
} from './PublicCustomerPortal'

type Props =
  | {
      kind: 'estimate'
      document: PortalEstimate
      customer: PortalData['customer']
      business: PortalData['business']
    }
  | {
      kind: 'invoice'
      document: PortalInvoice
      customer: PortalData['customer']
      business: PortalData['business']
    }

function customerName(customer: PortalData['customer']) {
  return `${customer.firstName} ${customer.lastName}`.trim() || 'Customer'
}

function customerAddress(customer: PortalData['customer']) {
  const locality = [customer.city, customer.state, customer.zipCode]
    .filter(Boolean)
    .join(' ')
  return [customer.streetAddress, locality].filter(Boolean).join(', ')
}

function toPdfInput(props: Props): PdfDocumentInput {
  const common = {
    id: props.document.id,
    kind: props.kind,
    customerName: customerName(props.customer),
    customerEmail: props.customer.email,
    customerPhone: props.customer.phone,
    customerAddress: customerAddress(props.customer),
    jobName: props.document.jobName,
    serviceAddress: props.document.serviceAddress,
    description: props.document.description || '',
    scopeOfWork: props.document.scopeOfWork,
    exclusions: props.document.exclusions,
    issueDate: props.document.issueDate,
    lineItems: props.document.lineItems ?? [],
    taxRate: props.document.taxRate ?? 0,
    discount: props.document.discount ?? 0,
    notes: props.document.notes || '',
    business: {
      name: props.business.name,
      phone: props.business.phoneDisplay,
      email: props.business.email,
      website: props.business.website,
    },
  }

  if (props.kind === 'invoice') {
    return {
      ...common,
      number: props.document.invoiceNumber,
      dueDate: props.document.dueDate,
      terms: props.business.invoiceTerms,
      payments: props.document.payments.map((payment) => ({
        date: payment.date,
        amount: payment.amount,
        method: payment.method,
        referenceNumber: payment.referenceNumber,
        notes: payment.notes,
      })),
    }
  }

  return {
    ...common,
    number: props.document.estimateNumber,
    dueDate: props.document.expirationDate,
    terms: props.business.estimateTerms,
    approval:
      props.document.approval?.customerName &&
      props.document.approval.acceptedAt
        ? {
            customerName: props.document.approval.customerName,
            acceptedAt: props.document.approval.acceptedAt,
            method: props.document.approval.method || 'customer_portal',
            note: props.document.approval.note,
          }
        : undefined,
  }
}

function safeFileName(value: string) {
  return value
    .replace(/[^a-z0-9-_]+/gi, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

export default function CustomerPortalDocumentPdf(props: Props) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [pdfUrl, setPdfUrl] = useState('')

  const number =
    props.kind === 'invoice'
      ? props.document.invoiceNumber
      : props.document.estimateNumber
  const fileName = `${props.kind === 'invoice' ? 'Invoice' : 'Estimate'}-${safeFileName(number)}.pdf`

  useEffect(() => {
    return () => {
      if (pdfUrl) URL.revokeObjectURL(pdfUrl)
    }
  }, [pdfUrl])

  useEffect(() => {
    if (!pdfUrl) return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPdfUrl('')
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [pdfUrl])

  async function viewPdf() {
    setBusy(true)
    setError('')
    try {
      const bytes = await generateBusinessDocumentPdf(toPdfInput(props))
      const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' })
      setPdfUrl(URL.createObjectURL(blob))
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : 'The PDF could not be opened. Please try again.',
      )
    } finally {
      setBusy(false)
    }
  }

  function closePdf() {
    setPdfUrl('')
  }

  return (
    <>
      <button
        className="portal-view-pdf"
        disabled={busy}
        onClick={() => void viewPdf()}
        type="button"
      >
        {busy ? <LoaderCircle className="portal-spin" size={18} /> : <FileText size={18} />}
        {busy ? 'Preparing PDF…' : `View ${props.kind} PDF`}
      </button>
      {error && <p className="portal-pdf-error" role="alert">{error}</p>}

      {pdfUrl && (
        <div
          className="portal-modal portal-pdf-backdrop"
          onClick={(event) => {
            if (event.currentTarget === event.target) closePdf()
          }}
          role="presentation"
        >
          <section
            aria-label={`${number} PDF preview`}
            aria-modal="true"
            className="portal-pdf-modal"
            role="dialog"
          >
            <header>
              <div>
                <p>CUSTOMER DOCUMENT</p>
                <h2>{number} PDF</h2>
              </div>
              <button aria-label="Close PDF" onClick={closePdf} type="button">
                <X size={20} />
              </button>
            </header>
            <iframe src={pdfUrl} title={`${number} PDF`} />
            <footer>
              <span>If the preview does not appear on your phone, open or save the PDF.</span>
              <div>
                <a href={pdfUrl} rel="noreferrer" target="_blank">
                  <ExternalLink size={17} /> Open full PDF
                </a>
                <a download={fileName} href={pdfUrl}>
                  <Download size={17} /> Save PDF
                </a>
              </div>
            </footer>
          </section>
        </div>
      )}
    </>
  )
}
