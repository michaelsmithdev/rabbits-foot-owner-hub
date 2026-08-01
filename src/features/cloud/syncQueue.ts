export type CloudRecordType =
  | 'customer'
  | 'estimate'
  | 'invoice'
  | 'settings'
  | 'photo'

export type CloudRecord = Record<string, unknown> & {
  id: string
}

export type QueuedRecordChange = {
  recordType: CloudRecordType
  recordId: string
  payload: CloudRecord | null
  isDeleted: boolean
  clientUpdatedAt: string
}

type SyncMetadata = Record<
  string,
  {
    clientUpdatedAt: string
    isDeleted: boolean
    fingerprint: string
  }
>

const QUEUE_STORAGE_KEY = 'rabbits-foot-cloud-sync-queue'
const METADATA_STORAGE_KEY = 'rabbits-foot-cloud-sync-metadata'

export const SYNC_REQUESTED_EVENT = 'ownerhub:sync-requested'
export const DATA_REFRESHED_EVENT = 'ownerhub:data-refreshed'

const storageKeys: Record<CloudRecordType, string> = {
  customer: 'rabbits-foot-customers',
  estimate: 'rabbits-foot-estimates',
  invoice: 'rabbits-foot-invoices',
  settings: 'rabbits-foot-business-settings',
  photo: 'rabbits-foot-photos',
}

function getRecordKey(recordType: CloudRecordType, recordId: string) {
  return `${recordType}:${recordId}`
}

function readJson<T>(storageKey: string, fallback: T): T {
  try {
    const storedValue = localStorage.getItem(storageKey)
    return storedValue ? (JSON.parse(storedValue) as T) : fallback
  } catch {
    return fallback
  }
}

function saveMetadata(metadata: SyncMetadata) {
  localStorage.setItem(METADATA_STORAGE_KEY, JSON.stringify(metadata))
}

export function loadSyncQueue(): QueuedRecordChange[] {
  return readJson<QueuedRecordChange[]>(QUEUE_STORAGE_KEY, [])
}

export function clearSyncQueue(changes: QueuedRecordChange[]) {
  if (changes.length === 0) return

  const completedKeys = new Set(
    changes.map((change) =>
      getRecordKey(change.recordType, change.recordId),
    ),
  )

  const remainingChanges = loadSyncQueue().filter(
    (change) =>
      !completedKeys.has(
        getRecordKey(change.recordType, change.recordId),
      ),
  )

  localStorage.setItem(
    QUEUE_STORAGE_KEY,
    JSON.stringify(remainingChanges),
  )
}

export function queueCollectionSync<T extends { id: string }>(
  recordType: CloudRecordType,
  records: T[],
) {
  const timestamp = new Date().toISOString()
  const metadata = readJson<SyncMetadata>(METADATA_STORAGE_KEY, {})
  const queuedChanges = loadSyncQueue()
  const queuedByKey = new Map(
    queuedChanges.map((change) => [
      getRecordKey(change.recordType, change.recordId),
      change,
    ]),
  )
  const nextRecordIds = new Set(records.map((record) => record.id))
  let hasQueuedChanges = false

  records.forEach((record) => {
    const recordKey = getRecordKey(recordType, record.id)
    const existingMetadata = metadata[recordKey]
    const fingerprint = JSON.stringify(record)

    if (
      existingMetadata &&
      !existingMetadata.isDeleted &&
      existingMetadata.fingerprint === fingerprint
    ) {
      return
    }

    const change: QueuedRecordChange = {
      recordType,
      recordId: record.id,
      payload: record as unknown as CloudRecord,
      isDeleted: false,
      clientUpdatedAt: timestamp,
    }

    metadata[recordKey] = {
      clientUpdatedAt: timestamp,
      isDeleted: false,
      fingerprint,
    }
    queuedByKey.set(recordKey, change)
    hasQueuedChanges = true
  })

  Object.entries(metadata).forEach(([recordKey, recordMetadata]) => {
    const [metadataType, ...recordIdParts] = recordKey.split(':')

    if (metadataType !== recordType || recordMetadata.isDeleted) return

    const recordId = recordIdParts.join(':')

    if (nextRecordIds.has(recordId)) return

    const change: QueuedRecordChange = {
      recordType,
      recordId,
      payload: null,
      isDeleted: true,
      clientUpdatedAt: timestamp,
    }

    metadata[recordKey] = {
      clientUpdatedAt: timestamp,
      isDeleted: true,
      fingerprint: '',
    }
    queuedByKey.set(recordKey, change)
    hasQueuedChanges = true
  })

  if (!hasQueuedChanges) return

  saveMetadata(metadata)
  localStorage.setItem(
    QUEUE_STORAGE_KEY,
    JSON.stringify(Array.from(queuedByKey.values())),
  )

  window.dispatchEvent(new Event(SYNC_REQUESTED_EVENT))
}

export function updateQueuedRecord<T extends { id: string }>(
  recordType: CloudRecordType,
  record: T,
) {
  const timestamp = new Date().toISOString()
  const recordKey = getRecordKey(recordType, record.id)
  const metadata = readJson<SyncMetadata>(METADATA_STORAGE_KEY, {})
  const queuedByKey = new Map(
    loadSyncQueue().map((change) => [
      getRecordKey(change.recordType, change.recordId),
      change,
    ]),
  )

  metadata[recordKey] = {
    clientUpdatedAt: timestamp,
    isDeleted: false,
    fingerprint: JSON.stringify(record),
  }
  queuedByKey.set(recordKey, {
    recordType,
    recordId: record.id,
    payload: record as unknown as CloudRecord,
    isDeleted: false,
    clientUpdatedAt: timestamp,
  })

  saveMetadata(metadata)
  localStorage.setItem(
    QUEUE_STORAGE_KEY,
    JSON.stringify(Array.from(queuedByKey.values())),
  )
  window.dispatchEvent(new Event(SYNC_REQUESTED_EVENT))
}

export function applyRemoteRecords(
  records: Array<{
    record_type: CloudRecordType
    record_id: string
    payload: CloudRecord | null
    is_deleted: boolean
    client_updated_at: string
  }>,
) {
  const metadata = readJson<SyncMetadata>(METADATA_STORAGE_KEY, {})
  let hasDataChanges = false

  ;([
    'customer',
    'estimate',
    'invoice',
    'settings',
    'photo',
  ] as CloudRecordType[]).forEach(
    (recordType) => {
      const localRecords = readJson<CloudRecord[]>(storageKeys[recordType], [])
      const recordsById = new Map(
        localRecords.map((record) => [record.id, record]),
      )

      records
        .filter((record) => record.record_type === recordType)
        .forEach((record) => {
          const recordKey = getRecordKey(recordType, record.record_id)
          const localMetadata = metadata[recordKey]

          if (
            localMetadata &&
            localMetadata.clientUpdatedAt > record.client_updated_at
          ) {
            return
          }

          if (record.is_deleted || !record.payload) {
            recordsById.delete(record.record_id)
          } else {
            recordsById.set(record.record_id, record.payload)
          }

          metadata[recordKey] = {
            clientUpdatedAt: record.client_updated_at,
            isDeleted: record.is_deleted,
            fingerprint: record.payload
              ? JSON.stringify(record.payload)
              : '',
          }
        })

      const serializedRecords = JSON.stringify(Array.from(recordsById.values()))

      if (localStorage.getItem(storageKeys[recordType]) !== serializedRecords) {
        localStorage.setItem(storageKeys[recordType], serializedRecords)
        hasDataChanges = true
      }
    },
  )

  saveMetadata(metadata)

  if (hasDataChanges) {
    window.dispatchEvent(new Event(DATA_REFRESHED_EVENT))
  }
}
