import { loadCommunications } from '../../communications/data/communicationStore'
import { loadCustomers } from '../../customers/data/customerStore'
import { loadEstimates } from '../../estimates/data/estimateStore'
import { loadExpenses } from '../../expenses/data/expenseStore'
import { loadInvoices } from '../../invoices/data/invoiceStore'
import { loadJobs } from '../../jobs/data/jobStore'
import { loadLeads } from '../../leads/data/leadStore'
import { loadPhotos } from '../../photos/data/photoStore'
import { loadBusinessSettings } from '../../settings/data/businessSettingsStore'
import type { OperationsSnapshot } from './recommendationEngine'

export function loadOperationsSnapshot(): OperationsSnapshot {
  const settings = loadBusinessSettings()

  return {
    customers: loadCustomers(),
    estimates: loadEstimates(),
    invoices: loadInvoices(),
    jobs: loadJobs(),
    expenses: loadExpenses(),
    photos: loadPhotos(),
    communications: loadCommunications(),
    leads: loadLeads(),
    internalLaborCostPerHour: settings.internalLaborCostPerHour,
    targetGrossMarginPercent: settings.targetGrossMarginPercent,
  }
}
