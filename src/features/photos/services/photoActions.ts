import { Capacitor, registerPlugin } from '@capacitor/core'

import type { BusinessPhoto } from '../types/BusinessPhoto'

export type PhotoAction = 'download' | 'share' | 'print'

type NativeImageManagerPlugin = {
  exportImage(options: ImageActionOptions): Promise<{ uri: string }>
  shareImage(options: ImageActionOptions & { title: string }): Promise<void>
  printImage(options: ImageActionOptions & { title: string }): Promise<void>
}

type ImageActionOptions = {
  base64: string
  fileName: string
  mimeType: string
}

const NativeImageManager = registerPlugin<NativeImageManagerPlugin>('ImageManager')

function safeImageName(photo: BusinessPhoto) {
  return photo.fileName.trim() || `owner-hub-photo-${photo.id}.jpg`
}

function imageTitle(photo: BusinessPhoto) {
  return photo.caption.trim() || photo.jobName.trim() || safeImageName(photo)
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  anchor.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000)
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = String(reader.result)
      const separator = result.indexOf(',')
      if (separator < 0) {
        reject(new Error('The stored image could not be prepared.'))
        return
      }
      resolve(result.slice(separator + 1))
    }
    reader.onerror = () => reject(reader.error ?? new Error('The stored image could not be read.'))
    reader.readAsDataURL(blob)
  })
}

function printBlob(
  blob: Blob,
  title: string,
  preparedWindow?: Window | null,
) {
  const printWindow = preparedWindow ?? window.open('', '_blank')
  if (!printWindow) {
    throw new Error('Allow pop-ups for Owner Hub, then try printing again.')
  }

  const url = URL.createObjectURL(blob)
  const document = printWindow.document
  document.title = title
  document.body.replaceChildren()
  document.body.style.margin = '0'
  document.body.style.display = 'grid'
  document.body.style.placeItems = 'center'
  document.body.style.minHeight = '100vh'
  document.body.style.background = '#fff'

  const image = document.createElement('img')
  image.alt = title
  image.style.display = 'block'
  image.style.width = 'auto'
  image.style.height = 'auto'
  image.style.maxWidth = '100%'
  image.style.maxHeight = '100vh'
  image.style.objectFit = 'contain'
  image.onload = () => {
    printWindow.focus()
    printWindow.print()
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
  }
  image.onerror = () => {
    URL.revokeObjectURL(url)
    printWindow.close()
  }
  image.src = url
  document.body.append(image)
}

export function preparePhotoPrintWindow(action: PhotoAction) {
  return action === 'print' && !Capacitor.isNativePlatform()
    ? window.open('', '_blank')
    : undefined
}

export async function actOnPhoto(
  photo: BusinessPhoto,
  blob: Blob,
  action: PhotoAction,
  preparedWindow?: Window | null,
) {
  const fileName = safeImageName(photo)
  const title = imageTitle(photo)
  const mimeType = blob.type.startsWith('image/')
    ? blob.type
    : photo.mimeType.startsWith('image/')
      ? photo.mimeType
      : 'image/jpeg'

  if (Capacitor.isNativePlatform()) {
    const base64 = await blobToBase64(blob)
    const options = { base64, fileName, mimeType }
    if (action === 'download') return NativeImageManager.exportImage(options)
    if (action === 'share') return NativeImageManager.shareImage({ ...options, title })
    return NativeImageManager.printImage({ ...options, title })
  }

  if (action === 'download') return downloadBlob(blob, fileName)
  if (action === 'print') return printBlob(blob, title, preparedWindow)

  const file = new File([blob], fileName, { type: mimeType })
  if (navigator.share && (!navigator.canShare || navigator.canShare({ files: [file] }))) {
    return navigator.share({ files: [file], title })
  }
  throw new Error('Image sharing is not supported in this browser. Download the image instead.')
}
