import type { SupabaseClient } from '@supabase/supabase-js'

import {
  DATA_REFRESHED_EVENT,
  queueCollectionSync,
  SYNC_REQUESTED_EVENT,
} from '../../cloud/syncQueue'
import type {
  BusinessPhoto,
  PhotoCategory,
} from '../types/BusinessPhoto'
import {
  deletePendingPhotoBlob,
  loadPendingPhotoBlob,
  savePendingPhotoBlob,
} from './photoBlobStore'

const PHOTOS_STORAGE_KEY = 'rabbits-foot-photos'
const PHOTO_DELETE_QUEUE_KEY = 'rabbits-foot-photo-delete-queue'
const PHOTO_BUCKET = 'business-photos'
const MAXIMUM_PHOTO_SIZE = 10 * 1024 * 1024
const ALLOWED_PHOTO_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/avif',
  'image/heic',
  'image/heif',
])

const photoCategories: PhotoCategory[] = [
  'before',
  'progress',
  'after',
  'receipt',
  'other',
]

function isBusinessPhoto(value: unknown): value is BusinessPhoto {
  if (!value || typeof value !== 'object') return false

  const photo = value as Partial<BusinessPhoto>

  return (
    typeof photo.id === 'string' &&
    (photo.customerId === null || typeof photo.customerId === 'string') &&
    typeof photo.jobName === 'string' &&
    typeof photo.category === 'string' &&
    photoCategories.includes(photo.category as PhotoCategory) &&
    typeof photo.caption === 'string' &&
    typeof photo.fileName === 'string' &&
    typeof photo.mimeType === 'string' &&
    typeof photo.fileSize === 'number' &&
    typeof photo.storagePath === 'string' &&
    typeof photo.uploadStatus === 'string' &&
    ['queued', 'uploaded', 'error'].includes(photo.uploadStatus) &&
    typeof photo.capturedAt === 'string' &&
    typeof photo.createdAt === 'string' &&
    typeof photo.updatedAt === 'string'
  )
}

function readJson<T>(key: string, fallback: T): T {
  try {
    const value = localStorage.getItem(key)
    return value ? (JSON.parse(value) as T) : fallback
  } catch {
    return fallback
  }
}

function createId() {
  return typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function sanitizeFilename(filename: string) {
  return (
    filename
      .replace(/[^a-zA-Z0-9._-]/g, '-')
      .replace(/-+/g, '-')
      .slice(0, 120) || 'project-photo'
  )
}

export function loadPhotos(): BusinessPhoto[] {
  return readJson<unknown[]>(PHOTOS_STORAGE_KEY, [])
    .filter(isBusinessPhoto)
    .sort(
      (firstPhoto, secondPhoto) =>
        new Date(secondPhoto.capturedAt).getTime() -
        new Date(firstPhoto.capturedAt).getTime(),
    )
}

export function savePhotos(photos: BusinessPhoto[]) {
  localStorage.setItem(PHOTOS_STORAGE_KEY, JSON.stringify(photos))
  queueCollectionSync(
    'photo',
    photos.filter((photo) => photo.uploadStatus === 'uploaded'),
  )
}

export async function queuePhotoFiles(
  files: File[],
  details: {
    customerId: string | null
    jobName: string
    category: PhotoCategory
    caption: string
    capturedAt: string
  },
) {
  const invalidFile = files.find(
    (file) =>
      !ALLOWED_PHOTO_TYPES.has(file.type) ||
      file.size > MAXIMUM_PHOTO_SIZE,
  )

  if (invalidFile) {
    throw new Error(
      'Photos must be JPG, PNG, WebP, AVIF, HEIC, or HEIF and no larger than 10 MB.',
    )
  }

  const createdAt = new Date().toISOString()
  const newPhotos: BusinessPhoto[] = []

  for (const file of files) {
    const id = createId()

    await savePendingPhotoBlob(id, file)
    newPhotos.push({
      id,
      customerId: details.customerId,
      jobName: details.jobName.trim(),
      category: details.category,
      caption: details.caption.trim(),
      fileName: file.name,
      mimeType: file.type || 'application/octet-stream',
      fileSize: file.size,
      storagePath: '',
      uploadStatus: 'queued',
      capturedAt: details.capturedAt,
      createdAt,
      updatedAt: createdAt,
    })
  }

  savePhotos([...newPhotos, ...loadPhotos()])
  window.dispatchEvent(new Event(DATA_REFRESHED_EVENT))
  window.dispatchEvent(new Event(SYNC_REQUESTED_EVENT))

  return newPhotos
}

export async function synchronizePendingPhotos(
  client: SupabaseClient,
  organizationId: string,
) {
  const deleteQueue = readJson<string[]>(PHOTO_DELETE_QUEUE_KEY, [])

  if (deleteQueue.length > 0) {
    const { error: deleteError } = await client.storage
      .from(PHOTO_BUCKET)
      .remove(deleteQueue)

    if (deleteError) throw deleteError
    localStorage.setItem(PHOTO_DELETE_QUEUE_KEY, '[]')
  }

  const photos = loadPhotos()
  let hasChanges = false
  const nextPhotos: BusinessPhoto[] = []

  for (const photo of photos) {
    if (photo.uploadStatus === 'uploaded') {
      nextPhotos.push(photo)
      continue
    }

    const pendingBlob = await loadPendingPhotoBlob(photo.id)

    if (!pendingBlob) {
      nextPhotos.push({ ...photo, uploadStatus: 'error' })
      hasChanges = true
      continue
    }

    const storagePath = `${organizationId}/${photo.id}/${sanitizeFilename(
      photo.fileName,
    )}`
    const { error: uploadError } = await client.storage
      .from(PHOTO_BUCKET)
      .upload(storagePath, pendingBlob, {
        contentType: photo.mimeType,
        cacheControl: '3600',
        upsert: false,
      })

    if (uploadError) {
      nextPhotos.push({ ...photo, uploadStatus: 'error' })
      hasChanges = true
      continue
    }

    await deletePendingPhotoBlob(photo.id)
    nextPhotos.push({
      ...photo,
      storagePath,
      uploadStatus: 'uploaded',
      updatedAt: new Date().toISOString(),
    })
    hasChanges = true
  }

  if (hasChanges) {
    savePhotos(nextPhotos)
    window.dispatchEvent(new Event(DATA_REFRESHED_EVENT))
  }
}

export async function getPhotoUrl(
  client: SupabaseClient | null,
  photo: BusinessPhoto,
) {
  if (photo.uploadStatus !== 'uploaded') {
    const blob = await loadPendingPhotoBlob(photo.id)
    return blob ? URL.createObjectURL(blob) : null
  }

  if (!client || !photo.storagePath) return null

  const { data, error } = await client.storage
    .from(PHOTO_BUCKET)
    .createSignedUrl(photo.storagePath, 60 * 60)

  if (error) throw error
  return data.signedUrl
}

export async function deletePhoto(photo: BusinessPhoto) {
  await deletePendingPhotoBlob(photo.id)

  if (photo.storagePath) {
    const deleteQueue = readJson<string[]>(PHOTO_DELETE_QUEUE_KEY, [])
    localStorage.setItem(
      PHOTO_DELETE_QUEUE_KEY,
      JSON.stringify(Array.from(new Set([...deleteQueue, photo.storagePath]))),
    )
  }

  savePhotos(loadPhotos().filter((currentPhoto) => currentPhoto.id !== photo.id))
  window.dispatchEvent(new Event(DATA_REFRESHED_EVENT))
  window.dispatchEvent(new Event(SYNC_REQUESTED_EVENT))
}

export function retryPhotoUpload(photoId: string) {
  const now = new Date().toISOString()
  savePhotos(
    loadPhotos().map((photo) =>
      photo.id === photoId
        ? { ...photo, uploadStatus: 'queued', updatedAt: now }
        : photo,
    ),
  )
  window.dispatchEvent(new Event(DATA_REFRESHED_EVENT))
  window.dispatchEvent(new Event(SYNC_REQUESTED_EVENT))
}
