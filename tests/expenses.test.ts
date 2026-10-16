import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import type { ExpenseRecord } from '../src/features/expenses/types/ExpenseRecord.ts'
import {
  expenseAmountLabel,
  expensesToCsv,
  expenseTotals,
  money,
  receiptPhotoDescription,
} from '../src/features/expenses/utils/expenseUtils.ts'

function expense(patch: Partial<ExpenseRecord>): ExpenseRecord {
  return {
    id: patch.id ?? 'expense',
    category: patch.category ?? 'materials',
    merchant: patch.merchant ?? 'Menards',
    purchaseDate: patch.purchaseDate ?? '2026-08-20',
    description: patch.description ?? 'Tile materials',
    subtotal: patch.subtotal ?? 100,
    tax: patch.tax ?? 7,
    total: patch.total ?? 107,
    paymentMethod: patch.paymentMethod ?? '',
    receiptNumber: patch.receiptNumber ?? '',
    storeLocation: patch.storeLocation ?? '',
    notes: patch.notes ?? '',
    customerId: patch.customerId ?? null,
    jobId: patch.jobId ?? null,
    billable: patch.billable ?? false,
    receiptPhotoId: patch.receiptPhotoId ?? null,
    lineItems: patch.lineItems ?? [],
    scanConfidence: patch.scanConfidence ?? null,
    fieldConfidence: patch.fieldConfidence ?? null,
    suggestedJobId: patch.suggestedJobId ?? null,
    jobMatchConfidence: patch.jobMatchConfidence ?? null,
    jobMatchReason: patch.jobMatchReason ?? '',
    createdAt: patch.createdAt ?? '2026-08-20T12:00:00.000Z',
    updatedAt: patch.updatedAt ?? '2026-08-20T12:00:00.000Z',
  }
}

test('expense totals separate canonical categories for the selected month', () => {
  const totals = expenseTotals([
    expense({ id: 'materials', category: 'materials', total: 107 }),
    expense({ id: 'gas', category: 'fuel', total: 42.35 }),
    expense({ id: 'old', purchaseDate: '2026-07-31', total: 999 }),
  ], '2026-08-01')

  assert.equal(totals.materials, 107)
  assert.equal(totals.fuel, 42.35)
  assert.equal(totals.vehicle, 0)
  assert.equal(totals.all, 149.35)
  assert.equal(money(10.235), 10.24)
})

test('CSV export quotes commas and includes tax-ready expense fields', () => {
  const csv = expensesToCsv([
    expense({ customerId: 'customer-1', merchant: 'Hardware, Inc.', notes: 'Job 1\npaid cash' }),
  ], { 'customer-1': 'Pat Customer' })
  assert.match(csv, /Date,Category,Merchant/)
  assert.match(csv, /"Hardware, Inc\."/)
  assert.match(csv, /Customer,Customer ID,Job ID/)
  assert.match(csv, /Pat Customer,customer-1/)
  assert.match(csv, /Job 1 paid cash/)
})

test('receipts can be assigned directly to customers with or without jobs', () => {
  const receiptsPage = readFileSync(
    new URL('../src/features/expenses/pages/Receipts.tsx', import.meta.url),
    'utf8',
  )
  const expenseStore = readFileSync(
    new URL('../src/features/expenses/data/expenseStore.ts', import.meta.url),
    'utf8',
  )
  const customersPage = readFileSync(
    new URL('../src/features/customers/pages/Customers.tsx', import.meta.url),
    'utf8',
  )

  assert.match(receiptsPage, />Assign to customer</)
  assert.match(receiptsPage, />Attach to job \(optional\)</)
  assert.match(receiptsPage, /const customerId = linkedJob\?\.customerId \|\| draft\.customerId \|\| null/)
  assert.match(receiptsPage, /customerId,\s*jobName: linkedJob\?\.jobName/)
  assert.match(receiptsPage, /savePhotos\(photos\.map/)
  assert.match(receiptsPage, /Search customer, job, merchant, or notes/)
  assert.match(expenseStore, /record\.customerId === undefined/)
  assert.match(expenseStore, /jobsById\.get\(record\.jobId\)\?\.customerId/)
  assert.match(customersPage, /loadExpenses\(\)\.filter\(\(item\) => item\.customerId === selectedCustomerId\)/)
  assert.match(customersPage, /type: 'Receipt'/)
})

test('Android receipt capture uses the native camera instead of the gallery picker', () => {
  const cameraService = readFileSync(
    new URL('../src/features/expenses/services/receiptCamera.ts', import.meta.url),
    'utf8',
  )
  const receiptsPage = readFileSync(
    new URL('../src/features/expenses/pages/Receipts.tsx', import.meta.url),
    'utf8',
  )

  assert.match(cameraService, /Camera\.takePhoto\(/)
  assert.match(cameraService, /saveToGallery:\s*false/)
  assert.match(receiptsPage, /hasNativeReceiptCamera\(\)/)
  assert.match(receiptsPage, /accept="image\/\*" capture="environment"/)
})

test('reviewed expenses use app validation and remain saveable when attachment work fails', () => {
  const receiptsPage = readFileSync(
    new URL('../src/features/expenses/pages/Receipts.tsx', import.meta.url),
    'utf8',
  )
  const expenseStore = readFileSync(
    new URL('../src/features/expenses/data/expenseStore.ts', import.meta.url),
    'utf8',
  )

  assert.match(receiptsPage, /<form className="receipt-review-form" noValidate/)
  assert.match(receiptsPage, /The expense was saved, but Android could not attach the receipt image/)
  assert.match(expenseStore, /try \{\s*queueCollectionSync\('expense', expenses\)/)
})

test('receipt photos and archived PDFs share an upgraded IndexedDB schema safely', () => {
  const database = readFileSync(
    new URL('../src/shared/data/ownerHubDatabase.ts', import.meta.url),
    'utf8',
  )
  const photoBlobStore = readFileSync(
    new URL('../src/features/photos/data/photoBlobStore.ts', import.meta.url),
    'utf8',
  )
  const documentArchiveStore = readFileSync(
    new URL('../src/features/documents/data/documentArchiveStore.ts', import.meta.url),
    'utf8',
  )
  const photoStore = readFileSync(
    new URL('../src/features/photos/data/photoStore.ts', import.meta.url),
    'utf8',
  )

  assert.match(database, /OWNER_HUB_DATABASE_VERSION = 2/)
  assert.match(database, /DOCUMENT_PDF_STORE_NAME/)
  assert.match(database, /PENDING_PHOTO_STORE_NAME/)
  assert.match(photoBlobStore, /openOwnerHubDatabase\(\)/)
  assert.match(documentArchiveStore, /openOwnerHubDatabase\(\)/)
  assert.match(photoStore, /file\.slice\(/)
})

test('stored photos and receipt images can be downloaded, printed, and sent', () => {
  const photoActions = readFileSync(
    new URL('../src/features/photos/services/photoActions.ts', import.meta.url),
    'utf8',
  )
  const photosPage = readFileSync(
    new URL('../src/pages/Photos/Photos.tsx', import.meta.url),
    'utf8',
  )
  const receiptsPage = readFileSync(
    new URL('../src/features/expenses/pages/Receipts.tsx', import.meta.url),
    'utf8',
  )
  const mainActivity = readFileSync(
    new URL('../android/app/src/main/java/com/callrabbitsfoot/ownerhub/MainActivity.java', import.meta.url),
    'utf8',
  )
  const imageManager = readFileSync(
    new URL('../android/app/src/main/java/com/callrabbitsfoot/ownerhub/ImageManagerPlugin.java', import.meta.url),
    'utf8',
  )

  assert.match(photoActions, /registerPlugin<NativeImageManagerPlugin>\('ImageManager'\)/)
  assert.match(photoActions, /navigator\.share/)
  assert.match(photoActions, /anchor\.download/)
  assert.match(photosPage, /> Download<\/button>/)
  assert.match(photosPage, /> Print<\/button>/)
  assert.match(photosPage, /> Send<\/button>/)
  assert.match(receiptsPage, /aria-label="Download receipt image"/)
  assert.match(receiptsPage, /aria-label="Print receipt image"/)
  assert.match(receiptsPage, /aria-label="Send receipt image"/)
  assert.match(mainActivity, /registerPlugin\(ImageManagerPlugin\.class\)/)
  assert.match(imageManager, /MediaStore\.Downloads/)
  assert.match(imageManager, /Intent\.ACTION_SEND/)
  assert.match(imageManager, /PrintManager/)
})

test('receipt images use clear material, gas, and vehicle-part descriptions', () => {
  const receiptsPage = readFileSync(
    new URL('../src/features/expenses/pages/Receipts.tsx', import.meta.url),
    'utf8',
  )
  const photosPage = readFileSync(
    new URL('../src/pages/Photos/Photos.tsx', import.meta.url),
    'utf8',
  )

  assert.equal(receiptPhotoDescription('materials'), 'Receipt/Material')
  assert.equal(receiptPhotoDescription('fuel'), 'Receipt/Gas')
  assert.equal(receiptPhotoDescription('vehicle'), 'Receipt/Vehicle Part')
  assert.match(receiptsPage, /receiptPhotoDescription\(draft\.category\)/)
  assert.match(photosPage, /receiptPhotoDescription\(expense\.category\)/)
  assert.match(receiptsPage, /expenseCategoryLabels/)
})

test('receipt review and history identify vehicle-parts cost explicitly', () => {
  const receiptsPage = readFileSync(
    new URL('../src/features/expenses/pages/Receipts.tsx', import.meta.url),
    'utf8',
  )

  assert.equal(expenseAmountLabel('materials'), 'Material cost')
  assert.equal(expenseAmountLabel('fuel'), 'Gas cost')
  assert.equal(expenseAmountLabel('vehicle'), 'Vehicle parts cost')
  assert.match(receiptsPage, /expenseAmountLabel\(draft\.category\)/)
  assert.match(receiptsPage, /expenseAmountLabel\(expense\.category\)/)
  assert.match(receiptsPage, /Vehicle parts cost/)
})

test('the main dashboard shows current material, gas, and vehicle-part totals', () => {
  const dashboard = readFileSync(
    new URL('../src/pages/Dashboard/Dashboard.tsx', import.meta.url),
    'utf8',
  )

  assert.match(dashboard, /expenseTotals\(expenses, `\$\{monthKey\}-01`\)/)
  assert.match(dashboard, /label: 'Materials'[\s\S]*monthlyExpenses\.materials/)
  assert.match(dashboard, /label: 'Gas'[\s\S]*monthlyExpenses\.fuel/)
  assert.match(dashboard, /label: 'Vehicle parts'[\s\S]*monthlyExpenses\.vehicle/)
})
