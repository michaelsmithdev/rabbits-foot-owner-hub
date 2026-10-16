import { Camera, CameraDirection, EncodingType } from '@capacitor/camera'
import { Capacitor } from '@capacitor/core'

type CameraError = Error & { code?: string }

function extensionFor(format: string | undefined) {
  const normalized = format?.toLowerCase()
  if (normalized === 'png') return 'png'
  return 'jpg'
}

function mimeTypeFor(format: string | undefined, fallback: string) {
  if (fallback.startsWith('image/')) return fallback
  return extensionFor(format) === 'png' ? 'image/png' : 'image/jpeg'
}

export function hasNativeReceiptCamera() {
  return Capacitor.isNativePlatform()
}

export async function takeNativeReceiptPhoto(): Promise<File | null> {
  try {
    const result = await Camera.takePhoto({
      quality: 92,
      targetWidth: 1800,
      targetHeight: 2400,
      correctOrientation: true,
      encodingType: EncodingType.JPEG,
      saveToGallery: false,
      cameraDirection: CameraDirection.Rear,
      editable: 'no',
      includeMetadata: true,
    })
    const readablePath = result.webPath ?? (result.uri ? Capacitor.convertFileSrc(result.uri) : '')

    if (!readablePath) {
      throw new Error('The camera did not return a readable receipt photo.')
    }

    const response = await fetch(readablePath)
    if (!response.ok) {
      throw new Error('The captured receipt photo could not be opened.')
    }

    const blob = await response.blob()
    const extension = extensionFor(result.metadata?.format)
    return new File([blob], `receipt-${Date.now()}.${extension}`, {
      type: mimeTypeFor(result.metadata?.format, blob.type),
      lastModified: Date.now(),
    })
  } catch (error) {
    const cameraError = error as CameraError
    if (cameraError.code === 'OS-PLUG-CAMR-0006') return null
    if (cameraError.code === 'OS-PLUG-CAMR-0003') {
      throw new Error('Camera access is blocked. Allow camera access for Owner Hub in Android settings and try again.', { cause: error })
    }
    if (cameraError.code === 'OS-PLUG-CAMR-0007') {
      throw new Error('No camera is available on this device. Use Choose image instead.', { cause: error })
    }
    throw new Error(cameraError.message || 'The camera could not take a receipt photo.', { cause: error })
  }
}
