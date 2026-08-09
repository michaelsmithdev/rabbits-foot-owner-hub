import {
  useEffect,
  useMemo,
  useState,
} from 'react'
import { Trash2 } from 'lucide-react'

import Invoices from '../../invoices/pages/Invoices'
import DocumentPdfActions from '../../documents/components/DocumentPdfActions'
import PricingInsightPanel from '../../pricing/components/PricingInsightPanel'
import ProfitGuard from '../components/ProfitGuard'
import AiEstimateAssistant from '../ai/AiEstimateAssistant'
import type { AiEstimateEconomics, AiEstimateGeneration } from '../ai/types'

import {
  createInvoiceNumber,
  loadInvoices,
  saveInvoices,
} from '../../invoices/data/invoiceStore'

import type { Invoice } from '../../invoices/types/Invoice'

import { loadCustomers } from '../../customers/data/customerStore'

import type { Customer } from '../../customers/types/Customer'
import { loadBusinessSettings } from '../../settings/data/businessSettingsStore'
import { createJobFromEstimate, loadJobs, saveJobs } from '../../jobs/data/jobStore'
import { applyPaymentOverheadToLineItems } from '../../pricing/utils/paymentOverhead'

import {
  createEstimateNumber,
  createRevisionNumber,
  loadEstimates,
  saveEstimates,
} from '../data/estimateStore'

import type {
  Estimate,
  EstimateApprovalMethod,
  EstimateLineItem,
} from '../types/Estimate'

import '../styles/Estimates.css'

type EstimatesProps = {
  initialCustomerId: string | null
  initialDocumentId?: string | null
  initialDocumentKind?: 'estimate' | 'invoice' | null
  openBuilderOnMount?: boolean
}

type ServiceOption = {
  description: string
  rate: number
}

type DocumentTab = 'estimates' | 'invoices'

const CUSTOM_OPTION = '__custom__'
const DOCUMENT_TAB_STORAGE_KEY = 'rabbit-foot-owner-hub-document-tab'

function loadDocumentTab(): DocumentTab {
  try {
    return window.localStorage.getItem(DOCUMENT_TAB_STORAGE_KEY) === 'invoices'
      ? 'invoices'
      : 'estimates'
  } catch {
    return 'estimates'
  }
}

function saveDocumentTab(tab: DocumentTab): void {
  try {
    window.localStorage.setItem(DOCUMENT_TAB_STORAGE_KEY, tab)
  } catch {
    // The page still works when storage is unavailable or blocked.
  }
}

const JOB_NAME_OPTIONS = [
  'General Handyman Service',
  'Drywall Repair',
  'Interior Painting',
  'Exterior Painting',
  'Door Installation',
  'Door Repair',
  'Window Repair',
  'Trim and Baseboard Installation',
  'Flooring Installation',
  'Flooring Repair',
  'Furniture Assembly',
  'TV Mounting',
  'Shelf Installation',
  'Cabinet Installation',
  'Cabinet Repair',
  'Faucet Replacement',
  'Sink Installation',
  'Toilet Repair',
  'Toilet Installation',
  'Garbage Disposal Installation',
  'Ceiling Fan Installation',
  'Light Fixture Installation',
  'Outlet and Switch Replacement',
  'Deck Repair',
  'Fence Repair',
  'Pressure Washing',
  'Gutter Cleaning',
  'Appliance Installation',
  'Bathroom Repair',
  'Kitchen Repair',
]

const SERVICE_OPTIONS: ServiceOption[] = [
  {
    description: 'General handyman labor',
    rate: 75,
  },
  {
    description:
      'Service call and job-site assessment',
    rate: 75,
  },
  {
    description: 'Remove damaged material',
    rate: 75,
  },
  {
    description: 'Prepare work area',
    rate: 65,
  },
  {
    description:
      'Install customer-supplied materials',
    rate: 75,
  },
  {
    description:
      'Supply and install required materials',
    rate: 75,
  },
  {
    description:
      'Patch drywall holes and cracks',
    rate: 75,
  },
  {
    description:
      'Sand and prepare repaired surface',
    rate: 65,
  },
  {
    description: 'Prime repaired surface',
    rate: 65,
  },
  {
    description: 'Apply interior paint',
    rate: 70,
  },
  {
    description: 'Apply exterior paint',
    rate: 75,
  },
  {
    description:
      'Remove and replace damaged door',
    rate: 85,
  },
  {
    description:
      'Adjust door hinges and latch',
    rate: 75,
  },
  {
    description:
      'Install trim or baseboards',
    rate: 75,
  },
  {
    description: 'Remove damaged flooring',
    rate: 75,
  },
  {
    description: 'Prepare subfloor',
    rate: 80,
  },
  {
    description:
      'Install replacement flooring',
    rate: 85,
  },
  {
    description:
      'Assemble customer-supplied furniture',
    rate: 65,
  },
  {
    description: 'Mount television',
    rate: 85,
  },
  {
    description:
      'Install shelving and wall anchors',
    rate: 75,
  },
  {
    description:
      'Install or repair cabinets',
    rate: 85,
  },
  {
    description: 'Replace faucet',
    rate: 85,
  },
  {
    description: 'Replace toilet',
    rate: 90,
  },
  {
    description: 'Repair toilet components',
    rate: 80,
  },
  {
    description: 'Install garbage disposal',
    rate: 95,
  },
  {
    description: 'Install ceiling fan',
    rate: 90,
  },
  {
    description: 'Install light fixture',
    rate: 85,
  },
  {
    description: 'Replace outlet or switch',
    rate: 85,
  },
  {
    description: 'Repair deck boards',
    rate: 80,
  },
  {
    description:
      'Repair fence boards or posts',
    rate: 80,
  },
  {
    description:
      'Pressure wash exterior surface',
    rate: 85,
  },
  {
    description: 'Clean gutters',
    rate: 75,
  },
  {
    description:
      'Final cleanup and debris removal',
    rate: 60,
  },
]

const SERVICE_DESCRIPTIONS =
  SERVICE_OPTIONS.map(
    (service) => service.description,
  )

function createId(): string {
  return `${Date.now()}-${Math.random()
    .toString(36)
    .slice(2)}`
}

function getTodayDate(): string {
  return new Date().toISOString().split('T')[0]
}

function getExpirationDate(validDays = 30): string {
  const date = new Date()

  date.setDate(date.getDate() + validDays)

  return date.toISOString().split('T')[0]
}

function createEmptyLineItem(): EstimateLineItem {
  return {
    id: createId(),
    description: '',
    quantity: 1,
    unit: 'hour',
    unitPrice: 0,
  }
}

function formatCustomerAddress(
  customer: Customer,
): string {
  const cityStateZip = [
    customer.city,
    customer.state,
    customer.zipCode,
  ]
    .filter(Boolean)
    .join(' ')

  return [
    customer.streetAddress,
    cityStateZip,
  ]
    .filter(Boolean)
    .join(', ')
}

function getMatchingOption(
  value: string,
  options: string[],
): string {
  if (!value) {
    return ''
  }

  return options.includes(value)
    ? value
    : CUSTOM_OPTION
}

function Estimates({
  initialCustomerId,
  initialDocumentId = null,
  initialDocumentKind = null,
  openBuilderOnMount = false,
}: EstimatesProps) {
  const businessSettings = useMemo(() => loadBusinessSettings(), [])
  const [
    activeDocumentTab,
    setActiveDocumentTab,
  ] = useState<DocumentTab>(
    initialDocumentKind === 'invoice'
      ? 'invoices'
      : initialDocumentKind === 'estimate'
        ? 'estimates'
        : loadDocumentTab(),
  )

  const [customers] = useState<Customer[]>(
    () => loadCustomers(),
  )

  const [estimates, setEstimates] = useState<
    Estimate[]
  >(() => loadEstimates())

  const initialEstimate =
    initialDocumentKind === 'estimate' && initialDocumentId
      ? estimates.find((estimate) => estimate.id === initialDocumentId)
      : undefined

  const [
    printEstimateId,
  ] = useState<string | null>(null)

  const [isBuilderOpen, setIsBuilderOpen] =
    useState(openBuilderOnMount || Boolean(initialEstimate))

  const [
    editingEstimateId,
    setEditingEstimateId,
  ] = useState<string | null>(initialEstimate?.id ?? null)

  const [
    selectedCustomerId,
    setSelectedCustomerId,
  ] = useState(initialEstimate?.customerId ?? initialCustomerId ?? '')

  const [jobName, setJobName] = useState(initialEstimate?.jobName ?? '')

  const [
    selectedJobNameOption,
    setSelectedJobNameOption,
  ] = useState(() =>
    initialEstimate
      ? getMatchingOption(initialEstimate.jobName, JOB_NAME_OPTIONS)
      : '',
  )

  const [serviceAddress, setServiceAddress] =
    useState(() => {
      if (initialEstimate) return initialEstimate.serviceAddress

      const initialCustomer = customers.find(
        (customer) => customer.id === initialCustomerId,
      )

      return initialCustomer
        ? formatCustomerAddress(initialCustomer)
        : ''
    })

  const [description, setDescription] =
    useState(initialEstimate?.description ?? '')
  const [scopeOfWork, setScopeOfWork] = useState(initialEstimate?.scopeOfWork ?? '')
  const [exclusions, setExclusions] = useState<string[]>(initialEstimate?.exclusions ?? [])

  const [issueDate, setIssueDate] =
    useState(initialEstimate?.issueDate ?? getTodayDate())

  const [expirationDate, setExpirationDate] =
    useState(() => initialEstimate?.expirationDate ?? getExpirationDate(businessSettings.estimateValidDays))

  const [lineItems, setLineItems] = useState<
    EstimateLineItem[]
  >(() => initialEstimate?.lineItems.length
    ? initialEstimate.lineItems.map((lineItem) => ({ ...lineItem }))
    : [createEmptyLineItem()])

  const [taxRate, setTaxRate] = useState(initialEstimate?.taxRate ?? businessSettings.defaultTaxRate)

  const [discount, setDiscount] = useState(initialEstimate?.discount ?? 0)

  const [notes, setNotes] = useState(initialEstimate?.notes || businessSettings.estimateTerms)
  const [propertyType, setPropertyType] = useState<'residential' | 'commercial'>(initialEstimate?.propertyType ?? 'residential')
  const [jobCategory, setJobCategory] = useState(initialEstimate?.jobCategory ?? 'General handyman')
  const [materialCost, setMaterialCost] = useState(initialEstimate?.materialCost ?? 0)
  const [taxReservePercent, setTaxReservePercent] = useState(initialEstimate?.taxReservePercent ?? businessSettings.defaultTaxReservePercent)
  const [aiGeneration, setAiGeneration] = useState<AiEstimateGeneration | null>(initialEstimate?.aiEstimate ?? null)
  const [economics, setEconomics] = useState<AiEstimateEconomics | null>(initialEstimate?.economics ?? initialEstimate?.aiEstimate?.draft.economics ?? null)

  const [formError, setFormError] = useState('')

  const [saveMessage, setSaveMessage] =
    useState('')

  const [approvalEstimateId, setApprovalEstimateId] = useState<string | null>(null)
  const [approvalCustomerName, setApprovalCustomerName] = useState('')
  const [approvalMethod, setApprovalMethod] = useState<EstimateApprovalMethod>('signed_in_person')
  const [approvalNote, setApprovalNote] = useState('')
  const [approvalError, setApprovalError] = useState('')

  useEffect(() => {
    saveEstimates(estimates)
  }, [estimates])

  useEffect(() => {
    saveDocumentTab(activeDocumentTab)
  }, [activeDocumentTab])

  useEffect(() => {
    if (!isBuilderOpen) {
      return
    }

    function handleEscape(
      event: KeyboardEvent,
    ) {
      if (event.key === 'Escape') {
        setIsBuilderOpen(false)
      }
    }

    document.addEventListener(
      'keydown',
      handleEscape,
    )

    return () => {
      document.removeEventListener(
        'keydown',
        handleEscape,
      )
    }
  }, [isBuilderOpen])

  const selectedCustomer = useMemo(() => {
    return (
      customers.find(
        (customer) =>
          customer.id === selectedCustomerId,
      ) ?? null
    )
  }, [customers, selectedCustomerId])

  const editingEstimate = useMemo(() => {
    if (!editingEstimateId) {
      return null
    }

    return (
      estimates.find(
        (estimate) =>
          estimate.id === editingEstimateId,
      ) ?? null
    )
  }, [editingEstimateId, estimates])

  const subtotal = useMemo(() => {
    return lineItems.reduce(
      (total, item) =>
        total +
        Number(item.quantity || 0) *
          Number(item.unitPrice || 0),
      0,
    )
  }, [lineItems])

  const customerSubtotal = useMemo(() => {
    if (editingEstimateId) return subtotal

    return applyPaymentOverheadToLineItems(
      lineItems,
      businessSettings.paymentProcessingOverheadPercent,
    ).reduce(
      (total, item) =>
        total +
        Number(item.quantity || 0) *
          Number(item.unitPrice || 0),
      0,
    )
  }, [businessSettings.paymentProcessingOverheadPercent, editingEstimateId, lineItems, subtotal])

  const taxAmount = useMemo(() => {
    return customerSubtotal * (taxRate / 100)
  }, [customerSubtotal, taxRate])

  const grandTotal = useMemo(() => {
    return Math.max(
      0,
      customerSubtotal + taxAmount - discount,
    )
  }, [customerSubtotal, taxAmount, discount])

  function formatCurrency(
    value: number,
  ): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(value)
  }

  function formatDate(
    dateValue: string,
  ): string {
    const date = new Date(
      `${dateValue}T00:00:00`,
    )

    if (Number.isNaN(date.getTime())) {
      return dateValue
    }

    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(date)
  }

  function resetBuilder(): void {
    setEditingEstimateId(null)
    setSelectedCustomerId('')
    setJobName('')
    setSelectedJobNameOption('')
    setServiceAddress('')
    setDescription('')
    setScopeOfWork('')
    setExclusions([])
    setIssueDate(getTodayDate())
    setExpirationDate(getExpirationDate(businessSettings.estimateValidDays))
    setLineItems([createEmptyLineItem()])
    setTaxRate(businessSettings.defaultTaxRate)
    setDiscount(0)
    setNotes(businessSettings.estimateTerms)
    setPropertyType('residential')
    setJobCategory('General handyman')
    setMaterialCost(0)
    setTaxReservePercent(businessSettings.defaultTaxReservePercent)
    setAiGeneration(null)
    setEconomics(null)
    setFormError('')
    setSaveMessage('')
  }

  function startNewEstimate(): void {
    resetBuilder()
    setIsBuilderOpen(true)
  }

  function cancelBuilder(): void {
    resetBuilder()
    setIsBuilderOpen(false)
  }

  function editEstimate(
    estimate: Estimate,
  ): void {
    setEditingEstimateId(estimate.id)

    setSelectedCustomerId(
      estimate.customerId,
    )

    setJobName(estimate.jobName)

    setSelectedJobNameOption(
      getMatchingOption(
        estimate.jobName,
        JOB_NAME_OPTIONS,
      ),
    )

    setServiceAddress(
      estimate.serviceAddress,
    )

    setDescription(estimate.description)
    setScopeOfWork(estimate.scopeOfWork ?? '')
    setExclusions(estimate.exclusions ?? [])

    setIssueDate(estimate.issueDate)

    setExpirationDate(
      estimate.expirationDate,
    )

    setLineItems(
      estimate.lineItems.length > 0
        ? estimate.lineItems.map((item) => ({
            ...item,
          }))
        : [createEmptyLineItem()],
    )

    setTaxRate(estimate.taxRate)
    setDiscount(estimate.discount)

    setNotes(
      estimate.notes ||
        businessSettings.estimateTerms,
    )
    setPropertyType(estimate.propertyType ?? 'residential')
    setJobCategory(estimate.jobCategory ?? 'General handyman')
    setMaterialCost(estimate.materialCost ?? 0)
    setTaxReservePercent(estimate.taxReservePercent ?? businessSettings.defaultTaxReservePercent)
    setAiGeneration(estimate.aiEstimate ?? null)
    setEconomics(estimate.economics ?? estimate.aiEstimate?.draft.economics ?? null)

    setFormError('')
    setSaveMessage('')
    setIsBuilderOpen(true)
  }

  function handleCustomerChange(
    customerId: string,
  ): void {
    setSelectedCustomerId(customerId)

    const customer = customers.find(
      (currentCustomer) =>
        currentCustomer.id === customerId,
    )

    if (customer) {
      setServiceAddress(
        formatCustomerAddress(customer),
      )
    } else {
      setServiceAddress('')
    }
  }

  function handleJobNameSelection(
    value: string,
  ): void {
    setSelectedJobNameOption(value)

    if (value === CUSTOM_OPTION) {
      setJobName('')
      return
    }

    setJobName(value)
  }

  function addLineItem(): void {
    setLineItems((currentItems) => [
      ...currentItems,
      createEmptyLineItem(),
    ])
  }

  function updateLineItem(
    lineItemId: string,
    field: keyof Omit<
      EstimateLineItem,
      'id'
    >,
    value: string,
  ): void {
    setLineItems((currentItems) =>
      currentItems.map((item) => {
        if (item.id !== lineItemId) {
          return item
        }

        if (
          field === 'quantity' ||
          field === 'unitPrice'
        ) {
          const numericValue = Number(value)

          return {
            ...item,
            [field]: Number.isNaN(numericValue)
              ? 0
              : numericValue,
          }
        }

        return {
          ...item,
          [field]: value,
        }
      }),
    )
  }

  function handleDescriptionSelection(
    lineItemId: string,
    value: string,
  ): void {
    if (!value || value === CUSTOM_OPTION) {
      setLineItems((currentItems) =>
        currentItems.map((item) =>
          item.id === lineItemId
            ? {
                ...item,
              description: '',
                unit: 'hour',
                unitPrice: 0,
              }
            : item,
        ),
      )

      return
    }

    const selectedService =
      SERVICE_OPTIONS.find(
        (service) =>
          service.description === value,
      )

    setLineItems((currentItems) =>
      currentItems.map((item) =>
        item.id === lineItemId
          ? {
              ...item,
              description: value,
              unit: 'hour',
              unitPrice:
                selectedService?.rate ?? 0,
            }
          : item,
      ),
    )
  }

  function removeLineItem(
    lineItemId: string,
  ): void {
    if (lineItems.length === 1) {
      setLineItems([createEmptyLineItem()])
      return
    }

    setLineItems((currentItems) =>
      currentItems.filter(
        (item) => item.id !== lineItemId,
      ),
    )
  }

  function validateEstimate(): boolean {
    setFormError('')
    setSaveMessage('')

    if (!selectedCustomerId) {
      setFormError(
        'Select a customer before saving the estimate.',
      )
      return false
    }

    if (!jobName.trim()) {
      setFormError(
        'Select or enter a job title.',
      )
      return false
    }

    if (!issueDate) {
      setFormError(
        'Enter an issue date.',
      )
      return false
    }

    if (!expirationDate) {
      setFormError(
        'Enter an expiration date.',
      )
      return false
    }

    const completedLineItems =
      lineItems.filter(
        (item) =>
          item.description.trim() ||
          item.unitPrice > 0,
      )

    if (completedLineItems.length === 0) {
      setFormError(
        'Add at least one repair or service.',
      )
      return false
    }

    const invalidItem =
      completedLineItems.some(
        (item) =>
          !item.description.trim() ||
          item.quantity <= 0 ||
          item.unitPrice < 0,
      )

    if (invalidItem) {
      setFormError(
        'Each service needs a description, hours above zero, and a valid rate.',
      )
      return false
    }

    if (taxRate < 0) {
      setFormError(
        'Tax rate cannot be negative.',
      )
      return false
    }

    if (discount < 0) {
      setFormError(
        'Discount cannot be negative.',
      )
      return false
    }

    return true
  }

  function saveEstimate(): void {
    if (!validateEstimate()) {
      return
    }

    const completedLineItems =
      lineItems
        .filter(
          (item) =>
            item.description.trim() ||
            item.unitPrice > 0,
        )
        .map((item) => ({
          ...item,
          description:
            item.description.trim(),
        }))

    const newEstimateLineItems =
      applyPaymentOverheadToLineItems(
        completedLineItems,
        businessSettings.paymentProcessingOverheadPercent,
      )

    const currentTimestamp =
      new Date().toISOString()

    if (editingEstimateId) {
      const existingEstimate =
        estimates.find(
          (estimate) =>
            estimate.id === editingEstimateId,
        )

      if (!existingEstimate) {
        setFormError(
          'The estimate could not be found.',
        )
        return
      }

      const updatedEstimate: Estimate = {
        ...existingEstimate,
        customerId: selectedCustomerId,
        jobName: jobName.trim(),
        serviceAddress:
          serviceAddress.trim(),
        description: description.trim(),
        scopeOfWork: scopeOfWork.trim(),
        exclusions: exclusions.map((item) => item.trim()).filter(Boolean),
        issueDate,
        expirationDate,
        lineItems: completedLineItems,
        taxRate,
        discount,
        notes: notes.trim(),
        propertyType,
        jobCategory: jobCategory.trim(),
        materialCost,
        taxReservePercent,

        photoIds: Array.from(
          new Set([
            ...(existingEstimate.photoIds ?? []),
            ...(aiGeneration?.photoIds ?? []),
          ]),
        ),
        aiEstimate: aiGeneration ?? undefined,
        economics: economics ?? undefined,
        updatedAt: currentTimestamp,
      }

      const mustCreateRevision =
        existingEstimate.status === 'approved' ||
        Boolean(existingEstimate.approval) ||
        Boolean(existingEstimate.jobId)

      if (mustCreateRevision) {
        const revision = createRevisionNumber(existingEstimate, estimates)
        const revisedEstimate: Estimate = {
          ...updatedEstimate,
          id: createId(),
          estimateNumber: revision.estimateNumber,
          revisionOfId: existingEstimate.revisionOfId ?? existingEstimate.id,
          revisionNumber: revision.revisionNumber,
          approval: undefined,
          jobId: undefined,
          status: 'draft',
          createdAt: currentTimestamp,
        }
        setEstimates((currentEstimates) => [revisedEstimate, ...currentEstimates])
        setSaveMessage(`${revisedEstimate.estimateNumber} was created. The approved agreement remains unchanged.`)
      } else {
        setEstimates((currentEstimates) =>
          currentEstimates.map((estimate) =>
            estimate.id === editingEstimateId
              ? updatedEstimate
              : estimate,
          ),
        )

        setSaveMessage(
          `${updatedEstimate.estimateNumber} was updated.`,
        )
      }
    } else {
      const newEstimate: Estimate = {
        id: createId(),

        estimateNumber: createEstimateNumber(
          estimates,
          businessSettings.estimatePrefix,
        ),

        customerId: selectedCustomerId,

        jobName: jobName.trim(),

        serviceAddress:
          serviceAddress.trim(),

        description: description.trim(),
        scopeOfWork: scopeOfWork.trim(),
        exclusions: exclusions.map((item) => item.trim()).filter(Boolean),

        issueDate,

        expirationDate,

        lineItems: newEstimateLineItems,

        taxRate,

        discount,

        notes: notes.trim(),

        propertyType,

        jobCategory: jobCategory.trim(),

        materialCost,

        taxReservePercent,

        paymentProcessingOverheadPercent:
          businessSettings.paymentProcessingOverheadPercent,

        photoIds: aiGeneration?.photoIds ? [...aiGeneration.photoIds] : [],

        aiEstimate: aiGeneration ?? undefined,
        economics: economics ?? undefined,

        status: 'draft',

        createdAt: currentTimestamp,

        updatedAt: currentTimestamp,
      }

      setEstimates((currentEstimates) => [
        newEstimate,
        ...currentEstimates,
      ])

      setSaveMessage(
        `${newEstimate.estimateNumber} was created.`,
      )
    }

    window.setTimeout(() => {
      resetBuilder()
      setIsBuilderOpen(false)
    }, 650)
  }

  function convertEstimateToInvoice(
    estimate: Estimate,
  ): void {
    const existingInvoices = loadInvoices()

    const existingInvoice =
      existingInvoices.find(
        (invoice) =>
          invoice.estimateId === estimate.id,
      )

    if (existingInvoice) {
      window.alert(
        `${estimate.estimateNumber} was already converted to ${existingInvoice.invoiceNumber}.`,
      )

      setActiveDocumentTab('invoices')
      return
    }

    const today = new Date()

    const dueDate = new Date(today)

    dueDate.setDate(
      dueDate.getDate() + businessSettings.invoiceDueDays,
    )

    const currentTimestamp =
      new Date().toISOString()

    const newInvoice: Invoice = {
      id: createId(),

      invoiceNumber: createInvoiceNumber(
        existingInvoices,
        businessSettings.invoicePrefix,
      ),

      customerId: estimate.customerId,

      estimateId: estimate.id,

      jobName: estimate.jobName,

      serviceAddress:
        estimate.serviceAddress,

      description: estimate.description,
      scopeOfWork: estimate.scopeOfWork,
      exclusions: estimate.exclusions,

      issueDate:
        today.toISOString().split('T')[0],

      dueDate:
        dueDate.toISOString().split('T')[0],

      lineItems: estimate.lineItems.map(
        (item) => ({
          ...item,
          id: createId(),
        }),
      ),

      taxRate: estimate.taxRate,

      discount: estimate.discount,

      notes: [estimate.notes, businessSettings.invoiceTerms]
        .filter(Boolean)
        .join('\n\n'),

      propertyType: estimate.propertyType ?? 'residential',

      jobCategory: estimate.jobCategory ?? 'General handyman',

      materialCost: estimate.materialCost ?? 0,

      taxReservePercent: estimate.taxReservePercent ?? businessSettings.defaultTaxReservePercent,

      completionDate: estimate.completionDate,

      photoIds: estimate.photoIds ? [...estimate.photoIds] : [],

      aiEstimate: estimate.aiEstimate,

      status: 'draft',

      payments: [],

      createdAt: currentTimestamp,

      updatedAt: currentTimestamp,

      paidAt: null,
    }

    saveInvoices([
      newInvoice,
      ...existingInvoices,
    ])

    window.alert(
      `${newInvoice.invoiceNumber} was created from ${estimate.estimateNumber}.`,
    )

    setActiveDocumentTab('invoices')
  }

  function requestApproval(estimate: Estimate) {
    const approvalCustomer = customers.find((customer) => customer.id === estimate.customerId)
    setApprovalEstimateId(estimate.id)
    setApprovalCustomerName(
      approvalCustomer ? `${approvalCustomer.firstName} ${approvalCustomer.lastName}`.trim() : '',
    )
    setApprovalMethod('signed_in_person')
    setApprovalNote('')
    setApprovalError('')
  }

  function recordApproval() {
    const estimate = estimates.find((item) => item.id === approvalEstimateId)
    const customerName = approvalCustomerName.trim()
    if (!estimate || !customerName) {
      setApprovalError('Enter the approving customer name before saving.')
      return
    }

    const acceptedAt = new Date().toISOString()
    const acceptedAmount = calculateEstimateTotal(estimate)
    setEstimates((current) => current.map((item) => item.id === estimate.id ? {
      ...item,
      status: 'approved',
      approval: {
        customerName,
        method: approvalMethod,
        note: approvalNote.trim(),
        acceptedAt,
        snapshot: {
          estimateNumber: estimate.estimateNumber,
          revisionNumber: estimate.revisionNumber ?? 0,
          customerId: estimate.customerId,
          jobName: estimate.jobName,
          serviceAddress: estimate.serviceAddress,
          scopeOfWork: estimate.scopeOfWork ?? estimate.description,
          exclusions: [...(estimate.exclusions ?? [])],
          lineItems: estimate.lineItems.map((lineItem) => ({ ...lineItem })),
          taxRate: estimate.taxRate,
          discount: estimate.discount,
          acceptedAmount,
        },
      },
      updatedAt: acceptedAt,
    } : item))
    setApprovalEstimateId(null)
    setSaveMessage(`${estimate.estimateNumber} approval was recorded and locked as an immutable snapshot.`)
  }

  function updateEstimateStatus(estimateId: string, status: Estimate['status']) {
    const estimate = estimates.find((item) => item.id === estimateId)
    if (!estimate) return
    if (status === 'approved') {
      requestApproval(estimate)
      return
    }
    if (estimate.approval) return
    const updatedAt = new Date().toISOString()
    setEstimates((current) => current.map((estimate) =>
      estimate.id === estimateId ? { ...estimate, status, updatedAt } : estimate,
    ))
  }

  function createJob(estimate: Estimate) {
    if (estimate.status !== 'approved') {
      window.alert('Mark the estimate Approved before creating the job.')
      return
    }
    const job = createJobFromEstimate(estimate)
    setEstimates((current) => current.map((item) =>
      item.id === estimate.id
        ? { ...item, jobId: job.id, updatedAt: new Date().toISOString() }
        : item,
    ))
    window.location.assign(`${window.location.pathname}#jobs`)
  }

  function duplicateEstimate(
    estimate: Estimate,
  ): void {
    const currentTimestamp =
      new Date().toISOString()

    const duplicatedEstimate: Estimate = {
      ...estimate,

      id: createId(),

      estimateNumber: createEstimateNumber(
        estimates,
        businessSettings.estimatePrefix,
      ),

      jobName: `${estimate.jobName} Copy`,

      jobId: undefined,

      walkthroughId: undefined,

      status: 'draft',

      createdAt: currentTimestamp,

      updatedAt: currentTimestamp,

      lineItems: estimate.lineItems.map(
        (item) => ({
          ...item,
          id: createId(),
        }),
      ),
    }

    setEstimates((currentEstimates) => [
      duplicatedEstimate,
      ...currentEstimates,
    ])
  }

  function deleteEstimate(
    estimateId: string,
  ): void {
    const estimate = estimates.find(
      (currentEstimate) =>
        currentEstimate.id === estimateId,
    )

    if (!estimate) {
      return
    }

    const existingInvoice =
      loadInvoices().find(
        (invoice) =>
          invoice.estimateId === estimateId,
      )

    if (existingInvoice) {
      window.alert(
        `${estimate.estimateNumber} cannot be deleted because it was converted to ${existingInvoice.invoiceNumber}.`,
      )
      return
    }

    const currentJobs = loadJobs()
    const existingJob = currentJobs.find((job) => job.estimateId === estimateId)

    const confirmed = window.confirm(
      existingJob
        ? `Delete ${estimate.estimateNumber} and its linked ${existingJob.jobNumber}? This removes the accepted/completed work record and cannot be undone.`
        : `Delete ${estimate.estimateNumber}? This cannot be undone.`,
    )

    if (!confirmed) {
      return
    }

    if (existingJob) {
      saveJobs(currentJobs.filter((job) => job.id !== existingJob.id))
    }

    setEstimates((currentEstimates) =>
      currentEstimates.filter(
        (currentEstimate) =>
          currentEstimate.id !== estimateId,
      ),
    )
  }

  function getCustomerName(
    customerId: string,
  ): string {
    const customer = customers.find(
      (currentCustomer) =>
        currentCustomer.id === customerId,
    )

    if (!customer) {
      return 'Unknown customer'
    }

    return `${customer.firstName} ${customer.lastName}`
  }

  function calculateEstimateTotal(
    estimate: Estimate,
  ): number {
    const estimateSubtotal =
      calculateEstimateSubtotal(estimate)

    const estimateTax =
      estimateSubtotal *
      (estimate.taxRate / 100)

    return Math.max(
      0,
      estimateSubtotal +
        estimateTax -
        estimate.discount,
    )
  }

  function applyAiGeneration(generation: AiEstimateGeneration): void {
    const result = generation.draft

    setAiGeneration(generation)
    setJobName(result.jobTitle)
    setSelectedJobNameOption(getMatchingOption(result.jobTitle, JOB_NAME_OPTIONS))
    setDescription(result.summary)
    setScopeOfWork(result.customerScope ?? result.summary)
    setExclusions(result.exclusions ?? [])
    setLineItems(
      result.lineItems.length > 0
        ? result.lineItems.map((item) => ({
            id: createId(),
            description: item.description,
            quantity: item.quantity,
            unit: item.unit,
            unitPrice: item.unitPrice,
          }))
        : [createEmptyLineItem()],
    )
    setMaterialCost(result.materialCost)
    setEconomics(result.economics ?? null)
    setNotes(
      [result.customerNotes, businessSettings.estimateTerms]
        .filter(Boolean)
        .join('\n\n'),
    )
    setFormError('')
    setSaveMessage('AI estimate applied. Review and edit every field before saving.')
  }

  function applyProtectedPrice(price: number): void {
    const targetSubtotal = Math.max(0, price)
    setLineItems((items) => {
      const completed = items.filter((item) => item.description.trim() || item.unitPrice > 0)
      const currentSubtotal = completed.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0)
      if (completed.length === 0 || currentSubtotal <= 0) {
        return [{ ...createEmptyLineItem(), description: jobName || 'Handyman service', quantity: 1, unitPrice: targetSubtotal }]
      }
      const scale = targetSubtotal / currentSubtotal
      return items.map((item) => ({ ...item, unitPrice: Math.round(item.unitPrice * scale * 100) / 100 }))
    })
  }

  function calculateEstimateSubtotal(
    estimate: Estimate,
  ): number {
    return estimate.lineItems.reduce(
      (total, item) =>
        total +
        item.quantity * item.unitPrice,
      0,
    )
  }

  const printEstimate = estimates.find(
    (estimate) =>
      estimate.id === printEstimateId,
  )

  const printCustomer = printEstimate
    ? customers.find(
        (customer) =>
          customer.id ===
          printEstimate.customerId,
      )
    : undefined

  if (activeDocumentTab === 'invoices') {
    return (
      <>
        <div className="estimate-document-tabs">
          <button
            onClick={() =>
              setActiveDocumentTab(
                'estimates',
              )
            }
            type="button"
          >
            Estimates
          </button>

          <button
            className="active"
            onClick={() =>
              setActiveDocumentTab(
                'invoices',
              )
            }
            type="button"
          >
            Invoices
          </button>
        </div>

        <Invoices
          initialInvoiceId={
            initialDocumentKind === 'invoice' ? initialDocumentId : null
          }
        />
      </>
    )
  }

  return (
    <>
      <section className="customers-page">
        <div className="estimate-document-tabs">
          <button
            className="active"
            onClick={() =>
              setActiveDocumentTab(
                'estimates',
              )
            }
            type="button"
          >
            Estimates
          </button>

          <button
            onClick={() =>
              setActiveDocumentTab(
                'invoices',
              )
            }
            type="button"
          >
            Invoices
          </button>
        </div>

        <div className="customers-page-header">
          <div>
            <p className="eyebrow">
              DOCUMENTS
            </p>

            <h1>Estimates</h1>

            <p className="customers-page-subtitle">
              {estimates.length}{' '}
              {estimates.length === 1
                ? 'estimate'
                : 'estimates'}{' '}
              saved on this device.
            </p>
          </div>

          <button
            className="button-dark"
            onClick={startNewEstimate}
            type="button"
          >
            + New estimate
          </button>
        </div>

        {estimates.length === 0 ? (
          <div className="customers-empty-state">
            <div className="customers-empty-icon">
              +
            </div>

            <h2>No estimates yet</h2>

            <p>
              Create your first professional
              customer estimate.
            </p>

            <button
              className="button-dark"
              onClick={startNewEstimate}
              type="button"
            >
              Create first estimate
            </button>
          </div>
        ) : (
          <div className="customer-grid">
            {estimates.map((estimate) => (
              <article
                className="customer-card"
                key={estimate.id}
              >
                <div className="customer-card-header">
                  <div className="customer-avatar">
                    EST
                  </div>

                  <div className="customer-card-name">
                    <h2>
                      {
                        estimate.estimateNumber
                      }
                    </h2>

                    <p>
                      {getCustomerName(
                        estimate.customerId,
                      )}
                    </p>
                  </div>

                </div>

                <div className="customer-contact-details">
                  <p>
                    <strong>Job: </strong>

                    {estimate.jobName}
                  </p>

                  <p>
                    <strong>
                      Issued:{' '}
                    </strong>

                    {formatDate(
                      estimate.issueDate,
                    )}
                  </p>

                  <p>
                    <strong>
                      Valid through:{' '}
                    </strong>

                    {formatDate(
                      estimate.expirationDate,
                    )}
                  </p>
                </div>

                <div className="customer-card-stats">
                  <div>
                    <strong>
                      {
                        estimate.lineItems
                          .length
                      }
                    </strong>

                    <span>services</span>
                  </div>

                  <div>
                    <strong>
                      {formatCurrency(
                        calculateEstimateTotal(
                          estimate,
                        ),
                      )}
                    </strong>

                    <span>
                      estimate total
                    </span>
                  </div>
                </div>

                <div className="customer-card-actions">
                  <select
                    aria-label={`Status for ${estimate.estimateNumber}`}
                    className="estimate-status-select"
                    disabled={Boolean(estimate.approval)}
                    onChange={(event) => updateEstimateStatus(estimate.id, event.target.value as Estimate['status'])}
                    value={estimate.status}
                  >
                    <option value="draft">Draft</option>
                    <option value="sent">Sent</option>
                    <option value="approved">Approved</option>
                    <option value="declined">Declined</option>
                  </select>

                  {estimate.approval && (
                    <div className="estimate-approval-record">
                      <strong>Approved by {estimate.approval.customerName}</strong>
                      <span>{new Date(estimate.approval.acceptedAt).toLocaleString()} · {estimate.approval.method.replaceAll('_', ' ')}</span>
                      <small>{formatCurrency(estimate.approval.snapshot.acceptedAmount)} locked agreement</small>
                    </div>
                  )}

                  <button
                    className="customer-primary-action"
                    onClick={() =>
                      editEstimate(estimate)
                    }
                    type="button"
                  >
                    Edit estimate
                  </button>

                  <button
                    className="customer-secondary-action"
                    onClick={() =>
                      duplicateEstimate(
                        estimate,
                      )
                    }
                    type="button"
                  >
                    Duplicate
                  </button>

                  <DocumentPdfActions kind="estimate" document={estimate} customer={customers.find((item) => item.id === estimate.customerId)} />

                  <button
                    className="customer-secondary-action"
                    disabled={Boolean(estimate.jobId)}
                    onClick={() => createJob(estimate)}
                    title={estimate.status === 'approved' ? 'Open this approved estimate in Job Mode' : 'Mark this estimate Approved first'}
                    type="button"
                  >
                    {estimate.jobId ? 'Job created' : 'Create job'}
                  </button>

                  <button
                    className="customer-secondary-action"
                    disabled={Boolean(estimate.jobId)}
                    onClick={() =>
                      convertEstimateToInvoice(
                        estimate,
                      )
                    }
                    type="button"
                  >
                    {estimate.jobId ? 'Final invoice in Job Mode' : 'Convert to invoice'}
                  </button>

                  <button
                    aria-label={`Delete ${estimate.estimateNumber}`}
                    className="customer-secondary-action estimate-delete-button"
                    onClick={() => deleteEstimate(estimate.id)}
                    type="button"
                  >
                    <Trash2 aria-hidden="true" size={16} />
                    Delete estimate
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {approvalEstimateId && (
        <div className="estimate-modal-backdrop" role="presentation">
          <section aria-labelledby="approval-modal-title" aria-modal="true" className="estimate-modal estimate-approval-modal" role="dialog">
            <header className="estimate-modal-header">
              <div><p className="estimate-brand">CUSTOMER APPROVAL</p><h2 id="approval-modal-title">Record accepted estimate</h2></div>
              <button aria-label="Close approval" className="estimate-close-button" onClick={() => setApprovalEstimateId(null)} type="button">×</button>
            </header>
            <p className="approval-warning">Saving locks the accepted scope, line items, and price. Future edits create a revision instead of changing this agreement.</p>
            {approvalError && <div className="estimate-form-error" role="alert">{approvalError}</div>}
            <div className="estimate-top-grid">
              <label className="estimate-field"><span>Customer approval name / signature *</span><input autoFocus onChange={(event) => setApprovalCustomerName(event.target.value)} value={approvalCustomerName} /></label>
              <label className="estimate-field"><span>Approval method</span><select onChange={(event) => setApprovalMethod(event.target.value as EstimateApprovalMethod)} value={approvalMethod}><option value="signed_in_person">Signed in person</option><option value="email">Email</option><option value="text">Text message</option><option value="verbal">Verbal</option></select></label>
              <label className="estimate-field estimate-field-wide"><span>Approval note</span><textarea onChange={(event) => setApprovalNote(event.target.value)} rows={3} value={approvalNote} /></label>
            </div>
            <footer className="estimate-modal-footer"><button className="button-secondary" onClick={() => setApprovalEstimateId(null)} type="button">Cancel</button><button className="button-dark" onClick={recordApproval} type="button">Save approval snapshot</button></footer>
          </section>
        </div>
      )}

      {isBuilderOpen && (
        <div
          className="estimate-modal-backdrop"
          role="presentation"
        >
          <section
            aria-labelledby="estimate-modal-title"
            aria-modal="true"
            className="estimate-modal"
            role="dialog"
          >
            <header className="estimate-modal-header">
              <div>
                <p className="estimate-brand">
                  RABBIT&apos;S FOOT OWNER
                  HUB
                </p>

                <h2 id="estimate-modal-title">
                  {editingEstimate
                    ? 'Edit estimate'
                    : 'New estimate'}
                </h2>
              </div>

              <button
                aria-label="Close estimate"
                className="estimate-close-button"
                onClick={cancelBuilder}
                type="button"
              >
                ×
              </button>
            </header>

            <div className="estimate-divider" />

            <div className="estimate-top-grid">
              <label className="estimate-field">
                <span>Type</span>

                <select
                  disabled
                  value="estimate"
                >
                  <option value="estimate">
                    Estimate
                  </option>
                </select>
              </label>

              <label className="estimate-field">
                <span>Customer *</span>

                <select
                  onChange={(event) =>
                    handleCustomerChange(
                      event.target.value,
                    )
                  }
                  value={selectedCustomerId}
                >
                  <option value="">
                    Select a customer
                  </option>

                  {customers.map(
                    (customer) => (
                      <option
                        key={customer.id}
                        value={customer.id}
                      >
                        {
                          customer.firstName
                        }{' '}
                        {customer.lastName}
                      </option>
                    ),
                  )}
                </select>
              </label>

              <label className="estimate-field">
                <span>
                  Job or order title *
                </span>

                <select
                  className="estimate-green-field"
                  onChange={(event) =>
                    handleJobNameSelection(
                      event.target.value,
                    )
                  }
                  value={
                    selectedJobNameOption
                  }
                >
                  <option value="">
                    Select a job title
                  </option>

                  {JOB_NAME_OPTIONS.map(
                    (jobOption) => (
                      <option
                        key={jobOption}
                        value={jobOption}
                      >
                        {jobOption}
                      </option>
                    ),
                  )}

                  <option
                    value={CUSTOM_OPTION}
                  >
                    Custom job title
                  </option>
                </select>
              </label>

              <label className="estimate-field">
                <span>Issue date</span>

                <input
                  onChange={(event) =>
                    setIssueDate(
                      event.target.value,
                    )
                  }
                  type="date"
                  value={issueDate}
                />
              </label>

              <label className="estimate-field">
                <span>Valid through</span>

                <input
                  onChange={(event) =>
                    setExpirationDate(
                      event.target.value,
                    )
                  }
                  type="date"
                  value={expirationDate}
                />
              </label>

              {selectedJobNameOption ===
                CUSTOM_OPTION && (
                <label className="estimate-field estimate-full-width">
                  <span>
                    Custom job title *
                  </span>

                  <input
                    autoFocus
                    onChange={(event) =>
                      setJobName(
                        event.target.value,
                      )
                    }
                    placeholder="Enter the job title"
                    type="text"
                    value={jobName}
                  />
                </label>
              )}
            </div>

            <AiEstimateAssistant
              customer={selectedCustomer}
              customerId={selectedCustomerId}
              initialGeneration={aiGeneration ?? undefined}
              jobCategory={jobCategory}
              onGenerated={applyAiGeneration}
              onGenerationChange={setAiGeneration}
              propertyType={propertyType}
            />

            <div className="estimate-line-items">
              <div className="estimate-help-bar">
                Choose a repair from the
                dropdown, or select a custom
                repair.
              </div>

              <div className="estimate-table-header">
                <span>
                  Repair / Service
                </span>

                <span>Quantity</span>

                <span>Unit</span>

                <span>Unit price</span>

                <span>Total</span>

                <span aria-hidden="true" />
              </div>

              <div className="estimate-item-list">
                {lineItems.map((item) => {
                  const selectedDescription =
                    getMatchingOption(
                      item.description,
                      SERVICE_DESCRIPTIONS,
                    )

                  return (
                    <div
                      className="estimate-item-row"
                      key={item.id}
                    >
                      <div className="estimate-service-cell">
                        <select
                          className="estimate-green-field"
                          onChange={(
                            event,
                          ) =>
                            handleDescriptionSelection(
                              item.id,
                              event.target
                                .value,
                            )
                          }
                          value={
                            selectedDescription
                          }
                        >
                          <option value="">
                            Service or product
                          </option>

                          {SERVICE_OPTIONS.map(
                            (service) => (
                              <option
                                key={
                                  service.description
                                }
                                value={
                                  service.description
                                }
                              >
                                {
                                  service.description
                                }
                              </option>
                            ),
                          )}

                          <option
                            value={
                              CUSTOM_OPTION
                            }
                          >
                            Custom repair or
                            service
                          </option>
                        </select>

                        {selectedDescription ===
                          CUSTOM_OPTION && (
                          <textarea
                            onChange={(
                              event,
                            ) =>
                              updateLineItem(
                                item.id,
                                'description',
                                event.target
                                  .value,
                              )
                            }
                            placeholder="Describe the custom repair or service..."
                            rows={2}
                            value={
                              item.description
                            }
                          />
                        )}
                      </div>

                      <input
                        aria-label="Quantity"
                        min="0"
                        onChange={(event) =>
                          updateLineItem(
                            item.id,
                            'quantity',
                            event.target.value,
                          )
                        }
                        step="0.25"
                        type="number"
                        value={item.quantity}
                      />

                      <input
                        aria-label="Unit"
                        onChange={(event) =>
                          updateLineItem(
                            item.id,
                            'unit',
                            event.target.value,
                          )
                        }
                        placeholder="hour"
                        type="text"
                        value={item.unit ?? 'hour'}
                      />

                      <input
                        aria-label="Unit price"
                        min="0"
                        onChange={(event) =>
                          updateLineItem(
                            item.id,
                            'unitPrice',
                            event.target.value,
                          )
                        }
                        step="0.01"
                        type="number"
                        value={item.unitPrice}
                      />

                      <strong className="estimate-item-total">
                        {formatCurrency(
                          item.quantity *
                            item.unitPrice,
                        )}
                      </strong>

                      <button
                        aria-label="Remove line item"
                        className="estimate-remove-button"
                        onClick={() =>
                          removeLineItem(
                            item.id,
                          )
                        }
                        type="button"
                      >
                        ×
                      </button>
                    </div>
                  )
                })}
              </div>

              <button
                className="estimate-add-item"
                onClick={addLineItem}
                type="button"
              >
                + Add line item
              </button>
            </div>

            <div className="estimate-bottom-grid">
              <label className="estimate-notes">
                <span>Customer scope of work</span>
                <textarea onChange={(event) => setScopeOfWork(event.target.value)} placeholder="Customer-facing work included in this estimate" rows={5} value={scopeOfWork} />
              </label>

              <label className="estimate-notes">
                <span>Exclusions (one per line)</span>
                <textarea onChange={(event) => setExclusions(event.target.value.split('\n'))} placeholder="Permits&#10;Concealed damage&#10;Customer-supplied finish materials" rows={4} value={exclusions.join('\n')} />
              </label>

              <label className="estimate-notes">
                <span>Notes</span>

                <textarea
                  onChange={(event) =>
                    setNotes(
                      event.target.value,
                    )
                  }
                  rows={6}
                  value={notes}
                />
              </label>

              <div className="estimate-summary">
                <label>
                  <span>Tax rate</span>

                  <div className="estimate-number-suffix">
                    <input
                      min="0"
                      onChange={(event) =>
                        setTaxRate(
                          Number(
                            event.target.value,
                          ),
                        )
                      }
                      step="0.01"
                      type="number"
                      value={taxRate}
                    />

                    <span>%</span>
                  </div>
                </label>

                <label>
                  <span>Discount</span>

                  <div className="estimate-number-suffix">
                    <input
                      min="0"
                      onChange={(event) =>
                        setDiscount(
                          Number(
                            event.target.value,
                          ),
                        )
                      }
                      step="0.01"
                      type="number"
                      value={discount}
                    />

                    <span>$</span>
                  </div>
                </label>

                <label><span>Job category</span><input onChange={(event) => setJobCategory(event.target.value)} value={jobCategory} /></label>

                <label><span>Property type</span><select onChange={(event) => setPropertyType(event.target.value as 'residential' | 'commercial')} value={propertyType}><option value="residential">Residential</option><option value="commercial">Commercial</option></select></label>

                <label><span>Material cost</span><div className="estimate-number-suffix"><input min="0" onChange={(event) => setMaterialCost(Number(event.target.value))} step="0.01" type="number" value={materialCost} /><span>$</span></div></label>

                <label className="tax-reserve-control"><span>Tax reserve: {taxReservePercent}%</span><input aria-label="Estimate tax reserve percentage" max="35" min="25" onChange={(event) => setTaxReservePercent(Number(event.target.value))} step="1" type="range" value={taxReservePercent} /><small>Reserve {formatCurrency(grandTotal * taxReservePercent / 100)} · Safe to spend {formatCurrency(grandTotal * (1 - taxReservePercent / 100))}</small></label>

                <PricingInsightPanel category={jobCategory} customerId={selectedCustomerId} description={`${jobName} ${description} ${lineItems.map((item) => item.description).join(' ')}`} onUsePrice={(price) => setLineItems((items) => items.length ? items.map((item, index) => index === 0 ? { ...item, unitPrice: price, quantity: 1 } : item) : [{ ...createEmptyLineItem(), description: jobName || 'Handyman service', unitPrice: price }])} propertyType={propertyType} />

                <ProfitGuard economics={economics} currentPrice={subtotal} onUsePrice={applyProtectedPrice} targetMargin={businessSettings.targetGrossMarginPercent} />

                <div className="estimate-summary-row">
                  <span>Customer subtotal</span>

                  <strong>
                    {formatCurrency(customerSubtotal)}
                  </strong>
                </div>

                {!editingEstimateId &&
                  businessSettings.paymentProcessingOverheadPercent > 0 && (
                    <p className="estimate-payment-overhead-note">
                      Includes {businessSettings.paymentProcessingOverheadPercent}% payment overhead in the all-in customer price.
                    </p>
                  )}

                <div className="estimate-summary-row">
                  <span>Tax</span>

                  <strong>
                    {formatCurrency(
                      taxAmount,
                    )}
                  </strong>
                </div>

                <div className="estimate-total-row">
                  <span>Total</span>

                  <strong>
                    {formatCurrency(
                      grandTotal,
                    )}
                  </strong>
                </div>
              </div>
            </div>

            {selectedCustomer && (
              <p className="estimate-customer-address">
                Service address:{' '}
                {serviceAddress ||
                  'No customer address saved.'}
              </p>
            )}

            {description && (
              <p className="estimate-hidden-description">
                {description}
              </p>
            )}

            {formError && (
              <p className="estimate-error">
                {formError}
              </p>
            )}

            {saveMessage && (
              <p className="estimate-success">
                {saveMessage}
              </p>
            )}

            <footer className="estimate-modal-footer">
              <button
                className="estimate-cancel-button"
                onClick={cancelBuilder}
                type="button"
              >
                Cancel
              </button>

              <button
                className="estimate-save-button"
                onClick={saveEstimate}
                type="button"
              >
                {editingEstimate
                  ? 'Save changes'
                  : 'Create estimate'}
              </button>
            </footer>

            <p className="estimate-local-note">
              Estimates are saved locally on
              this device.
            </p>
          </section>
        </div>
      )}

      {printEstimate && (
        <article className="invoice-print-sheet">
          <header className="invoice-print-header">
            <img
              alt={businessSettings.businessName}
              src="/rabbits-foot-logo.png"
            />

            <div className="invoice-print-business">
              <strong>
                {businessSettings.businessName}
              </strong>

              {businessSettings.phone && (
                <span>{businessSettings.phone}</span>
              )}

              {businessSettings.email && (
                <span>{businessSettings.email}</span>
              )}

              {businessSettings.website && (
                <span>{businessSettings.website}</span>
              )}

              {businessSettings.streetAddress && (
                <span>
                  {businessSettings.streetAddress}
                </span>
              )}

              {(businessSettings.city ||
                businessSettings.zipCode) && (
                <span>
                  {[
                    businessSettings.city,
                    businessSettings.state,
                    businessSettings.zipCode,
                  ]
                    .filter(Boolean)
                    .join(' ')}
                </span>
              )}
            </div>

            <div>
              <p>ESTIMATE</p>
              <h1>
                {printEstimate.estimateNumber}
              </h1>
              <span>
                Issued{' '}
                {formatDate(
                  printEstimate.issueDate,
                )}
              </span>
              <span>
                Valid through{' '}
                {formatDate(
                  printEstimate.expirationDate,
                )}
              </span>
            </div>
          </header>

          <section className="invoice-print-addresses">
            <div>
              <span>PREPARED FOR</span>
              <strong>
                {printCustomer
                  ? `${printCustomer.firstName} ${printCustomer.lastName}`
                  : 'Unknown customer'}
              </strong>

              {printCustomer && (
                <p>
                  {formatCustomerAddress(
                    printCustomer,
                  )}
                </p>
              )}

              {printCustomer?.phone && (
                <p>{printCustomer.phone}</p>
              )}

              {printCustomer?.email && (
                <p>{printCustomer.email}</p>
              )}
            </div>

            <div>
              <span>SERVICE ADDRESS</span>
              <strong>
                {printEstimate.jobName}
              </strong>
              <p>{printEstimate.serviceAddress}</p>
            </div>
          </section>

          {printEstimate.description && (
            <section className="invoice-print-scope">
              <span>SCOPE OF WORK</span>
              <p>{printEstimate.description}</p>
            </section>
          )}

          <table className="invoice-print-table">
            <thead>
              <tr>
                <th>Description</th>
                <th>Qty</th>
                <th>Unit price</th>
                <th>Amount</th>
              </tr>
            </thead>

            <tbody>
              {printEstimate.lineItems.map(
                (lineItem) => (
                  <tr key={lineItem.id}>
                    <td>
                      {lineItem.description}
                    </td>
                    <td>{lineItem.quantity}</td>
                    <td>
                      {formatCurrency(
                        lineItem.unitPrice,
                      )}
                    </td>
                    <td>
                      {formatCurrency(
                        lineItem.quantity *
                          lineItem.unitPrice,
                      )}
                    </td>
                  </tr>
                ),
              )}
            </tbody>
          </table>

          <section className="invoice-print-totals">
            <div>
              <span>Subtotal</span>
              <strong>
                {formatCurrency(
                  calculateEstimateSubtotal(
                    printEstimate,
                  ),
                )}
              </strong>
            </div>

            <div>
              <span>Tax</span>
              <strong>
                {formatCurrency(
                  calculateEstimateSubtotal(
                    printEstimate,
                  ) *
                    (printEstimate.taxRate /
                      100),
                )}
              </strong>
            </div>

            <div>
              <span>Discount</span>
              <strong>
                -
                {formatCurrency(
                  printEstimate.discount,
                )}
              </strong>
            </div>

            <div className="invoice-print-total">
              <span>Estimate total</span>
              <strong>
                {formatCurrency(
                  calculateEstimateTotal(
                    printEstimate,
                  ),
                )}
              </strong>
            </div>
          </section>

          {printEstimate.notes && (
            <footer className="invoice-print-notes">
              <span>NOTES &amp; TERMS</span>
              <p>{printEstimate.notes}</p>
              <strong>
                Thank you for choosing
                Rabbit&apos;s Foot.
              </strong>
            </footer>
          )}
        </article>
      )}
    </>
  )
}

export default Estimates
