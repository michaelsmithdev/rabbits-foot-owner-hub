import type { PageName } from '../../components/Sidebar/navigation'
import type { TutorialSection, TutorialSectionId, TutorialStep } from './types'

export const TUTORIAL_VERSION = 1

export const tutorialSections: TutorialSection[] = [
  { id: 'overview', label: 'Getting around Owner Hub', shortLabel: 'Dashboard', description: 'Dashboard, navigation, status, and the full business workflow.' },
  { id: 'customers', label: 'Customers', shortLabel: 'Customers', description: 'Customer records, contact details, activity, and safe Customer Hub sharing.' },
  { id: 'schedule', label: 'Schedule', shortLabel: 'Schedule', description: 'Appointments, conflicts, customer reminders, and field status.' },
  { id: 'estimates', label: 'Estimates', shortLabel: 'Estimates', description: 'Build, price, save, send, duplicate, approve, and convert estimates.' },
  { id: 'ai-estimating', label: 'AI estimating', shortLabel: 'AI estimating', description: 'Voice notes, job photos, exact-scope analysis, and owner review.' },
  { id: 'communication', label: 'Sending and communication', shortLabel: 'Sending', description: 'Safe customer texting, public links, PDFs, and saved contact information.' },
  { id: 'customer-hub', label: 'Customer Hub', shortLabel: 'Customer Hub', description: 'What the contractor shares and what the customer can securely see.' },
  { id: 'invoices', label: 'Invoices and payments', shortLabel: 'Invoices', description: 'Invoice status, delivery, Square checkout, payments, and balances.' },
  { id: 'jobs', label: 'Jobs and field workflow', shortLabel: 'Jobs', description: 'Time, expenses, photos, change orders, completion, and final billing.' },
  { id: 'inbox', label: 'Inbox and leads', shortLabel: 'Inbox / Leads', description: 'Website requests, lead follow-up, conversion, flags, and archiving.' },
  { id: 'photos-documents', label: 'Photos and PDF archive', shortLabel: 'Photos & PDFs', description: 'Private job photos and printable or shareable document copies.' },
  { id: 'pricing', label: 'Smart pricing', shortLabel: 'Smart pricing', description: 'Pricebook references and real completed-work history.' },
  { id: 'settings', label: 'Settings and data', shortLabel: 'Settings', description: 'Business defaults, notifications, cloud sync, and portable backups.' },
  { id: 'business', label: 'Business and billing', shortLabel: 'Business & billing', description: 'Workspace identity, usage, team access, Square, plan, and privacy controls.' },
  { id: 'finish', label: 'Finish', shortLabel: 'Finish', description: 'Review the complete operating workflow.', hiddenFromPicker: true },
]

export const tutorialSteps: TutorialStep[] = [
  { id: 'welcome', section: 'overview', page: 'home', placement: 'center', title: "Welcome to Rabbit's Foot Owner Hub", description: "Let's walk through the real app so you know where your customers, work, documents, money, and follow-ups live." },
  { id: 'dashboard-overview', section: 'overview', page: 'home', target: 'dashboard', title: 'Your business at a glance', description: 'The Dashboard brings today’s schedule, recent documents, money, and priority follow-ups together.' },
  { id: 'dashboard-summary', section: 'overview', page: 'home', target: 'dashboard-summary', fallbackTarget: 'dashboard', title: 'Know the numbers that matter', description: 'These cards summarize active customers, outstanding work, approved value, and your tax reserve.' },
  { id: 'dashboard-schedule', section: 'overview', page: 'home', target: 'dashboard-schedule', fallbackTarget: 'dashboard', title: 'See today’s field work', description: 'Today’s appointments appear here. Open one to continue in the Schedule.' },
  { id: 'dashboard-recent', section: 'overview', page: 'home', target: 'dashboard-recent-work', fallbackTarget: 'dashboard', title: 'Jump straight back into work', description: 'Recent estimates and invoices open the exact document instead of making you search for it.' },
  { id: 'dashboard-actions', section: 'overview', page: 'home', target: 'dashboard-action-center', fallbackTarget: 'dashboard', title: 'Follow the next best action', description: 'Owner Hub surfaces requests and time-sensitive follow-ups so work does not slip through the cracks.' },
  { id: 'main-navigation', section: 'overview', page: 'home', target: 'main-navigation', fallbackTarget: 'mobile-navigation', placement: 'right', title: 'Move through the workspace', description: 'Use the main navigation on desktop or the bottom navigation and More menu on mobile.' },
  { id: 'workspace-status', section: 'overview', page: 'home', target: 'workspace-status', fallbackTarget: 'app-topbar', title: 'Online and cloud status', description: 'These indicators tell you whether the device is online and whether business records have synced.' },
  { id: 'global-new-estimate', section: 'overview', page: 'home', target: 'new-estimate', fallbackTarget: 'app-topbar', title: 'Start an estimate from anywhere', description: 'This shortcut opens the estimate builder without making you leave the current workflow first.' },
  { id: 'learn-this-page', section: 'overview', page: 'home', target: 'learn-this-page', fallbackTarget: 'app-topbar', title: 'Come back for help anytime', description: 'Learn This Page starts the tutorial for the screen you are currently using.' },

  { id: 'customers-navigation', section: 'customers', page: 'customers', target: 'nav-customers', fallbackTarget: 'customers-page', title: 'Open Customers', description: 'Customers is the source of truth for the people and businesses you work for.' },
  { id: 'customers-list', section: 'customers', page: 'customers', target: 'customers-page', title: 'One record follows the whole job', description: 'Saved customer information follows estimates, invoices, jobs, appointments, messages, and Customer Hub links.' },
  { id: 'customer-search', section: 'customers', page: 'customers', target: 'customer-search', fallbackTarget: 'customers-page', title: 'Find a customer quickly', description: 'Search by name, phone, email, or address instead of scrolling through the full list.' },
  { id: 'customer-cards', section: 'customers', page: 'customers', target: 'customer-records', fallbackTarget: 'customers-page', title: 'See documents and billed value', description: 'Each customer card shows contact details, notes, connected documents, and billed totals.' },
  { id: 'customer-profile', section: 'customers', page: 'customers', target: 'customer-profile', fallbackTarget: 'customer-records', title: 'The customer profile keeps the history', description: 'Open a customer to edit contact information and review estimates, invoices, payments, notes, and timeline activity.' },
  { id: 'customer-hub-from-profile', section: 'customers', page: 'customers', target: 'customer-hub', fallbackTarget: 'customer-profile', title: 'Share one secure Customer Hub', description: 'Text Customer Hub uses the saved phone number and creates a private customer-facing link.', tip: 'Always verify the phone number before preparing a customer text.' },
  { id: 'customer-delete-safety', section: 'customers', page: 'customers', target: 'customer-records', fallbackTarget: 'customers-page', title: 'Editing and deleting stay deliberate', description: 'Edit updates the saved record. Delete asks for confirmation and is never triggered by this tutorial.' },
  { id: 'add-customer', section: 'customers', page: 'customers', target: 'add-customer', fallbackTarget: 'customers-page', title: 'Add a customer once', description: 'Save the customer before creating work so Owner Hub can reuse the correct address, phone, and email.' },
  { id: 'customer-form', section: 'customers', page: 'customers', target: 'customer-form', fallbackTarget: 'add-customer', title: 'Complete the useful contact details', description: 'Name is required. Phone powers texts, email powers email handoff, and the address follows estimates and appointments.', tip: 'This tutorial opened the empty form safely. It will not save a customer.', action: { type: 'activate-target', target: 'add-customer' } },

  { id: 'schedule-navigation', section: 'schedule', page: 'schedule', target: 'nav-schedule', fallbackTarget: 'schedule-page', title: 'Open the field calendar', description: 'Schedule is where approved work becomes a date, time, address, and customer commitment.' },
  { id: 'schedule-builder', section: 'schedule', page: 'schedule', target: 'schedule-builder', fallbackTarget: 'schedule-page', title: 'Book an appointment', description: 'Choose a customer, enter the work, set start and end times, and add private appointment notes.' },
  { id: 'schedule-conflicts', section: 'schedule', page: 'schedule', target: 'schedule-time', fallbackTarget: 'schedule-builder', title: 'Prevent double-booking', description: 'Owner Hub checks that the end is after the start and warns when an appointment overlaps existing work.' },
  { id: 'schedule-agenda', section: 'schedule', page: 'schedule', target: 'schedule-agenda', fallbackTarget: 'schedule-page', title: 'Run the day from the agenda', description: 'Appointments are grouped by date with customer, time, address, status, and field actions.' },
  { id: 'schedule-messages', section: 'schedule', page: 'schedule', target: 'schedule-agenda', fallbackTarget: 'schedule-page', title: 'Prepare confirmations and reminders', description: 'Confirmation, reminder, and on-my-way actions prepare a message for review. The tutorial never sends one.' },

  { id: 'estimates-navigation', section: 'estimates', page: 'documents', target: 'nav-documents', fallbackTarget: 'documents-page', title: 'Open Estimates & invoices', description: 'Both customer document types live together so the workflow stays connected.' },
  { id: 'document-tabs', section: 'estimates', page: 'documents', target: 'document-tabs', fallbackTarget: 'documents-page', title: 'Switch between estimates and invoices', description: 'The active tab is saved, so reloading the page returns you to the document type you were using.' },
  { id: 'estimates-list', section: 'estimates', page: 'documents', target: 'estimates-page', fallbackTarget: 'documents-page', title: 'Track every estimate', description: 'The list shows customer, job, dates, services, total, status, PDFs, delivery, and next-step actions.' },
  { id: 'estimate-status', section: 'estimates', page: 'documents', target: 'estimate-status', fallbackTarget: 'estimates-page', title: 'Keep the estimate status accurate', description: 'Use Draft, Sent, Approved, or Declined. A recorded customer approval locks its accepted snapshot.' },
  { id: 'estimate-send', section: 'estimates', page: 'documents', target: 'send-estimate', fallbackTarget: 'estimates-page', title: 'Text the latest saved estimate', description: 'Text estimate saves the current customer-facing record before opening a ready-to-review SMS.' },
  { id: 'estimate-next-actions', section: 'estimates', page: 'documents', target: 'estimate-next-actions', fallbackTarget: 'estimates-page', title: 'Move approved work forward', description: 'An approved estimate can become a Job workspace or an invoice. Duplicate creates a separate reusable draft.' },
  { id: 'new-estimate', section: 'estimates', page: 'documents', target: 'new-estimate-page', fallbackTarget: 'new-estimate', title: 'Create a new estimate', description: 'Start with a customer so contact details, address, and Customer Hub delivery stay connected.' },
  { id: 'estimate-builder', section: 'estimates', page: 'documents', target: 'estimate-builder', fallbackTarget: 'new-estimate-page', title: 'Build the document without saving yet', description: 'The builder is a safe draft until you choose Create estimate. This tutorial will not submit it.', action: { type: 'activate-target', target: 'new-estimate-page' } },
  { id: 'estimate-basics', section: 'estimates', page: 'documents', target: 'estimate-basics', fallbackTarget: 'estimate-builder', title: 'Connect the customer and job', description: 'Choose the customer, job title, issue date, and valid-through date before pricing the work.' },
  { id: 'estimate-ai-assistant', section: 'estimates', page: 'documents', target: 'estimate-ai-assistant', fallbackTarget: 'estimate-builder', title: 'AI help stays editable', description: 'Typed notes, voice, and job photos can produce a draft. Review everything before using it.' },
  { id: 'estimate-line-items', section: 'estimates', page: 'documents', target: 'estimate-line-items', fallbackTarget: 'estimate-builder', title: 'Price exactly what you are selling', description: 'Every line has a service, quantity, unit, unit price, and calculated total. Add or remove lines as needed.' },
  { id: 'estimate-notes', section: 'estimates', page: 'documents', target: 'estimate-scope-notes', fallbackTarget: 'estimate-builder', title: 'Define scope and exclusions clearly', description: 'Customer scope explains included work. Exclusions and notes prevent assumptions about hidden or additional work.' },
  { id: 'estimate-pricing', section: 'estimates', page: 'documents', target: 'estimate-pricing', fallbackTarget: 'estimate-builder', title: 'Review tax, discount, and total', description: 'Confirm the all-in customer price, tax, discount, material cost, reserve, and contractor-only pricing guidance.' },
  { id: 'estimate-save', section: 'estimates', page: 'documents', target: 'estimate-save', fallbackTarget: 'estimate-builder', title: 'Save only after the review', description: 'Create estimate stores the document. Cancel closes this unsaved draft. The tutorial will not press either action.' },

  { id: 'ai-navigation', section: 'ai-estimating', page: 'walkthrough', target: 'nav-walkthrough', fallbackTarget: 'walkthrough-page', title: 'Open AI Walkthrough', description: 'Use the field workflow when speaking and photographing the job is faster than building line items by hand.' },
  { id: 'ai-customer-job', section: 'ai-estimating', page: 'walkthrough', target: 'walkthrough-customer', fallbackTarget: 'walkthrough-page', title: 'Anchor the walkthrough to a customer', description: 'Choose the customer, service address, property type, and job category before analysis.' },
  { id: 'ai-voice', section: 'ai-estimating', page: 'walkthrough', target: 'walkthrough-voice', fallbackTarget: 'walkthrough-page', title: 'Talk through the real scope', description: 'Describe requested work, measurements, materials, access, damage, finish, and exclusions in plain language.' },
  { id: 'ai-photos', section: 'ai-estimating', page: 'walkthrough', target: 'walkthrough-photos', fallbackTarget: 'walkthrough-page', title: 'Add up to 10 private job photos', description: 'Photos give the estimator visible context and stay connected to the business photo library.', tip: 'Verify measurements and concealed conditions onsite even when photos are clear.' },
  { id: 'ai-analyze', section: 'ai-estimating', page: 'walkthrough', target: 'walkthrough-analyze', fallbackTarget: 'walkthrough-page', title: 'Finish and analyze', description: 'The AI creates exact-scope draft pricing from what you supplied. It does not automatically promise work to the customer.' },
  { id: 'ai-review', section: 'ai-estimating', page: 'walkthrough', target: 'walkthrough-results', fallbackTarget: 'walkthrough-analyze', title: 'Owner review is required', description: 'Review the scope, exclusions, warnings, customer total, labor, materials, and optional upsells before creating a draft estimate.', tip: 'Every jobsite is different. Treat AI output as a draft, not an inspection or guarantee.' },

  { id: 'communication-contact', section: 'communication', page: 'customers', target: 'customer-records', fallbackTarget: 'customers-page', title: 'Good contact data powers communication', description: 'Owner Hub uses the phone and email saved on the customer record when preparing document and Customer Hub handoffs.' },
  { id: 'communication-estimate', section: 'communication', page: 'documents', target: 'send-estimate', fallbackTarget: 'estimates-page', title: 'Customer links stay public and secure', description: 'Document texts use Customer Hub links, never an internal Owner Hub workspace address.' },
  { id: 'communication-safety', section: 'communication', page: 'documents', target: 'estimates-page', title: 'You stay in control of Send', description: 'Owner Hub opens your phone or email composer with a prepared message. Review the recipient and wording before you tap Send.' },

  { id: 'hub-entry', section: 'customer-hub', page: 'customers', target: 'customer-hub', fallbackTarget: 'customers-page', title: 'Customer Hub is the customer’s secure doorway', description: 'Open a customer profile and choose Text Customer Hub to prepare their private link.' },
  { id: 'hub-documents', section: 'customer-hub', page: 'customers', target: 'customer-profile', fallbackTarget: 'customers-page', title: 'Customers see only shared information', description: 'The Hub can show appointments, estimates, approvals, job progress, invoices, balances, and payment access without exposing contractor-only costs.' },
  { id: 'hub-refresh', section: 'customer-hub', page: 'customers', target: 'customer-profile', fallbackTarget: 'customers-page', title: 'Updates follow the same customer', description: 'When shared records change and sync, the customer’s Hub loads the current customer-facing information.' },

  { id: 'invoices-tab', section: 'invoices', page: 'documents', target: 'invoices-tab', fallbackTarget: 'document-tabs', title: 'Open Invoices', description: 'Invoices share the document workspace with estimates.' },
  { id: 'invoices-list', section: 'invoices', page: 'documents', target: 'invoices-page', fallbackTarget: 'documents-page', title: 'Track what is owed and paid', description: 'Invoice cards show due date, total, paid amount, balance, status, PDFs, delivery, and payment actions.', action: { type: 'activate-target', target: 'invoices-tab' } },
  { id: 'invoice-create', section: 'invoices', page: 'documents', target: 'new-invoice', fallbackTarget: 'invoices-page', title: 'Create manually or convert approved work', description: 'New invoice starts a blank billing document. Estimate conversion carries connected customer and scope forward.' },
  { id: 'invoice-status', section: 'invoices', page: 'documents', target: 'invoice-status', fallbackTarget: 'invoices-page', title: 'Keep billing status visible', description: 'Update Draft, Sent, Partial, Paid, Overdue, or Void directly from the invoice card.' },
  { id: 'invoice-send', section: 'invoices', page: 'documents', target: 'send-invoice', fallbackTarget: 'invoices-page', title: 'Text the invoice securely', description: 'Text invoice saves the current document and prepares the customer’s message without this tutorial sending anything.' },
  { id: 'invoice-square', section: 'invoices', page: 'documents', target: 'square-payment', fallbackTarget: 'invoices-page', title: 'Square checkout starts when needed', description: 'For an eligible unpaid invoice, Pay with Square creates or refreshes checkout. Card details stay with Square.' },
  { id: 'invoice-payments', section: 'invoices', page: 'documents', target: 'record-payment', fallbackTarget: 'invoices-page', title: 'Record every payment method', description: 'Record cash, check, card, or other payments and let Owner Hub calculate the remaining balance.' },
  { id: 'invoice-pdf', section: 'invoices', page: 'documents', target: 'invoice-actions', fallbackTarget: 'invoices-page', title: 'Professional PDFs stay attached', description: 'Preview, save, share, or print the customer invoice and keep a copy in the PDF archive.' },

  { id: 'jobs-navigation', section: 'jobs', page: 'jobs', target: 'nav-jobs', fallbackTarget: 'jobs-page', title: 'Approved work becomes a Job', description: 'Mark an estimate Approved, then Create job to open a field workspace.' },
  { id: 'jobs-workspace', section: 'jobs', page: 'jobs', target: 'jobs-workspace', fallbackTarget: 'jobs-page', title: 'Run the job from one place', description: 'Job Mode keeps accepted scope, internal notes, field time, photos, and actual profitability together.' },
  { id: 'jobs-field-actions', section: 'jobs', page: 'jobs', target: 'job-field-actions', fallbackTarget: 'jobs-workspace', title: 'Track field progress', description: 'Start or pause time, attach job photos, complete work, and deliberately delete test or unwanted work.' },
  { id: 'jobs-costs', section: 'jobs', page: 'jobs', target: 'job-costs', fallbackTarget: 'jobs-workspace', title: 'Capture actual costs and changes', description: 'Track expenses, material readiness, change orders, approval, labor, profit, and final invoice readiness.' },

  { id: 'inbox-navigation', section: 'inbox', page: 'inbox', target: 'nav-inbox', fallbackTarget: 'inbox-page', title: 'Website requests arrive in Inbox', description: 'New estimate requests appear here automatically so a lead is not lost in email.' },
  { id: 'inbox-search', section: 'inbox', page: 'inbox', target: 'inbox-toolbar', fallbackTarget: 'inbox-page', title: 'Search and filter leads', description: 'Use Inbox, New, Flagged, Archived, or All to focus the list.' },
  { id: 'inbox-leads', section: 'inbox', page: 'inbox', target: 'lead-list', fallbackTarget: 'inbox-page', title: 'Open the complete request', description: 'A lead includes contact details, requested service, description, address, photos, source, and activity.' },
  { id: 'inbox-convert', section: 'inbox', page: 'inbox', target: 'lead-list', fallbackTarget: 'inbox-page', title: 'Convert without retyping', description: 'Open a lead to create the customer and a connected estimate, then add pricing before sending.' },
  { id: 'inbox-manage', section: 'inbox', page: 'inbox', target: 'inbox-filters', fallbackTarget: 'inbox-toolbar', title: 'Flag, archive, restore, or delete', description: 'Use flags for attention, archive completed follow-up, and delete test leads only after confirmation.' },

  { id: 'photos-navigation', section: 'photos-documents', page: 'photos', target: 'nav-photos', fallbackTarget: 'photos-page', title: 'Keep a private photo library', description: 'Store before, progress, after, receipt, and general job photos with customer and job context.' },
  { id: 'photos-upload', section: 'photos-documents', page: 'photos', target: 'photo-upload', fallbackTarget: 'photos-page', title: 'Capture useful photo details', description: 'Assign the customer, job, category, date, and caption before choosing gallery images or taking a photo.' },
  { id: 'photos-library', section: 'photos-documents', page: 'photos', target: 'photo-library', fallbackTarget: 'photos-page', title: 'Find and reuse saved evidence', description: 'Search or filter private photos, check cloud status, preview details, retry uploads, and delete deliberately.' },
  { id: 'archive-navigation', section: 'photos-documents', page: 'archive', target: 'nav-archive', fallbackTarget: 'pdf-archive-page', title: 'Generated PDFs stay in the archive', description: 'PDF copies created from estimates and invoices can be previewed, saved, sent, printed, searched, or deleted.' },
  { id: 'archive-actions', section: 'photos-documents', page: 'archive', target: 'pdf-archive-actions', fallbackTarget: 'pdf-archive-page', title: 'Use the right PDF action', description: 'Preview checks the document, Save downloads it, Send opens device sharing, and Print uses the available print path.' },

  { id: 'pricing-navigation', section: 'pricing', page: 'pricing', target: 'nav-pricing', fallbackTarget: 'pricing-page', title: 'Build pricing from your own history', description: 'Smart pricing uses your pricebook and completed work instead of generic claims.' },
  { id: 'pricebook', section: 'pricing', page: 'pricing', target: 'pricebook', fallbackTarget: 'pricing-page', title: 'Maintain reusable cost and price references', description: 'Store internal unit cost separately from customer unit price. Active matches can guide AI estimates.' },
  { id: 'price-history', section: 'pricing', page: 'pricing', target: 'price-history', fallbackTarget: 'pricing-page', title: 'Quote consistently from completed work', description: 'Search similar jobs to compare totals, materials, and gross profit before choosing a price.' },

  { id: 'settings-navigation', section: 'settings', page: 'settings', target: 'nav-settings', fallbackTarget: 'settings-page', title: 'Settings controls new-work defaults', description: 'Changes here affect new records while existing estimates and invoices stay unchanged.' },
  { id: 'settings-profile', section: 'settings', page: 'settings', target: 'settings-profile', fallbackTarget: 'settings-page', title: 'Set the branded business identity', description: 'Business name, contact details, and address become the source of truth for customer documents.' },
  { id: 'settings-documents', section: 'settings', page: 'settings', target: 'settings-document-defaults', fallbackTarget: 'settings-page', title: 'Choose document defaults', description: 'Set tax, reserve, due days, prefixes, and the terms that new estimates and invoices start with.' },
  { id: 'settings-pricing', section: 'settings', page: 'settings', target: 'settings-pricing-defaults', fallbackTarget: 'settings-page', title: 'Protect pricing without hiding the math', description: 'Configure labor cost, minimums, premiums, processing allowance, margin, delivery, and disposal defaults.' },
  { id: 'settings-communication', section: 'settings', page: 'settings', target: 'settings-preferences', fallbackTarget: 'settings-page', title: 'Choose communication and appearance preferences', description: 'Control business email notifications, dark mode, and new lead alerts.' },
  { id: 'settings-sync-backup', section: 'settings', page: 'settings', target: 'settings-data-safety', fallbackTarget: 'settings-page', title: 'Sync and back up business data', description: 'Check cloud status, request a sync, and download a portable JSON backup for your records.' },
  { id: 'settings-tutorial', section: 'settings', page: 'settings', target: 'tutorial-settings-card', fallbackTarget: 'settings-page', title: 'Tutorial help always stays here', description: 'Resume or restart the complete tour, or learn only the feature you need.' },

  { id: 'business-navigation', section: 'business', page: 'business', target: 'nav-business', fallbackTarget: 'business-page', title: 'Open Business & billing', description: 'This workspace area manages subscription-level setup, usage, team access, and integrations.' },
  { id: 'business-usage', section: 'business', page: 'business', target: 'business-usage', fallbackTarget: 'business-page', title: 'Understand plan usage', description: 'See AI estimates, transcriptions, photo storage, seats, texts, and emails against the active plan.' },
  { id: 'business-square', section: 'business', page: 'business', target: 'business-square', fallbackTarget: 'business-page', title: 'Connect the business’s Square account', description: 'Each subscriber connects their own Square merchant. Credentials remain encrypted server-side.' },
  { id: 'business-team', section: 'business', page: 'business', target: 'business-team', fallbackTarget: 'business-page', title: 'Control team access', description: 'Owners can invite technicians or administrators, change roles, and remove access deliberately.' },
  { id: 'business-account', section: 'business', page: 'business', target: 'business-account', fallbackTarget: 'business-page', title: 'Privacy and account control stay visible', description: 'Support, privacy, terms, subscription controls, and verified account deletion live here.' },

  { id: 'complete', section: 'finish', page: 'home', placement: 'center', title: "You're ready", description: 'The core workflow is Customer → Estimate → Send → Job → Invoice → Get paid, with Customer Hub keeping the customer connected.' },
]

export const safeTutorialActionTargets = new Set([
  'add-customer',
  'new-estimate-page',
  'invoices-tab',
])

export const tutorialSectionForPage: Partial<Record<PageName, TutorialSectionId>> = {
  home: 'overview',
  customers: 'customers',
  schedule: 'schedule',
  walkthrough: 'ai-estimating',
  jobs: 'jobs',
  documents: 'estimates',
  archive: 'photos-documents',
  pricing: 'pricing',
  inbox: 'inbox',
  photos: 'photos-documents',
  settings: 'settings',
  business: 'business',
}

export function stepsForSection(sectionId: TutorialSectionId) {
  return tutorialSteps.filter((step) => step.section === sectionId)
}
