import { useEffect, useMemo, useState } from 'react'
import { Download, Eye, FileText, Printer, Search, Share2, Trash2 } from 'lucide-react'

import { deleteDocumentRecord, loadDocumentArchive, loadDocumentPdf } from '../data/documentArchiveStore'
import { actOnDocument } from '../services/documentPdf'
import { isNativePlatform, NativeDocumentManager } from '../services/nativeDocumentManager'
import type { BusinessDocumentRecord } from '../types/BusinessDocument'

type Action = 'preview' | 'save' | 'share' | 'print'

export default function DocumentsArchive() {
  const [records, setRecords] = useState<BusinessDocumentRecord[]>(loadDocumentArchive)
  const [search, setSearch] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [message, setMessage] = useState('')

  useEffect(() => {
    const refresh = () => setRecords(loadDocumentArchive())
    window.addEventListener('focus', refresh)
    return () => window.removeEventListener('focus', refresh)
  }, [])

  const visibleRecords = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return records
    return records.filter((record) => `${record.kind} ${record.number} ${record.customerName} ${record.fileName}`.toLowerCase().includes(query))
  }, [records, search])

  async function runAction(record: BusinessDocumentRecord, action: Action) {
    setBusy(`${record.id}-${action}`)
    setMessage('')
    try {
      const blob = await loadDocumentPdf(record.id)
      if (!blob) throw new Error('This PDF is no longer stored on this device. Generate it again from the document.')
      await actOnDocument(record, blob, action)
      setMessage(action === 'save' ? 'PDF saved to Downloads.' : 'PDF ready.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'The PDF action could not be completed. Please try again.')
    } finally {
      setBusy(null)
    }
  }

  async function remove(record: BusinessDocumentRecord) {
    if (!window.confirm(`Delete ${record.fileName} from the PDF archive?`)) return
    setBusy(`${record.id}-delete`)
    try {
      if (isNativePlatform() && record.nativePath) {
        await NativeDocumentManager.deletePdf({ path: record.nativePath }).catch(() => undefined)
      }
      await deleteDocumentRecord(record.id)
      setRecords(loadDocumentArchive())
      setMessage('Archived PDF deleted.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="feature-page document-archive-page">
      <header className="page-heading">
        <div><span className="eyebrow">PDF DOCUMENTS</span><h1>Document archive</h1><p>Every generated estimate and invoice PDF, ready to open, save, send, or print.</p></div>
        <div className="metric-card"><strong>{records.length}</strong><span>PDFs stored</span></div>
      </header>

      <label className="search-field">
        <Search aria-hidden="true" size={20} />
        <input aria-label="Search PDF archive" onChange={(event) => setSearch(event.target.value)} placeholder="Search number, customer, or document type..." value={search} />
      </label>
      {message && <div className="status-message" role="status">{message}</div>}

      <div className="archive-grid">
        {visibleRecords.map((record) => (
          <article className="archive-card" key={record.id}>
            <div className="archive-card-icon"><FileText aria-hidden="true" /></div>
            <div className="archive-card-copy">
              <span className="eyebrow">{record.kind.toUpperCase()}</span>
              <h2>{record.number}</h2>
              <p>{record.customerName}</p>
              <small>{new Date(record.createdAt).toLocaleString()}</small>
            </div>
            <div className="archive-actions" aria-label={`Actions for ${record.number}`}>
              <button disabled={Boolean(busy)} onClick={() => runAction(record, 'preview')} title="Preview PDF" type="button"><Eye /><span>Preview</span></button>
              <button disabled={Boolean(busy)} onClick={() => runAction(record, 'save')} title="Save PDF" type="button"><Download /><span>Save</span></button>
              <button disabled={Boolean(busy)} onClick={() => runAction(record, 'share')} title="Share PDF" type="button"><Share2 /><span>Send</span></button>
              <button disabled={Boolean(busy)} onClick={() => runAction(record, 'print')} title="Print PDF" type="button"><Printer /><span>Print</span></button>
              <button className="danger-action" disabled={Boolean(busy)} onClick={() => remove(record)} title="Delete PDF" type="button"><Trash2 /><span>Delete</span></button>
            </div>
          </article>
        ))}
        {!visibleRecords.length && <div className="empty-state"><FileText aria-hidden="true" size={44} /><h2>{records.length ? 'No matching PDFs' : 'No PDFs generated yet'}</h2><p>Use the PDF button on an estimate or invoice. Your document will be saved here automatically.</p></div>}
      </div>
    </div>
  )
}
