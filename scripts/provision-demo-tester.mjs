import { randomBytes } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { createClient } from '@supabase/supabase-js'

const root = process.cwd()
const environmentFile = process.env.DEMO_ENV_FILE || '.env.provision.local'

function loadEnvironment(fileName) {
  const filePath = path.resolve(root, fileName)
  if (!fs.existsSync(filePath)) return

  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)$/)
    if (!match || process.env[match[1]]) continue
    let value = match[2].trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    process.env[match[1]] = value.replace(/\\n/g, '\n')
  }
}

function daysFromNow(days, hour = 9) {
  const value = new Date()
  value.setDate(value.getDate() + days)
  value.setHours(hour, 0, 0, 0)
  return value.toISOString()
}

function dateOnly(days) {
  return daysFromNow(days).slice(0, 10)
}

function sampleRecords(now) {
  const customerSarah = {
    id: 'demo-customer-sarah', firstName: 'Sarah', lastName: 'Mitchell',
    phone: '(574) 555-0142', email: 'sarah.mitchell@example.com',
    streetAddress: '214 Maple Street', city: 'Mishawaka', state: 'IN', zipCode: '46544',
    notes: 'Demo customer. Prefers text messages and weekday morning appointments.', createdAt: daysFromNow(-45),
  }
  const customerBrian = {
    id: 'demo-customer-brian', firstName: 'Brian', lastName: 'Carter',
    phone: '(574) 555-0188', email: 'brian.carter@example.com',
    streetAddress: '908 Birch Lane', city: 'South Bend', state: 'IN', zipCode: '46615',
    notes: 'Demo customer. Gate code and private information should never be placed in a public note.', createdAt: daysFromNow(-31),
  }
  const customerLakeview = {
    id: 'demo-customer-lakeview', firstName: 'Lakeview', lastName: 'Property Group',
    phone: '(574) 555-0127', email: 'maintenance@example.com',
    streetAddress: '1400 Riverside Drive', city: 'Elkhart', state: 'IN', zipCode: '46516',
    notes: 'Demo commercial account. Send documents to the maintenance contact.', createdAt: daysFromNow(-18),
  }

  const estimateApproved = {
    id: 'demo-estimate-approved', estimateNumber: 'EST-2026-0001', customerId: customerSarah.id,
    jobName: 'Back Door Safety Repair', serviceAddress: '214 Maple Street, Mishawaka, IN 46544',
    description: 'Replace the damaged back-door closer and adjust the latch.',
    scopeOfWork: 'Remove the damaged closer, install one customer-approved replacement, align the door, and test safe closing and latching.',
    exclusions: ['Hidden framing repair', 'Painting beyond touch-up'], issueDate: dateOnly(-9), expirationDate: dateOnly(21),
    lineItems: [
      { id: 'demo-estimate-approved-service', kind: 'service', description: 'Door closer replacement and adjustment', quantity: 2, unit: 'hour', unitPrice: 120 },
      { id: 'demo-estimate-approved-material', kind: 'material', description: 'Commercial-grade door closer', quantity: 1, unit: 'each', unitPrice: 165 },
    ],
    taxRate: 0, discount: 0, notes: 'Demo estimate. Schedule after customer approval.', propertyType: 'residential',
    jobCategory: 'Door repair', materialCost: 115, taxReservePercent: 30, cardProcessingFeePercent: 3.5,
    status: 'approved', createdAt: daysFromNow(-9), updatedAt: daysFromNow(-7),
    approval: {
      customerName: 'Sarah Mitchell', method: 'text', note: 'Approved through the demo Customer Hub.', acceptedAt: daysFromNow(-7),
      snapshot: {
        estimateNumber: 'EST-2026-0001', revisionNumber: 0, customerId: customerSarah.id,
        jobName: 'Back Door Safety Repair', serviceAddress: '214 Maple Street, Mishawaka, IN 46544',
        scopeOfWork: 'Remove the damaged closer, install one customer-approved replacement, align the door, and test safe closing and latching.',
        exclusions: ['Hidden framing repair', 'Painting beyond touch-up'],
        lineItems: [
          { id: 'demo-estimate-approved-service', kind: 'service', description: 'Door closer replacement and adjustment', quantity: 2, unit: 'hour', unitPrice: 120 },
          { id: 'demo-estimate-approved-material', kind: 'material', description: 'Commercial-grade door closer', quantity: 1, unit: 'each', unitPrice: 165 },
        ],
        taxRate: 0, discount: 0, acceptedAmount: 405,
      },
    },
  }
  const estimateSent = {
    id: 'demo-estimate-sent', estimateNumber: 'EST-2026-0002', customerId: customerBrian.id,
    jobName: 'Drywall Patch and Paint Prep', serviceAddress: '908 Birch Lane, South Bend, IN 46615',
    description: 'Repair two small drywall openings and prepare the area for customer painting.',
    scopeOfWork: 'Patch two drywall openings, apply compound, sand smooth, and leave ready for primer.',
    exclusions: ['Final paint and color matching', 'Repairs outside the two marked areas'], issueDate: dateOnly(-3), expirationDate: dateOnly(27),
    lineItems: [
      { id: 'demo-estimate-sent-service', kind: 'service', description: 'Drywall patch and finish', quantity: 3, unit: 'hour', unitPrice: 120 },
      { id: 'demo-estimate-sent-material', kind: 'material', description: 'Patch materials and compound', quantity: 1, unit: 'lot', unitPrice: 48 },
    ],
    taxRate: 0, discount: 0, notes: 'Demo estimate awaiting customer approval.', propertyType: 'residential',
    jobCategory: 'Drywall repair', materialCost: 32, taxReservePercent: 30, cardProcessingFeePercent: 3.5,
    status: 'sent', createdAt: daysFromNow(-3), updatedAt: daysFromNow(-2),
  }
  const estimateDraft = {
    id: 'demo-estimate-draft', estimateNumber: 'EST-2026-0003', customerId: customerLakeview.id,
    jobName: 'Entry Hardware Tune-Up', serviceAddress: '1400 Riverside Drive, Elkhart, IN 46516',
    description: 'Inspect and adjust two entry-door hinges and one latch.',
    scopeOfWork: 'Adjust the listed entry hardware only.', exclusions: ['Replacement hardware unless approved'],
    issueDate: dateOnly(0), expirationDate: dateOnly(30),
    lineItems: [{ id: 'demo-estimate-draft-service', kind: 'service', description: 'Entry hardware inspection and adjustment', quantity: 2, unit: 'hour', unitPrice: 120 }],
    taxRate: 0, discount: 0, notes: 'Demo draft for tutorial practice.', propertyType: 'commercial', jobCategory: 'General handyman',
    materialCost: 0, taxReservePercent: 30, cardProcessingFeePercent: 3.5,
    status: 'draft', createdAt: now, updatedAt: now,
  }

  const invoiceSent = {
    id: 'demo-invoice-sent', invoiceNumber: 'INV-2026-0001', customerId: customerSarah.id,
    estimateId: estimateApproved.id, jobId: 'demo-job-active', jobName: 'Back Door Safety Repair',
    serviceAddress: '214 Maple Street, Mishawaka, IN 46544', description: estimateApproved.description,
    scopeOfWork: estimateApproved.scopeOfWork, exclusions: estimateApproved.exclusions,
    issueDate: dateOnly(-1), dueDate: dateOnly(13), lineItems: estimateApproved.lineItems,
    taxRate: 0, discount: 0, notes: 'Thank you for choosing this demonstration workspace.',
    propertyType: 'residential', jobCategory: 'Door repair', materialCost: 115,
    taxReservePercent: 30, cardProcessingFeePercent: 3.5, status: 'sent', payments: [],
    createdAt: daysFromNow(-1), updatedAt: daysFromNow(-1), paidAt: null,
  }
  const invoicePaid = {
    id: 'demo-invoice-paid', invoiceNumber: 'INV-2026-0002', customerId: customerBrian.id,
    estimateId: null, jobName: 'Kitchen Cabinet Adjustment', serviceAddress: '908 Birch Lane, South Bend, IN 46615',
    description: 'Adjusted cabinet doors and replaced two worn hinges.', scopeOfWork: 'Cabinet adjustment and hinge replacement.', exclusions: [],
    issueDate: dateOnly(-21), dueDate: dateOnly(-7),
    lineItems: [
      { id: 'demo-invoice-paid-service', kind: 'service', description: 'Cabinet adjustment', quantity: 2, unit: 'hour', unitPrice: 120 },
      { id: 'demo-invoice-paid-material', kind: 'material', description: 'Replacement hinges', quantity: 2, unit: 'each', unitPrice: 22.5 },
    ],
    taxRate: 0, discount: 0, notes: 'Paid demo invoice.', propertyType: 'residential', jobCategory: 'Cabinet repair',
    materialCost: 26, taxReservePercent: 30, cardProcessingFeePercent: 3.5, status: 'paid',
    payments: [{ id: 'demo-payment-paid', date: dateOnly(-18), amount: 285, method: 'check', referenceNumber: 'DEMO-1042', notes: 'Sample payment only.', createdAt: daysFromNow(-18) }],
    createdAt: daysFromNow(-21), updatedAt: daysFromNow(-18), paidAt: daysFromNow(-18),
  }

  const job = {
    id: 'demo-job-active', jobNumber: 'JOB-2026-0001', estimateId: estimateApproved.id, invoiceId: invoiceSent.id,
    customerId: customerSarah.id, jobName: estimateApproved.jobName, serviceAddress: estimateApproved.serviceAddress,
    description: estimateApproved.description, scopeOfWork: estimateApproved.scopeOfWork, exclusions: estimateApproved.exclusions,
    lineItems: estimateApproved.lineItems, quotedPrice: 405, taxRate: 0, discount: 0,
    estimatedLaborHours: 2, estimatedLaborCost: 240, estimatedMaterialCost: 115, estimatedCost: 355,
    materials: ['Commercial-grade door closer'],
    materialChecklist: [{ id: 'demo-job-material-1', item: 'Commercial-grade door closer', purchased: true, loaded: true, delivered: false }],
    changeOrders: [], photoIds: [], voiceNotes: [], internalNotes: 'Demo job: confirm latch operation before marking complete.',
    timeEntries: [], expenses: [], status: 'scheduled', completedAt: null, createdAt: daysFromNow(-7), updatedAt: daysFromNow(-1),
  }
  const appointment = {
    id: 'demo-appointment-upcoming', customerId: customerSarah.id, jobId: job.id, estimateId: estimateApproved.id,
    title: 'Back Door Safety Repair', serviceAddress: estimateApproved.serviceAddress,
    startAt: daysFromNow(1, 9), endAt: daysFromNow(1, 11), status: 'confirmed',
    notes: 'Demo appointment. Customer confirmed by text.', createdAt: daysFromNow(-5), updatedAt: daysFromNow(-2),
  }
  const settings = {
    id: 'business-settings', businessContactVersion: 2, businessName: 'John Doe Home Services — Demo',
    phone: '(574) 334-8410', email: 'john.doe@example.com', website: 'https://example.com',
    streetAddress: '123 Demo Lane', city: 'South Bend', state: 'IN', zipCode: '46601',
    defaultTaxRate: 0, defaultTaxReservePercent: 30, defaultLaborRate: 120,
    minimumJobCharge: 125, serviceCallCharge: 65, diagnosticFee: 65, travelCharge: 0,
    afterHoursRatePercent: 25, weekendRatePercent: 25, emergencyRatePercent: 50,
    defaultMaterialMarkupPercent: 25, defaultOverheadPercent: 12,
    paymentProcessingOverheadPercent: 3.5, targetGrossMarginPercent: 35,
    defaultDeliveryCost: 0, defaultDisposalCost: 0, darkMode: false,
    estimateValidDays: 30, invoiceDueDays: 14, estimatePrefix: 'EST', invoicePrefix: 'INV',
    estimateTerms: 'Estimate valid for 30 days.', invoiceTerms: 'Payment is due within 14 days.',
    emailNotifications: true, leadNotifications: true, updatedAt: now,
  }
  const pricebook = [
    { id: 'demo-pricebook-labor', name: 'Standard handyman labor', category: 'labor', unit: 'hour', unitCost: 55, customerPrice: 120, notes: 'Sample pricing for the demo workspace.', active: true, createdAt: daysFromNow(-30), updatedAt: now },
    { id: 'demo-pricebook-service', name: 'Service call minimum', category: 'service', unit: 'visit', unitCost: 0, customerPrice: 125, notes: 'Sample minimum charge.', active: true, createdAt: daysFromNow(-30), updatedAt: now },
  ]
  const communication = {
    id: 'demo-communication-reminder', customerId: customerSarah.id, appointmentId: appointment.id,
    channel: 'sms', kind: 'appointment_confirmation', status: 'sent', subject: 'Appointment confirmed',
    body: 'Your demo appointment is confirmed for tomorrow at 9:00 AM.', createdAt: daysFromNow(-2), sentAt: daysFromNow(-2),
  }

  const records = [
    ...[customerSarah, customerBrian, customerLakeview].map((payload) => ['customer', payload]),
    ...[estimateApproved, estimateSent, estimateDraft].map((payload) => ['estimate', payload]),
    ...[invoiceSent, invoicePaid].map((payload) => ['invoice', payload]),
    ['job', job], ['appointment', appointment], ['settings', settings],
    ...pricebook.map((payload) => ['pricebook', payload]), ['communication', communication],
  ]

  return records.map(([recordType, payload]) => ({
    record_type: recordType,
    record_id: payload.id,
    payload,
    is_deleted: false,
    client_updated_at: now,
    server_updated_at: now,
  }))
}

async function findUser(client, email) {
  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage: 1000 })
    if (error) throw error
    const user = data.users.find((item) => item.email?.toLowerCase() === email)
    if (user || data.users.length < 1000) return user ?? null
  }
  return null
}

export async function provisionDemoTester(options = {}) {
if (options.loadEnvironment !== false) loadEnvironment(environmentFile)

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const publishableKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY
if (!supabaseUrl || !serviceRoleKey) {
  throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.')
}

const email = (options.email || process.env.DEMO_TESTER_EMAIL || 'tester@callrabbitsfoot.com').trim().toLowerCase()
const password = options.password || process.env.DEMO_TESTER_PASSWORD || `Demo!${randomBytes(12).toString('base64url')}`
const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

let user = await findUser(admin, email)
if (user) {
  const { data, error } = await admin.auth.admin.updateUserById(user.id, {
    password,
    email_confirm: true,
    user_metadata: {
      ...user.user_metadata,
      display_name: 'John Doe',
      organization_name: 'John Doe Home Services — Demo',
      is_demo: true,
    },
  })
  if (error) throw error
  user = data.user
} else {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      display_name: 'John Doe',
      organization_name: 'John Doe Home Services — Demo',
      is_demo: true,
    },
  })
  if (error) throw error
  user = data.user
}

const { data: membership, error: membershipError } = await admin
  .from('organization_members')
  .select('organization_id')
  .eq('user_id', user.id)
  .limit(1)
  .single()
if (membershipError) throw membershipError
const organizationId = membership.organization_id
const now = new Date().toISOString()
if (!publishableKey) {
  throw new Error('VITE_SUPABASE_PUBLISHABLE_KEY is required to verify the tester login.')
}

const testerClient = createClient(supabaseUrl, publishableKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})
const { data: verifiedLogin, error: loginError } = await testerClient.auth.signInWithPassword({
  email,
  password,
})
if (loginError || !verifiedLogin.user || verifiedLogin.user.user_metadata?.is_demo !== true) {
  throw loginError ?? new Error('Demo tester login verification failed.')
}

const { error: organizationError } = await testerClient
  .from('organizations')
  .update({
    name: 'John Doe Home Services — Demo',
    accent_color: '#78c800',
    onboarding_completed_at: now,
    updated_at: now,
  })
  .eq('id', organizationId)
if (organizationError) throw organizationError

const { error: clearError } = await testerClient
  .from('business_records')
  .delete()
  .eq('organization_id', organizationId)
if (clearError) throw clearError

const records = sampleRecords(now).map((record) => ({ organization_id: organizationId, ...record }))
const { error: recordError } = await testerClient
  .from('business_records')
  .upsert(records, { onConflict: 'organization_id,record_type,record_id' })
if (recordError) throw recordError

await testerClient.from('leads').delete().eq('organization_id', organizationId)
const { error: leadError } = await testerClient.from('leads').insert({
  organization_id: organizationId,
  source: 'website-demo',
  status: 'unread',
  name: 'Emily Parker',
  phone: '(574) 555-0194',
  email: 'emily.parker@example.com',
  service: 'TV mounting',
  address: '77 Sample Court, Granger, IN 46530',
  description: 'Demo website request for mounting one 55-inch television. No real customer action is required.',
  photo_paths: [],
  activity: [{ id: 'demo-lead-activity', type: 'submitted', message: 'Demo lead submitted from the website.', createdAt: now }],
  submitted_at: now,
  updated_at: now,
})
if (leadError) throw leadError

await testerClient.auth.signOut()

const credentialsPath = options.writeCredentials === false
  ? null
  : process.env.DEMO_CREDENTIALS_FILE
    ? path.resolve(process.env.DEMO_CREDENTIALS_FILE)
    : path.resolve(root, 'tmp', 'demo-tester-credentials.txt')
if (credentialsPath) {
  fs.mkdirSync(path.dirname(credentialsPath), { recursive: true })
  fs.writeFileSync(
    credentialsPath,
    `Rabbit's Foot Owner Hub demo tester\nURL: https://rabbits-foot-owner-hub.vercel.app\nEmail: ${email}\nPassword: ${password}\n`,
    { encoding: 'utf8', mode: 0o600 },
  )
}

console.info(`Demo tester workspace provisioned for ${email}.`)
if (credentialsPath) console.info(`Credentials saved to ${credentialsPath}.`)
return { email, organizationId, userId: user.id }
}

const isDirectRun = process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))
if (isDirectRun) await provisionDemoTester()
