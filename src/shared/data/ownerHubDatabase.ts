export const OWNER_HUB_DATABASE_NAME = 'rabbits-foot-owner-hub'
export const OWNER_HUB_DATABASE_VERSION = 2
export const DOCUMENT_PDF_STORE_NAME = 'document-pdfs'
export const PENDING_PHOTO_STORE_NAME = 'pending-photo-files'

const requiredStoreNames = [
  DOCUMENT_PDF_STORE_NAME,
  PENDING_PHOTO_STORE_NAME,
] as const

export function openOwnerHubDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(
      OWNER_HUB_DATABASE_NAME,
      OWNER_HUB_DATABASE_VERSION,
    )

    request.onupgradeneeded = () => {
      const database = request.result

      for (const storeName of requiredStoreNames) {
        if (!database.objectStoreNames.contains(storeName)) {
          database.createObjectStore(storeName)
        }
      }
    }

    request.onsuccess = () => {
      const database = request.result
      const missingStore = requiredStoreNames.find(
        (storeName) => !database.objectStoreNames.contains(storeName),
      )

      if (missingStore) {
        database.close()
        reject(new Error(`Owner Hub storage is missing ${missingStore}.`))
        return
      }

      resolve(database)
    }
    request.onerror = () => reject(request.error)
  })
}
