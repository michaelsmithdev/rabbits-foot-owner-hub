export type PhotoCategory =
  | 'before'
  | 'progress'
  | 'after'
  | 'receipt'
  | 'other'

export type PhotoUploadStatus = 'queued' | 'uploaded' | 'error'

export interface BusinessPhoto {
  id: string
  customerId: string | null
  jobName: string
  category: PhotoCategory
  caption: string
  fileName: string
  mimeType: string
  fileSize: number
  storagePath: string
  uploadStatus: PhotoUploadStatus
  capturedAt: string
  createdAt: string
  updatedAt: string
}
