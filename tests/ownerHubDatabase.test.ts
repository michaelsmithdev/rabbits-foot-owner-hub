import assert from 'node:assert/strict'
import test from 'node:test'

import { indexedDB as fakeIndexedDb } from 'fake-indexeddb'

import {
  DOCUMENT_PDF_STORE_NAME,
  openOwnerHubDatabase,
  OWNER_HUB_DATABASE_NAME,
  PENDING_PHOTO_STORE_NAME,
} from '../src/shared/data/ownerHubDatabase.ts'

Object.defineProperty(globalThis, 'indexedDB', {
  configurable: true,
  value: fakeIndexedDb,
})

function deleteDatabase() {
  return new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(OWNER_HUB_DATABASE_NAME)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
  })
}

function createLegacyDocumentOnlyDatabase() {
  return new Promise<void>((resolve, reject) => {
    const request = indexedDB.open(OWNER_HUB_DATABASE_NAME, 1)
    request.onupgradeneeded = () => {
      request.result.createObjectStore(DOCUMENT_PDF_STORE_NAME)
    }
    request.onsuccess = () => {
      request.result.close()
      resolve()
    }
    request.onerror = () => reject(request.error)
  })
}

test('version 2 repairs a legacy database that is missing the receipt photo store', async () => {
  await deleteDatabase()
  await createLegacyDocumentOnlyDatabase()

  const receipt = new Blob(['receipt-image'], { type: 'image/jpeg' })
  const database = await openOwnerHubDatabase()
  assert.equal(database.version, 2)
  assert.equal(database.objectStoreNames.contains(DOCUMENT_PDF_STORE_NAME), true)
  assert.equal(database.objectStoreNames.contains(PENDING_PHOTO_STORE_NAME), true)

  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(PENDING_PHOTO_STORE_NAME, 'readwrite')
    transaction.objectStore(PENDING_PHOTO_STORE_NAME).put(receipt, 'receipt-1')
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)
  })

  const restoredReceipt = await new Promise<Blob | undefined>((resolve, reject) => {
    const request = database
      .transaction(PENDING_PHOTO_STORE_NAME)
      .objectStore(PENDING_PHOTO_STORE_NAME)
      .get('receipt-1')
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
  database.close()

  assert.ok(restoredReceipt instanceof Blob)
  assert.equal(restoredReceipt.type, 'image/jpeg')
  assert.equal(await restoredReceipt.text(), 'receipt-image')

  await deleteDatabase()
})
