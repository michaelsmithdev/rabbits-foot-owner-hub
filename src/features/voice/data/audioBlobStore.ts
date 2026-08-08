const DATABASE_NAME = 'rabbits-foot-owner-hub-audio'
const DATABASE_VERSION = 1
const AUDIO_STORE_NAME = 'voice-recordings'

function openAudioDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(AUDIO_STORE_NAME)) {
        request.result.createObjectStore(AUDIO_STORE_NAME)
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function runOperation<T>(
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const database = await openAudioDatabase()

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(AUDIO_STORE_NAME, mode)
    const request = operation(transaction.objectStore(AUDIO_STORE_NAME))
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
    transaction.oncomplete = () => database.close()
    transaction.onerror = () => reject(transaction.error)
  })
}

export function saveAudioBlob(id: string, blob: Blob) {
  return runOperation('readwrite', (store) => store.put(blob, id))
}

export function loadAudioBlob(id: string) {
  return runOperation<Blob | undefined>('readonly', (store) => store.get(id))
}

export function deleteAudioBlob(id: string) {
  return runOperation('readwrite', (store) => store.delete(id))
}
