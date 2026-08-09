import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib'

import googleReviewQrUrl from '../../../assets/google-review-qr.jpg'
import { loadBusinessSettings } from '../../settings/data/businessSettingsStore'
import { saveDocumentPdf, saveDocumentRecord } from '../data/documentArchiveStore'
import { bytesToBase64, isNativePlatform, NativeDocumentManager } from './nativeDocumentManager'
import type { BusinessDocumentRecord, PdfDocumentInput } from '../types/BusinessDocument'

const PAGE_WIDTH = 612
const PAGE_HEIGHT = 792
const MARGIN = 48
const GREEN = rgb(0.48, 0.75, 0)
const BLACK = rgb(0.05, 0.07, 0.06)
const GRAY = rgb(0.38, 0.42, 0.39)
const LIGHT = rgb(0.94, 0.96, 0.92)
const REVIEW_GOLD = rgb(0.95, 0.67, 0.08)
const REVIEW_PANEL = rgb(0.985, 0.98, 0.94)
const STAR_PATH = 'M 10 1.5 L 12.6 6.8 L 18.5 7.7 L 14.25 11.8 L 15.3 17.6 L 10 14.8 L 4.7 17.6 L 5.75 11.8 L 1.5 7.7 L 7.4 6.8 Z'

function money(value: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value)
}

function date(value: string) {
  if (!value) return '—'
  return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' }).format(new Date(`${value}T12:00:00`))
}

function safeFileName(value: string) {
  return value.replace(/[^a-z0-9-_]+/gi, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
}

function wrapText(text: string, font: PDFFont, size: number, width: number) {
  const paragraphs = text.split(/\r?\n/)
  const lines: string[] = []
  for (const paragraph of paragraphs) {
    const words = paragraph.trim().split(/\s+/).filter(Boolean)
    if (!words.length) {
      lines.push('')
      continue
    }
    let line = words[0]
    for (const word of words.slice(1)) {
      const candidate = `${line} ${word}`
      if (font.widthOfTextAtSize(candidate, size) <= width) line = candidate
      else {
        lines.push(line)
        line = word
      }
    }
    lines.push(line)
  }
  return lines
}

export async function generateBusinessDocumentPdf(input: PdfDocumentInput) {
  const settings = loadBusinessSettings()
  const pdf = await PDFDocument.create()
  const regular = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  let page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT])
  let y = PAGE_HEIGHT - MARGIN

  const addPage = () => {
    page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT])
    y = PAGE_HEIGHT - MARGIN
    page.drawText(settings.businessName, { x: MARGIN, y, size: 10, font: bold, color: BLACK })
    y -= 25
  }
  const ensure = (height: number) => { if (y - height < 62) addPage() }
  const text = (value: string, x: number, size = 10, font = regular, color = BLACK) => {
    page.drawText(value, { x, y, size, font, color })
  }
  const wrapped = (value: string, x: number, width: number, size = 10, font = regular, color = BLACK) => {
    const lines = wrapText(value, font, size, width)
    ensure(lines.length * (size + 3))
    for (const line of lines) {
      page.drawText(line, { x, y, size, font, color })
      y -= size + 3
    }
  }

  try {
    const logoBytes = await fetch('/pwa-192x192.png').then((response) => response.arrayBuffer())
    const logo = await pdf.embedPng(logoBytes)
    page.drawImage(logo, { x: MARGIN, y: y - 52, width: 52, height: 52 })
  } catch { /* PDF remains fully usable when the logo cannot be fetched. */ }

  page.drawText(settings.businessName, { x: 112, y: y - 15, size: 17, font: bold, color: BLACK })
  page.drawText(settings.phone, { x: 112, y: y - 32, size: 9, font: regular, color: GRAY })
  page.drawText(`${settings.email}  •  ${settings.website}`, { x: 112, y: y - 46, size: 9, font: regular, color: GRAY })
  page.drawText(input.kind.toUpperCase(), { x: 458, y: y - 8, size: 20, font: bold, color: GREEN })
  page.drawText(`# ${input.number}`, { x: 458, y: y - 28, size: 10, font: bold, color: BLACK })
  y -= 78
  page.drawRectangle({ x: MARGIN, y: y - 2, width: PAGE_WIDTH - MARGIN * 2, height: 2, color: GREEN })
  y -= 25

  text('BILL TO', MARGIN, 9, bold, GREEN)
  text(input.kind === 'invoice' ? 'INVOICE DETAILS' : 'ESTIMATE DETAILS', 350, 9, bold, GREEN)
  y -= 18
  const billingTop = y
  let customerY = billingTop
  page.drawText(input.customerName, { x: MARGIN, y: customerY, size: 12, font: bold, color: BLACK })
  customerY -= 15
  if (input.customerEmail) { page.drawText(input.customerEmail, { x: MARGIN, y: customerY, size: 9, font: regular, color: GRAY }); customerY -= 13 }
  if (input.customerPhone) { page.drawText(input.customerPhone, { x: MARGIN, y: customerY, size: 9, font: regular, color: GRAY }); customerY -= 13 }
  if (input.customerAddress) {
    const addressLines = wrapText(input.customerAddress, regular, 9, 245)
    addressLines.forEach((line) => { page.drawText(line, { x: MARGIN, y: customerY, size: 9, font: regular, color: GRAY }); customerY -= 12 })
  }
  page.drawText(`Issued: ${date(input.issueDate)}`, { x: 350, y: billingTop, size: 10, font: regular, color: BLACK })
  page.drawText(`${input.kind === 'invoice' ? 'Due' : 'Valid through'}: ${date(input.dueDate)}`, { x: 350, y: billingTop - 17, size: 10, font: regular, color: BLACK })
  y = Math.min(customerY, billingTop - 34) - 10

  if (input.jobName || input.serviceAddress || input.description) {
    ensure(90)
    page.drawRectangle({ x: MARGIN, y: y - 58, width: PAGE_WIDTH - MARGIN * 2, height: 68, color: LIGHT })
    page.drawText(input.jobName || 'Project', { x: MARGIN + 12, y: y - 10, size: 11, font: bold, color: BLACK })
    if (input.serviceAddress) page.drawText(input.serviceAddress, { x: MARGIN + 12, y: y - 27, size: 9, font: regular, color: GRAY })
    const scope = wrapText(input.description, regular, 9, PAGE_WIDTH - MARGIN * 2 - 24).slice(0, 2)
    scope.forEach((line, index) => page.drawText(line, { x: MARGIN + 12, y: y - 43 - index * 11, size: 9, font: regular, color: BLACK }))
    y -= 82
  }

  if (input.scopeOfWork) {
    ensure(45)
    text('SCOPE OF WORK', MARGIN, 9, bold, GREEN)
    y -= 16
    wrapped(input.scopeOfWork, MARGIN, PAGE_WIDTH - MARGIN * 2, 9, regular, BLACK)
    y -= 10
  }

  ensure(55)
  page.drawRectangle({ x: MARGIN, y: y - 22, width: PAGE_WIDTH - MARGIN * 2, height: 25, color: BLACK })
  page.drawText('DESCRIPTION', { x: MARGIN + 10, y: y - 14, size: 9, font: bold, color: rgb(1, 1, 1) })
  page.drawText('QTY', { x: 390, y: y - 14, size: 9, font: bold, color: rgb(1, 1, 1) })
  page.drawText('RATE', { x: 440, y: y - 14, size: 9, font: bold, color: rgb(1, 1, 1) })
  page.drawText('AMOUNT', { x: 510, y: y - 14, size: 9, font: bold, color: rgb(1, 1, 1) })
  y -= 36

  for (const item of input.lineItems) {
    const lines = wrapText(item.description || 'Service', regular, 9, 320)
    const rowHeight = Math.max(26, lines.length * 12 + 8)
    ensure(rowHeight)
    lines.forEach((line, index) => page.drawText(line, { x: MARGIN + 10, y: y - index * 12, size: 9, font: regular, color: BLACK }))
    page.drawText(String(item.quantity), { x: 390, y, size: 9, font: regular, color: BLACK })
    page.drawText(money(item.unitPrice), { x: 430, y, size: 9, font: regular, color: BLACK })
    page.drawText(money(item.quantity * item.unitPrice), { x: 500, y, size: 9, font: bold, color: BLACK })
    y -= rowHeight
    page.drawLine({ start: { x: MARGIN, y: y + 8 }, end: { x: PAGE_WIDTH - MARGIN, y: y + 8 }, thickness: 0.5, color: LIGHT })
  }

  const subtotal = input.lineItems.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0)
  const discounted = Math.max(0, subtotal - input.discount)
  const tax = discounted * (input.taxRate / 100)
  const total = discounted + tax
  ensure(125)
  y -= 4
  const totalX = 390
  page.drawText('Subtotal', { x: totalX, y, size: 9, font: regular, color: GRAY })
  page.drawText(money(subtotal), { x: 500, y, size: 9, font: regular, color: BLACK })
  y -= 17
  if (input.discount > 0) { page.drawText('Discount', { x: totalX, y, size: 9, font: regular, color: GRAY }); page.drawText(`-${money(input.discount)}`, { x: 500, y, size: 9, font: regular, color: BLACK }); y -= 17 }
  page.drawText(`Tax (${input.taxRate}%)`, { x: totalX, y, size: 9, font: regular, color: GRAY })
  page.drawText(money(tax), { x: 500, y, size: 9, font: regular, color: BLACK })
  y -= 30
  page.drawRectangle({ x: 375, y: y - 16, width: 189, height: 42, color: GREEN })
  page.drawText('TOTAL', { x: 390, y, size: 11, font: bold, color: BLACK })
  page.drawText(money(total), { x: 470, y: y - 2, size: 15, font: bold, color: BLACK })
  y -= 52

  if (input.exclusions?.length) {
    text('EXCLUSIONS', MARGIN, 9, bold, GREEN)
    y -= 15
    wrapped(input.exclusions.map((item) => `- ${item}`).join('\n'), MARGIN, PAGE_WIDTH - MARGIN * 2, 9, regular, GRAY)
    y -= 8
  }

  if (input.notes) { text('NOTES', MARGIN, 9, bold, GREEN); y -= 15; wrapped(input.notes, MARGIN, PAGE_WIDTH - MARGIN * 2, 9, regular, GRAY); y -= 8 }
  if (input.terms && !input.notes.toLowerCase().includes(input.terms.toLowerCase())) { text('TERMS', MARGIN, 9, bold, GREEN); y -= 15; wrapped(input.terms, MARGIN, PAGE_WIDTH - MARGIN * 2, 8, regular, GRAY) }
  if (input.approval) {
    ensure(70)
    y -= 14
    page.drawRectangle({ x: MARGIN, y: y - 40, width: PAGE_WIDTH - MARGIN * 2, height: 52, color: LIGHT })
    page.drawText('CUSTOMER APPROVAL RECORDED', { x: MARGIN + 12, y: y - 4, size: 9, font: bold, color: GREEN })
    page.drawText(input.approval.customerName, { x: MARGIN + 12, y: y - 22, size: 11, font: bold, color: BLACK })
    page.drawText(`${new Date(input.approval.acceptedAt).toLocaleString()}  /  ${input.approval.method.replaceAll('_', ' ')}`, { x: 250, y: y - 22, size: 8, font: regular, color: GRAY })
    y -= 58
  }

  if (input.kind === 'invoice') {
    ensure(150)
    y -= 8
    const panelHeight = 130
    const panelBottom = y - panelHeight
    const qrSize = 88
    const qrX = PAGE_WIDTH - MARGIN - qrSize - 12
    const qrY = y - qrSize - 10

    page.drawRectangle({
      x: MARGIN,
      y: panelBottom,
      width: PAGE_WIDTH - MARGIN * 2,
      height: panelHeight,
      color: REVIEW_PANEL,
      borderColor: LIGHT,
      borderWidth: 1,
    })
    page.drawText('LOVE THE RESULT?', { x: MARGIN + 16, y: y - 28, size: 9, font: bold, color: GREEN })
    page.drawText('Share your experience', { x: MARGIN + 16, y: y - 51, size: 17, font: bold, color: BLACK })
    page.drawText('Scan the QR code to leave a Google review.', { x: MARGIN + 16, y: y - 72, size: 9, font: regular, color: GRAY })
    page.drawText('Your feedback helps our local business grow.', { x: MARGIN + 16, y: y - 88, size: 9, font: regular, color: GRAY })
    page.drawText('Thank you for choosing us.', { x: MARGIN + 16, y: y - 108, size: 9, font: bold, color: BLACK })

    try {
      const reviewQrBytes = await fetch(googleReviewQrUrl).then((response) => {
        if (!response.ok) throw new Error('review_qr_unavailable')
        return response.arrayBuffer()
      })
      const reviewQr = await pdf.embedJpg(reviewQrBytes)
      page.drawImage(reviewQr, { x: qrX, y: qrY, width: qrSize, height: qrSize })
    } catch {
      page.drawRectangle({ x: qrX, y: qrY, width: qrSize, height: qrSize, borderColor: GRAY, borderWidth: 1 })
      page.drawText('Review QR', { x: qrX + 21, y: qrY + 42, size: 8, font: bold, color: GRAY })
    }

    const starSize = 9
    const starGap = 3
    const starsWidth = starSize * 5 + starGap * 4
    const starsX = qrX + (qrSize - starsWidth) / 2
    for (let index = 0; index < 5; index += 1) {
      page.drawSvgPath(STAR_PATH, {
        x: starsX + index * (starSize + starGap),
        y: panelBottom + 7,
        scale: starSize / 20,
        color: REVIEW_GOLD,
      })
    }
    y -= panelHeight + 10
  }

  const pages = pdf.getPages()
  pages.forEach((currentPage: PDFPage, index: number) => {
    currentPage.drawLine({ start: { x: MARGIN, y: 43 }, end: { x: PAGE_WIDTH - MARGIN, y: 43 }, thickness: 0.5, color: LIGHT })
    currentPage.drawText('Small Fixes. Big Difference.', { x: MARGIN, y: 27, size: 8, font: bold, color: GREEN })
    currentPage.drawText(`Page ${index + 1} of ${pages.length}`, { x: 505, y: 27, size: 8, font: regular, color: GRAY })
  })

  return pdf.save()
}

export async function createAndArchiveDocument(input: PdfDocumentInput) {
  const bytes = await generateBusinessDocumentPdf(input)
  const archiveId = `${input.kind}-${input.id}-${Date.now()}`
  const fileName = `${input.kind === 'invoice' ? 'Invoice' : 'Estimate'}-${safeFileName(input.number)}-${safeFileName(input.customerName)}.pdf`
  let nativePath: string | undefined
  if (isNativePlatform()) {
    nativePath = (await NativeDocumentManager.savePdf({ base64: bytesToBase64(bytes), fileName })).path
  }
  await saveDocumentPdf(archiveId, bytes)
  const record: BusinessDocumentRecord = { id: archiveId, sourceId: input.id, kind: input.kind, number: input.number, customerName: input.customerName, fileName, createdAt: new Date().toISOString(), nativePath }
  saveDocumentRecord(record)
  return { record, bytes }
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  anchor.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000)
}

export async function actOnDocument(record: BusinessDocumentRecord, blob: Blob, action: 'preview' | 'save' | 'share' | 'print') {
  if (isNativePlatform() && record.nativePath) {
    if (action === 'preview') return NativeDocumentManager.openPdf({ path: record.nativePath })
    if (action === 'save') return NativeDocumentManager.exportPdf({ path: record.nativePath, fileName: record.fileName })
    if (action === 'share') return NativeDocumentManager.sharePdf({ path: record.nativePath, title: record.fileName })
    return NativeDocumentManager.printPdf({ path: record.nativePath, title: record.fileName })
  }
  if (action === 'save') return downloadBlob(blob, record.fileName)
  if (action === 'share' && navigator.share && navigator.canShare?.({ files: [new File([blob], record.fileName, { type: 'application/pdf' })] })) {
    return navigator.share({ title: record.fileName, files: [new File([blob], record.fileName, { type: 'application/pdf' })] })
  }
  const url = URL.createObjectURL(blob)
  const preview = window.open(url, '_blank', 'noopener,noreferrer')
  if (action === 'print' && preview) preview.addEventListener('load', () => preview.print())
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
}
