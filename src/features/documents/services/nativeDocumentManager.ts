import { Capacitor, registerPlugin } from '@capacitor/core'

type NativeDocumentManagerPlugin = {
  savePdf(options: { base64: string; fileName: string }): Promise<{ path: string }>
  exportPdf(options: { path: string; fileName: string }): Promise<{ uri: string }>
  openPdf(options: { path: string }): Promise<void>
  sharePdf(options: { path: string; title: string }): Promise<void>
  printPdf(options: { path: string; title: string }): Promise<void>
  deletePdf(options: { path: string }): Promise<void>
}

export const NativeDocumentManager = registerPlugin<NativeDocumentManagerPlugin>('DocumentManager')
export const isNativePlatform = () => Capacitor.isNativePlatform()

export function bytesToBase64(bytes: Uint8Array) {
  let binary = ''
  const chunkSize = 32_768
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize))
  }
  return btoa(binary)
}
