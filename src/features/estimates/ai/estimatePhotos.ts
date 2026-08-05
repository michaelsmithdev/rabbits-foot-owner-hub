export const MAX_AI_ESTIMATE_PHOTOS = 10

const MAX_SOURCE_SIZE_BYTES = 15 * 1024 * 1024
const TARGET_PHOTO_SIZE_BYTES = 220 * 1024
const ACCEPTED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])

export type PreparedEstimatePhoto = {
  id: string
  file: File
  dataUrl: string
  photoId?: string
}

function createId(): string {
  return typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file)
    const image = new Image()

    image.onload = () => {
      URL.revokeObjectURL(objectUrl)
      resolve(image)
    }
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl)
      reject(new Error(`Could not read ${file.name}. Choose a JPG, PNG, or WebP image.`))
    }
    image.src = objectUrl
  })
}

function canvasBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob)
        else reject(new Error('The photo could not be prepared.'))
      },
      'image/jpeg',
      quality,
    )
  })
}

function dataUrlFromBlob(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('The photo could not be read.'))
    reader.readAsDataURL(blob)
  })
}

async function compressPhoto(file: File): Promise<Blob> {
  const image = await loadImage(file)
  let maxDimension = 1280
  let bestBlob: Blob | null = null

  for (let sizeAttempt = 0; sizeAttempt < 6; sizeAttempt += 1) {
    const scale = Math.min(1, maxDimension / Math.max(image.width, image.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(image.width * scale))
    canvas.height = Math.max(1, Math.round(image.height * scale))
    const context = canvas.getContext('2d')

    if (!context) throw new Error('Photo processing is unavailable on this device.')
    context.drawImage(image, 0, 0, canvas.width, canvas.height)

    for (const quality of [0.82, 0.72, 0.62, 0.52, 0.44]) {
      bestBlob = await canvasBlob(canvas, quality)
      if (bestBlob.size <= TARGET_PHOTO_SIZE_BYTES) return bestBlob
    }

    maxDimension = Math.round(maxDimension * 0.78)
  }

  if (!bestBlob || bestBlob.size > TARGET_PHOTO_SIZE_BYTES) {
    throw new Error(`${file.name} could not be reduced to a safe upload size.`)
  }
  return bestBlob
}

export async function prepareEstimatePhoto(file: File): Promise<PreparedEstimatePhoto> {
  if (!ACCEPTED_TYPES.has(file.type)) {
    throw new Error('Estimate photos must be JPG, PNG, or WebP files.')
  }
  if (file.size > MAX_SOURCE_SIZE_BYTES) {
    throw new Error(`${file.name} is larger than 15 MB.`)
  }

  const blob = await compressPhoto(file)
  const baseName = file.name.replace(/\.[^.]+$/, '').slice(0, 80) || 'job-photo'
  const preparedFile = new File([blob], `${baseName}.jpg`, {
    type: 'image/jpeg',
    lastModified: Date.now(),
  })

  return {
    id: createId(),
    file: preparedFile,
    dataUrl: await dataUrlFromBlob(blob),
  }
}
