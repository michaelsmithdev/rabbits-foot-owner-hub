import type { VideoMetadata } from '../types'

function greatestCommonDivisor(a: number, b: number): number {
  return b === 0 ? a : greatestCommonDivisor(b, a % b)
}

function ratio(width: number, height: number): string {
  if (!width || !height) return 'Unknown'
  const divisor = greatestCommonDivisor(width, height)
  const simpleWidth = Math.round(width / divisor)
  const simpleHeight = Math.round(height / divisor)
  return simpleWidth > 40 || simpleHeight > 40
    ? `${(width / height).toFixed(2)}:1`
    : `${simpleWidth}:${simpleHeight}`
}

export function readVideoMetadata(file: File): Promise<VideoMetadata> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const video = document.createElement('video')
    video.preload = 'metadata'
    video.onloadedmetadata = () => {
      const metadata = {
        durationSeconds: Number.isFinite(video.duration) ? video.duration : 0,
        width: video.videoWidth,
        height: video.videoHeight,
        aspectRatio: ratio(video.videoWidth, video.videoHeight),
      }
      URL.revokeObjectURL(url)
      resolve(metadata)
    }
    video.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('This browser could not read the selected video metadata.'))
    }
    video.src = url
  })
}

export async function extractRepresentativeFrames(file: File, maximumFrames = 3): Promise<string[]> {
  const url = URL.createObjectURL(file)
  const video = document.createElement('video')
  video.muted = true
  video.playsInline = true
  video.preload = 'auto'
  video.src = url

  try {
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve()
      video.onerror = () => reject(new Error('Representative frames could not be read from this video.'))
    })
    const duration = Number.isFinite(video.duration) ? video.duration : 0
    if (duration <= 0 || !video.videoWidth || !video.videoHeight) return []
    const positions = maximumFrames === 1 ? [0.5] : Array.from({ length: maximumFrames }, (_, index) => 0.08 + (index / (maximumFrames - 1)) * 0.84)
    const width = Math.min(640, video.videoWidth)
    const height = Math.max(1, Math.round(width * video.videoHeight / video.videoWidth))
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')
    if (!context) return []
    const frames: string[] = []
    for (const position of positions) {
      video.currentTime = Math.min(Math.max(0, duration * position), Math.max(0, duration - 0.05))
      await new Promise<void>((resolve) => {
        video.onseeked = () => resolve()
      })
      context.drawImage(video, 0, 0, width, height)
      frames.push(canvas.toDataURL('image/jpeg', 0.72))
    }
    return frames
  } finally {
    URL.revokeObjectURL(url)
  }
}

