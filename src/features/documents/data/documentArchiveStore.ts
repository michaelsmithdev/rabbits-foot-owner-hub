import type { BusinessDocumentRecord } from '../types/BusinessDocument'

const ARCHIVE_KEY = 'rabbits-foot-document-archive'
const DATABASE_NAME = 'rabbits-foot-owner-hub'
const STORE_NAME = 'document-pdfs'

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
    const transaction = database.transaction(STORE_NAME, 'readwrite')
    transaction.objectStore(STORE_NAME).delete(id)
  })
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, 1)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME)
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

export async function saveDocumentPdf(id: string, bytes: Uint8Array) {
  const database = await openDatabase()
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readwrite')
    transaction.objectStore(STORE_NAME).put(new Blob([bytes as BlobPart], { type: 'application/pdf' }), id)
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)
  })
}

export async function loadDocumentPdf(id: string): Promise<Blob | null> {
  const database = await openDatabase()
  return new Promise((resolve, reject) => {
    const request = database.transaction(STORE_NAME).objectStore(STORE_NAME).get(id)
    request.onsuccess = () => resolve(request.result instanceof Blob ? request.result : null)
    request.onerror = () => reject(request.error)
  })
}
