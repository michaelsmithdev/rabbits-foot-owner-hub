const DATABASE_NAME = 'rabbits-foot-owner-hub'
const DATABASE_VERSION = 1
const PHOTO_STORE_NAME = 'pending-photo-files'

function openPhotoDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION)

    request.onupgradeneeded = () => {
      const database = request.result

      if (!database.objectStoreNames.contains(PHOTO_STORE_NAME)) {
        database.createObjectStore(PHOTO_STORE_NAME)
      }
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function runPhotoStoreOperation<T>(
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const database = await openPhotoDatabase()

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(PHOTO_STORE_NAME, mode)
    const request = operation(transaction.objectStore(PHOTO_STORE_NAME))

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
    transaction.oncomplete = () => database.close()
    transaction.onerror = () => reject(transaction.error)
  })
}

export function savePendingPhotoBlob(photoId: string, file: File) {
  return runPhotoStoreOperation('readwrite', (store) =>
    store.put(file, photoId),
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
