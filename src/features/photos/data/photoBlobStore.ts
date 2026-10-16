import {
  openOwnerHubDatabase,
  PENDING_PHOTO_STORE_NAME,
} from '../../../shared/data/ownerHubDatabase'

function openPhotoDatabase(): Promise<IDBDatabase> {
  return openOwnerHubDatabase()
}

async function runPhotoStoreOperation<T>(
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const database = await openPhotoDatabase()

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(PENDING_PHOTO_STORE_NAME, mode)
    const request = operation(transaction.objectStore(PENDING_PHOTO_STORE_NAME))

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
    transaction.oncomplete = () => database.close()
    transaction.onerror = () => reject(transaction.error)
  })
}

export function savePendingPhotoBlob(photoId: string, blob: Blob) {
  return runPhotoStoreOperation('readwrite', (store) =>
    store.put(blob, photoId),
  )
}

export function loadPendingPhotoBlob(photoId: string) {
  return runPhotoStoreOperation<Blob | undefined>('readonly', (store) =>
    store.get(photoId),
  )
}

export function deletePendingPhotoBlob(photoId: string) {
  return runPhotoStoreOperation('readwrite', (store) =>
    store.delete(photoId),
  )
}
