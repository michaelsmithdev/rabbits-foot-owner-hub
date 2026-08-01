import {
  Camera,
  Cloud,
  Image as ImageIcon,
  Images,
  RefreshCw,
  Search,
  Trash2,
  Upload,
  X,
} from 'lucide-react'
import {
  type ChangeEvent,
  type FormEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'

import { cloudClient } from '../../features/cloud/cloudClient'
import { useCloudSync } from '../../features/cloud/cloudSyncContext'
import { DATA_REFRESHED_EVENT } from '../../features/cloud/syncQueue'
import { loadCustomers } from '../../features/customers/data/customerStore'
import {
  deletePhoto,
  getPhotoUrl,
  loadPhotos,
  queuePhotoFiles,
  retryPhotoUpload,
} from '../../features/photos/data/photoStore'
import type {
  BusinessPhoto,
  PhotoCategory,
} from '../../features/photos/types/BusinessPhoto'
import './Photos.css'

const categoryLabels: Record<PhotoCategory, string> = {
  before: 'Before',
  progress: 'In progress',
  after: 'After',
  receipt: 'Receipt / material',
  other: 'Other',
}

function formatFileSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function getTodayDate() {
  const today = new Date()
  const year = today.getFullYear()
  const month = String(today.getMonth() + 1).padStart(2, '0')
  const day = String(today.getDate()).padStart(2, '0')

  return `${year}-${month}-${day}`
}

function Photos() {
  const customers = useMemo(() => loadCustomers(), [])
  const { status, syncNow } = useCloudSync()
  const [photos, setPhotos] = useState<BusinessPhoto[]>(loadPhotos)
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({})
  const [selectedPhotoId, setSelectedPhotoId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<'all' | PhotoCategory>('all')
  const [customerFilter, setCustomerFilter] = useState('all')
  const [customerId, setCustomerId] = useState('')
  const [jobName, setJobName] = useState('')
  const [category, setCategory] = useState<PhotoCategory>('before')
  const [caption, setCaption] = useState('')
  const [capturedAt, setCapturedAt] = useState(getTodayDate)
  const [files, setFiles] = useState<File[]>([])
  const [message, setMessage] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const galleryInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const refreshPhotos = () => setPhotos(loadPhotos())
    window.addEventListener(DATA_REFRESHED_EVENT, refreshPhotos)

    return () => {
      window.removeEventListener(DATA_REFRESHED_EVENT, refreshPhotos)
    }
  }, [])

  useEffect(() => {
    let isCurrent = true
    const createdBlobUrls: string[] = []

    async function loadPhotoUrls() {
      const entries = await Promise.all(
        photos.map(async (photo) => {
          try {
            const url = await getPhotoUrl(cloudClient, photo)
            if (url?.startsWith('blob:')) createdBlobUrls.push(url)
            return [photo.id, url] as const
          } catch {
            return [photo.id, null] as const
          }
        }),
      )

      if (isCurrent) {
        setPhotoUrls(
          Object.fromEntries(entries.filter((entry) => Boolean(entry[1]))) as Record<
            string,
            string
          >,
        )
      }
    }

    void loadPhotoUrls()

    return () => {
      isCurrent = false
      createdBlobUrls.forEach((url) => URL.revokeObjectURL(url))
    }
  }, [photos])

  const customerNames = useMemo(
    () =>
      new Map(
        customers.map((customer) => [
          customer.id,
          `${customer.firstName} ${customer.lastName}`.trim(),
        ]),
      ),
    [customers],
  )

  const visiblePhotos = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()

    return photos.filter((photo) => {
      if (categoryFilter !== 'all' && photo.category !== categoryFilter) return false
      if (customerFilter !== 'all' && photo.customerId !== customerFilter) return false
      if (!query) return true

      return [
        photo.caption,
        photo.jobName,
        photo.fileName,
        photo.customerId ? customerNames.get(photo.customerId) ?? '' : '',
      ].some((value) => value.toLowerCase().includes(query))
    })
  }, [categoryFilter, customerFilter, customerNames, photos, searchQuery])

  const selectedPhoto =
    photos.find((photo) => photo.id === selectedPhotoId) ?? null

  function selectFiles(event: ChangeEvent<HTMLInputElement>) {
    const selectedFiles = Array.from(event.target.files ?? [])
    setFiles(selectedFiles)
    setErrorMessage('')
    setMessage(
      selectedFiles.length > 0
        ? `${selectedFiles.length} ${selectedFiles.length === 1 ? 'photo' : 'photos'} ready to add.`
        : '',
    )
    event.target.value = ''
  }

  async function addPhotos(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (files.length === 0) {
      setErrorMessage('Choose at least one photo.')
      return
    }

    setIsSaving(true)
    setErrorMessage('')

    try {
      await queuePhotoFiles(files, {
        customerId: customerId || null,
        jobName,
        category,
        caption,
        capturedAt: new Date(`${capturedAt}T12:00:00`).toISOString(),
      })
      setPhotos(loadPhotos())
      setFiles([])
      setCaption('')
      setMessage(
        navigator.onLine
          ? 'Photos added. Private cloud upload has started.'
          : 'Photos saved on this device and queued for upload when you are online.',
      )
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'The photos could not be added.',
      )
    } finally {
      setIsSaving(false)
    }
  }

  async function removePhoto(photo: BusinessPhoto) {
    if (!window.confirm(`Delete ${photo.fileName}? This cannot be undone.`)) return

    await deletePhoto(photo)
    setSelectedPhotoId(null)
    setPhotos(loadPhotos())
    setMessage('Photo removed and the cloud deletion was queued.')
  }

  return (
    <section className="photos-page">
      <header className="photos-page-header">
        <div>
          <p className="eyebrow">PRIVATE MEDIA</p>
          <h1>Photos</h1>
          <p>Keep before, progress, after, receipt, and job photos organized in one place.</p>
        </div>
        <div className="photos-header-stat">
          <strong>{photos.length}</strong>
          <span>{photos.length === 1 ? 'photo stored' : 'photos stored'}</span>
        </div>
      </header>

      <form className="photo-upload-card" onSubmit={addPhotos}>
        <header>
          <span><Upload size={22} /></span>
          <div>
            <p className="eyebrow">ADD PHOTOS</p>
            <h2>Save jobsite pictures</h2>
            <p>Images stay private and are queued safely if your connection drops.</p>
          </div>
        </header>

        <div className="photo-upload-grid">
          <label>
            <span>Customer</span>
            <select onChange={(event) => setCustomerId(event.target.value)} value={customerId}>
              <option value="">General business photo</option>
              {customers.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.firstName} {customer.lastName}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Job or project</span>
            <input
              onChange={(event) => setJobName(event.target.value)}
              placeholder="Kitchen repair, deck work…"
              value={jobName}
            />
          </label>
          <label>
            <span>Photo category</span>
            <select onChange={(event) => setCategory(event.target.value as PhotoCategory)} value={category}>
              {Object.entries(categoryLabels).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </label>
          <label>
            <span>Date taken</span>
            <input onChange={(event) => setCapturedAt(event.target.value)} type="date" value={capturedAt} />
          </label>
          <label className="photo-caption-field">
            <span>Caption or note</span>
            <input
              onChange={(event) => setCaption(event.target.value)}
              placeholder="What should you remember about these photos?"
              value={caption}
            />
          </label>
        </div>

        <div className="photo-file-actions">
          <input
            accept="image/*"
            className="photo-hidden-input"
            multiple
            onChange={selectFiles}
            ref={galleryInputRef}
            type="file"
          />
          <input
            accept="image/*"
            capture="environment"
            className="photo-hidden-input"
            onChange={selectFiles}
            ref={cameraInputRef}
            type="file"
          />
          <button onClick={() => galleryInputRef.current?.click()} type="button">
            <Images size={18} /> Choose from gallery
          </button>
          <button onClick={() => cameraInputRef.current?.click()} type="button">
            <Camera size={18} /> Take a photo
          </button>
          <button className="photo-save-button" disabled={isSaving || files.length === 0} type="submit">
            <Cloud size={18} /> {isSaving ? 'Saving…' : `Save ${files.length || ''} ${files.length === 1 ? 'photo' : 'photos'}`}
          </button>
        </div>

        {message && <p className="photo-message" role="status">{message}</p>}
        {errorMessage && <p className="photo-error" role="alert">{errorMessage}</p>}
      </form>

      <section className="photo-library">
        <header className="photo-library-toolbar">
          <div className="photo-search">
            <Search size={19} />
            <input
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search customer, job, caption…"
              value={searchQuery}
            />
          </div>
          <select onChange={(event) => setCustomerFilter(event.target.value)} value={customerFilter}>
            <option value="all">All customers</option>
            {customers.map((customer) => (
              <option key={customer.id} value={customer.id}>
                {customer.firstName} {customer.lastName}
              </option>
            ))}
          </select>
          <select
            onChange={(event) => setCategoryFilter(event.target.value as 'all' | PhotoCategory)}
            value={categoryFilter}
          >
            <option value="all">All categories</option>
            {Object.entries(categoryLabels).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
          <button className="photo-sync-button" onClick={() => void syncNow()} type="button">
            <RefreshCw className={status === 'syncing' ? 'photo-spinning' : ''} size={17} /> Sync
          </button>
        </header>

        {visiblePhotos.length === 0 ? (
          <div className="photo-empty-state">
            <ImageIcon size={42} />
            <h2>{photos.length === 0 ? 'No photos stored yet' : 'No photos match these filters'}</h2>
            <p>{photos.length === 0 ? 'Add the first before or jobsite photo above.' : 'Try a different customer, category, or search.'}</p>
          </div>
        ) : (
          <div className="photo-grid">
            {visiblePhotos.map((photo) => (
              <article className="photo-card" key={photo.id}>
                <button className="photo-preview-button" onClick={() => setSelectedPhotoId(photo.id)} type="button">
                  {photoUrls[photo.id] ? (
                    <img alt={photo.caption || photo.fileName} src={photoUrls[photo.id]} />
                  ) : (
                    <span className="photo-preview-placeholder"><ImageIcon size={34} /></span>
                  )}
                </button>
                <div className="photo-card-body">
                  <div className="photo-card-labels">
                    <span className={`photo-category photo-category-${photo.category}`}>{categoryLabels[photo.category]}</span>
                    <span className={`photo-status photo-status-${photo.uploadStatus}`}>
                      {photo.uploadStatus === 'uploaded' ? 'Cloud saved' : photo.uploadStatus === 'queued' ? 'Queued' : 'Needs retry'}
                    </span>
                  </div>
                  <h3>{photo.caption || photo.jobName || photo.fileName}</h3>
                  <p>{photo.customerId ? customerNames.get(photo.customerId) ?? 'Customer' : 'General business'}</p>
                  <small>{photo.jobName || 'No job assigned'} · {formatFileSize(photo.fileSize)}</small>
                  <div className="photo-card-actions">
                    {photo.uploadStatus === 'error' && (
                      <button onClick={() => retryPhotoUpload(photo.id)} type="button"><RefreshCw size={15} /> Retry</button>
                    )}
                    <button className="photo-delete-button" onClick={() => void removePhoto(photo)} type="button">
                      <Trash2 size={15} /> Delete
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {selectedPhoto && (
        <div className="photo-lightbox" role="presentation" onClick={() => setSelectedPhotoId(null)}>
          <section aria-label="Photo details" onClick={(event) => event.stopPropagation()} role="dialog">
            <button aria-label="Close photo" className="photo-lightbox-close" onClick={() => setSelectedPhotoId(null)} type="button"><X size={22} /></button>
            {photoUrls[selectedPhoto.id] ? (
              <img alt={selectedPhoto.caption || selectedPhoto.fileName} src={photoUrls[selectedPhoto.id]} />
            ) : (
              <div className="photo-lightbox-placeholder"><ImageIcon size={52} /></div>
            )}
            <div className="photo-lightbox-copy">
              <span>{categoryLabels[selectedPhoto.category]}</span>
              <h2>{selectedPhoto.caption || selectedPhoto.jobName || selectedPhoto.fileName}</h2>
              <p>{selectedPhoto.customerId ? customerNames.get(selectedPhoto.customerId) : 'General business photo'}</p>
              <small>{new Date(selectedPhoto.capturedAt).toLocaleDateString()} · {selectedPhoto.fileName}</small>
            </div>
          </section>
        </div>
      )}
    </section>
  )
}

export default Photos
