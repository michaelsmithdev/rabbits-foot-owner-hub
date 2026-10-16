import type { BusinessDocumentRecord } from '../types/BusinessDocument'
import {
  DOCUMENT_PDF_STORE_NAME,
  openOwnerHubDatabase,
} from '../../../shared/data/ownerHubDatabase'

const ARCHIVE_KEY = 'rabbits-foot-document-archive'

export function loadDocumentArchive(): BusinessDocumentRecord[] {
  try {
    const value = JSON.parse(localStorage.getItem(ARCHIVE_KEY) ?? '[]') as unknown
    return Array.isArray(value) ? (value as BusinessDocumentRecord[]) : []
  } catch {
    return []
  }
}

export function saveDocumentRecord(record: BusinessDocumentRecord) {
  const records = loadDocumentArchive()
  const next = [record, ...records.filter((item) => item.id !== record.id)]
  localStorage.setItem(ARCHIVE_KEY, JSON.stringify(next))
}

export function deleteDocumentRecord(id: string) {
  localStorage.setItem(
    ARCHIVE_KEY,
    JSON.stringify(loadDocumentArchive().filter((item) => item.id !== id)),
  )
  return openDatabase().then((database) => {
    const transaction = database.transaction(DOCUMENT_PDF_STORE_NAME, 'readwrite')
    transaction.objectStore(DOCUMENT_PDF_STORE_NAME).delete(id)
    transaction.oncomplete = () => database.close()
  })
}

function openDatabase(): Promise<IDBDatabase> {
  return openOwnerHubDatabase()
}

export async function saveDocumentPdf(id: string, bytes: Uint8Array) {
  const database = await openDatabase()
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(DOCUMENT_PDF_STORE_NAME, 'readwrite')
    transaction.objectStore(DOCUMENT_PDF_STORE_NAME).put(new Blob([bytes as BlobPart], { type: 'application/pdf' }), id)
    transaction.oncomplete = () => {
      database.close()
      resolve()
    }
    transaction.onerror = () => {
      database.close()
      reject(transaction.error)
    }
  })
}

export async function loadDocumentPdf(id: string): Promise<Blob | null> {
  const database = await openDatabase()
  return new Promise((resolve, reject) => {
    const request = database.transaction(DOCUMENT_PDF_STORE_NAME).objectStore(DOCUMENT_PDF_STORE_NAME).get(id)
    request.onsuccess = () => {
      database.close()
      resolve(request.result instanceof Blob ? request.result : null)
    }
    request.onerror = () => {
      database.close()
      reject(request.error)
    }
  })
}
