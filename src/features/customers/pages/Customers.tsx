import {
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from 'react'
import {
  loadCustomers,
  saveCustomers,
} from '../data/customerStore'
import type { Customer } from '../types/Customer'
import { loadEstimates } from '../../estimates/data/estimateStore'
import { loadInvoices } from '../../invoices/data/invoiceStore'
import { loadPhotos } from '../../photos/data/photoStore'
import { useAuth } from '../../auth/authContext'
import { buildCustomerDocumentStats } from '../data/customerDocumentStats'
import { createCustomerPortalLink } from '../../communications/customerDocumentShare'
import { normalizePhoneNumber, openSmsComposer } from '../../communications/customerContact'

type CustomersProps = {
  initialCustomerId?: string | null
  onStartEstimate: (customerId: string) => void
}

type CustomerFormData = Omit<
  Customer,
  'id' | 'createdAt'
>

const emptyCustomerForm: CustomerFormData = {
  firstName: '',
  lastName: '',
  phone: '',
  email: '',
  streetAddress: '',
  city: '',
  state: 'IN',
  zipCode: '',
  notes: '',
}

function Customers({
  initialCustomerId = null,
  onStartEstimate,
}: CustomersProps) {
  const { session } = useAuth()
  const [customers, setCustomers] = useState<Customer[]>(
    () => loadCustomers(),
  )

  const [searchTerm, setSearchTerm] = useState('')
  const [isModalOpen, setIsModalOpen] =
    useState(false)

  const [
    selectedCustomerId,
    setSelectedCustomerId,
  ] = useState<string | null>(initialCustomerId)

  const [formData, setFormData] =
    useState<CustomerFormData>(emptyCustomerForm)

  const [formError, setFormError] = useState('')
  const [isEditingCustomer, setIsEditingCustomer] = useState(false)
  const [portalMessage, setPortalMessage] = useState('')
  const [portalCustomerId, setPortalCustomerId] = useState<string | null>(null)

  useEffect(() => {
    saveCustomers(customers)
  }, [customers])

  const selectedCustomer = useMemo(() => {
    if (!selectedCustomerId) {
      return null
    }

    return (
      customers.find(
        (customer) =>
          customer.id === selectedCustomerId,
      ) ?? null
    )
  }, [customers, selectedCustomerId])

  const customerActivity = useMemo(() => {
    if (!selectedCustomerId) return { estimates: [], invoices: [], photos: [], timeline: [], billed: 0 }
    const estimates = loadEstimates().filter((item) => item.customerId === selectedCustomerId)
    const invoices = loadInvoices().filter((item) => item.customerId === selectedCustomerId)
    const photos = loadPhotos().filter((item) => item.customerId === selectedCustomerId)
    const billed = invoices.reduce((sum, invoice) => { const subtotal = invoice.lineItems.reduce((lineSum, line) => lineSum + line.quantity * line.unitPrice, 0); return sum + Math.max(0, subtotal * (1 + invoice.taxRate / 100) - invoice.discount) }, 0)
    const timeline = [
      ...estimates.map((item) => ({ id: `estimate-${item.id}`, date: item.updatedAt, type: 'Estimate', title: `${item.estimateNumber} · ${item.jobName}`, detail: item.status })),
      ...invoices.map((item) => ({ id: `invoice-${item.id}`, date: item.updatedAt, type: 'Invoice', title: `${item.invoiceNumber} · ${item.jobName}`, detail: item.status })),
      ...invoices.flatMap((invoice) => invoice.payments.map((payment) => ({ id: `payment-${payment.id}`, date: payment.createdAt, type: 'Payment', title: `$${payment.amount.toFixed(2)} received`, detail: `${payment.method} · ${invoice.invoiceNumber}` }))),
      ...photos.map((item) => ({ id: `photo-${item.id}`, date: item.capturedAt, type: 'Photo', title: `${item.category} · ${item.jobName || 'Project photo'}`, detail: item.caption || item.fileName })),
    ].sort((a, b) => b.date.localeCompare(a.date))
    return { estimates, invoices, photos, timeline, billed }
  }, [selectedCustomerId])

  const customerDocumentStats = buildCustomerDocumentStats(
    loadEstimates(),
    loadInvoices(),
  )

  const filteredCustomers = useMemo(() => {
    const normalizedSearch = searchTerm
      .trim()
      .toLowerCase()

    if (!normalizedSearch) {
      return customers
    }

    return customers.filter((customer) => {
      const searchableText = [
        customer.firstName,
        customer.lastName,
        customer.phone,
        customer.email,
        customer.streetAddress,
        customer.city,
        customer.state,
        customer.zipCode,
      ]
        .join(' ')
        .toLowerCase()

      return searchableText.includes(
        normalizedSearch,
      )
    })
  }, [customers, searchTerm])

  function updateFormField(
    field: keyof CustomerFormData,
    value: string,
  ) {
    setFormData((currentFormData) => ({
      ...currentFormData,
      [field]: value,
    }))
  }

  function openCustomerModal() {
    setFormData(emptyCustomerForm)
    setFormError('')
    setIsModalOpen(true)
  }

  function closeCustomerModal() {
    setIsModalOpen(false)
    setFormData(emptyCustomerForm)
    setFormError('')
  }

  function saveCustomer(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault()

    const firstName = formData.firstName.trim()
    const lastName = formData.lastName.trim()

    if (!firstName || !lastName) {
      setFormError(
        'First name and last name are required.',
      )
      return
    }

    const newCustomer: Customer = {
      id: `${Date.now()}-${Math.random()
        .toString(36)
        .slice(2)}`,
      firstName,
      lastName,
      phone: formData.phone.trim(),
      email: formData.email.trim(),
      streetAddress:
        formData.streetAddress.trim(),
      city: formData.city.trim(),
      state: formData.state
        .trim()
        .toUpperCase(),
      zipCode: formData.zipCode.trim(),
      notes: formData.notes.trim(),
      createdAt: new Date().toISOString(),
    }

    setCustomers((currentCustomers) => [
      newCustomer,
      ...currentCustomers,
    ])

    closeCustomerModal()
  }

  function deleteCustomer(customerId: string) {
    const customer = customers.find(
      (currentCustomer) =>
        currentCustomer.id === customerId,
    )

    if (!customer) {
      return
    }

    const confirmed = window.confirm(
      `Delete ${customer.firstName} ${customer.lastName}?`,
    )

    if (!confirmed) {
      return
    }

    setCustomers((currentCustomers) =>
      currentCustomers.filter(
        (currentCustomer) =>
          currentCustomer.id !== customerId,
      ),
    )

    if (selectedCustomerId === customerId) {
      setSelectedCustomerId(null)
    }
  }

  function openCustomerDetails(
    customerId: string,
  ) {
    setSelectedCustomerId(customerId)
  }

  function closeCustomerDetails() {
    setIsEditingCustomer(false)
    setFormError('')
    setSelectedCustomerId(null)
  }

  function beginEditingCustomer(customer: Customer) {
    setFormData({
      firstName: customer.firstName,
      lastName: customer.lastName,
      phone: customer.phone,
      email: customer.email,
      streetAddress: customer.streetAddress,
      city: customer.city,
      state: customer.state,
      zipCode: customer.zipCode,
      notes: customer.notes,
    })
    setFormError('')
    setPortalMessage('')
    setIsEditingCustomer(true)
  }

  function cancelEditingCustomer() {
    setIsEditingCustomer(false)
    setFormData(emptyCustomerForm)
    setFormError('')
  }

  function saveCustomerChanges() {
    if (!selectedCustomer) return

    const firstName = formData.firstName.trim()
    const lastName = formData.lastName.trim()

    if (!firstName || !lastName) {
      setFormError('First name and last name are required.')
      return
    }

    if (formData.email.trim() && !formData.email.includes('@')) {
      setFormError('Enter a valid email address or leave it blank.')
      return
    }

    setCustomers((currentCustomers) =>
      currentCustomers.map((customer) =>
        customer.id === selectedCustomer.id
          ? {
              ...customer,
              firstName,
              lastName,
              phone: formData.phone.trim(),
              email: formData.email.trim(),
              streetAddress: formData.streetAddress.trim(),
              city: formData.city.trim(),
              state: formData.state.trim().toUpperCase(),
              zipCode: formData.zipCode.trim(),
              notes: formData.notes.trim(),
            }
          : customer,
      ),
    )
    setIsEditingCustomer(false)
    setFormError('')
    setPortalMessage('Customer information updated and queued for cloud sync.')
  }

  function startEstimate(customer: Customer) {
    onStartEstimate(customer.id)
  }

  async function textCustomerHub(customer: Customer) {
    if (!customer.phone.trim()) {
      setPortalMessage('Add a phone number before texting the Customer Hub.')
      return
    }

    if (!session?.access_token) {
      setPortalMessage('Sign in before creating a secure Customer Hub link.')
      return
    }

    setPortalCustomerId(customer.id)
    setPortalMessage('Preparing a secure Customer Hub text…')

    try {
      const portalUrl = await createCustomerPortalLink(
        session.access_token,
        customer.id,
      )

      const message =
        `Hi ${customer.firstName}, here is your secure Rabbit's Foot Customer Hub. ` +
        `You can review appointments, estimates, invoices, and pay securely: ${portalUrl}`

      await navigator.clipboard.writeText(message).catch(() => undefined)
      setPortalMessage('Customer Hub text is ready. Review it, then tap Send.')
      openSmsComposer(customer, message)
    } catch (error) {
      setPortalMessage(
        error instanceof Error ? error.message : 'Customer Hub link failed.',
      )
    } finally {
      setPortalCustomerId(null)
    }
  }

  function getInitials(customer: Customer) {
    return `${customer.firstName.charAt(
      0,
    )}${customer.lastName.charAt(0)}`.toUpperCase()
  }

  function formatCustomerDate(
    dateValue: string,
  ) {
    const date = new Date(dateValue)

    if (Number.isNaN(date.getTime())) {
      return 'Unknown date'
    }

    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(date)
  }

  function formatFullAddress(
    customer: Customer,
  ) {
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

  if (selectedCustomer) {
    return (
      <section className="customers-page" data-tour="customer-profile">
        <div className="customers-page-header">
          <div>
            <button
              className="button-light"
              onClick={closeCustomerDetails}
              type="button"
            >
              ← Back to customers
            </button>

            <p
              className="eyebrow"
              style={{ marginTop: '24px' }}
            >
              CUSTOMER PROFILE
            </p>

            <h1>
              {selectedCustomer.firstName}{' '}
              {selectedCustomer.lastName}
            </h1>

            <p className="customers-page-subtitle">
              Customer since{' '}
              {formatCustomerDate(
                selectedCustomer.createdAt,
              )}
            </p>
          </div>

          <div className="customer-profile-actions">
            <button
              className="button-light"
              onClick={() => beginEditingCustomer(selectedCustomer)}
              type="button"
            >
              Edit customer
            </button>
            <button
              className="button-light"
              data-tour="customer-hub"
              disabled={portalCustomerId === selectedCustomer.id}
              onClick={() => void textCustomerHub(selectedCustomer)}
              type="button"
            >
              {portalCustomerId === selectedCustomer.id
                ? 'Preparing text…'
                : 'Text Customer Hub'}
            </button>
            <button
              className="button-dark"
              onClick={() =>
                startEstimate(selectedCustomer)
              }
              type="button"
            >
              + New estimate
            </button>
          </div>
        </div>

        {portalMessage && (
          <div className="customer-portal-message" role="status">
            {portalMessage}
          </div>
        )}

        <div className="customer-grid">
          <article className={`customer-card${isEditingCustomer ? ' customer-card-editing' : ''}`}>
            <div className="customer-card-header">
              <div className="customer-avatar">
                {getInitials(selectedCustomer)}
              </div>

              <div className="customer-card-name">
                <h2>Contact information</h2>
                <p>Customer details</p>
              </div>
            </div>

            {isEditingCustomer ? (
              <div className="customer-form-grid customer-profile-edit-form">
                <label><span>First name *</span><input autoFocus onChange={(event) => updateFormField('firstName', event.target.value)} value={formData.firstName} /></label>
                <label><span>Last name *</span><input onChange={(event) => updateFormField('lastName', event.target.value)} value={formData.lastName} /></label>
                <label><span>Phone</span><input inputMode="tel" onChange={(event) => updateFormField('phone', event.target.value)} type="tel" value={formData.phone} /></label>
                <label><span>Email</span><input onChange={(event) => updateFormField('email', event.target.value)} type="email" value={formData.email} /></label>
                <label className="customer-form-full-width"><span>Street address</span><input onChange={(event) => updateFormField('streetAddress', event.target.value)} value={formData.streetAddress} /></label>
                <label><span>City</span><input onChange={(event) => updateFormField('city', event.target.value)} value={formData.city} /></label>
                <label><span>State</span><input maxLength={2} onChange={(event) => updateFormField('state', event.target.value)} value={formData.state} /></label>
                <label><span>ZIP code</span><input inputMode="numeric" onChange={(event) => updateFormField('zipCode', event.target.value)} value={formData.zipCode} /></label>
                <label className="customer-form-full-width"><span>Customer notes</span><textarea onChange={(event) => updateFormField('notes', event.target.value)} rows={4} value={formData.notes} /></label>
                {formError && <p className="customer-form-error customer-form-full-width">{formError}</p>}
                <div className="customer-modal-actions customer-form-full-width">
                  <button className="button-light" onClick={cancelEditingCustomer} type="button">Cancel</button>
                  <button className="button-dark" onClick={saveCustomerChanges} type="button">Save changes</button>
                </div>
              </div>
            ) : (
            <div className="customer-contact-details">
              {selectedCustomer.phone ? (
                <p>
                  <strong>Phone: </strong>

                  <a
                    href={`tel:${normalizePhoneNumber(
                      selectedCustomer.phone,
                    )}`}
                  >
                    {selectedCustomer.phone}
                  </a>
                </p>
              ) : (
                <p>No phone number saved.</p>
              )}

              {selectedCustomer.email ? (
                <p>
                  <strong>Email: </strong>

                  <a
                    href={`mailto:${selectedCustomer.email}`}
                  >
                    {selectedCustomer.email}
                  </a>
                </p>
              ) : (
                <p>No email address saved.</p>
              )}

              <p>
                <strong>Address: </strong>
                {formatFullAddress(
                  selectedCustomer,
                ) || 'No address saved.'}
              </p>
            </div>
            )}
          </article>

          <article className="customer-card">
            <div className="customer-card-header">
              <div className="customer-card-name">
                <h2>Customer activity</h2>
                <p>
                  Estimates, invoices, and
                  payments
                </p>
              </div>
            </div>

            <div className="customer-card-stats">
              <div>
                <strong>{customerActivity.estimates.length}</strong>
                <span>estimates</span>
              </div>

              <div>
                <strong>{customerActivity.invoices.length}</strong>
                <span>invoices</span>
              </div>

              <div>
                <strong>{new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(customerActivity.billed)}</strong>
                <span>billed</span>
              </div>
            </div>
          </article>

          <article className="customer-card">
            <div className="customer-card-header">
              <div className="customer-card-name">
                <h2>Customer notes</h2>
                <p>
                  Important job and contact
                  information
                </p>
              </div>
            </div>

            <div className="customer-notes">
              {selectedCustomer.notes ||
                'No customer notes have been added.'}
            </div>
          </article>

          <article className="customer-card">
            <div className="customer-card-header">
              <div className="customer-card-name">
                <h2>Customer timeline</h2>
                <p>
                  Estimates, invoices, payments, and photos
                </p>
              </div>
            </div>

            {customerActivity.timeline.length ? <div className="customer-timeline">{customerActivity.timeline.map((item) => <div className="timeline-row" key={item.id}><span className="status-pill">{item.type}</span><div><strong>{item.title}</strong><p>{item.detail}</p><small>{new Date(item.date).toLocaleString()}</small></div></div>)}</div> : <div className="customers-empty-state"><h2>No activity yet</h2><p>Create the first estimate for this customer to begin their history.</p><button className="button-dark" onClick={() => startEstimate(selectedCustomer)} type="button">Create estimate</button></div>}
          </article>
        </div>

        <div
          className="customer-card-actions"
          style={{ marginTop: '24px' }}
        >
          <button
            className="customer-primary-action"
            onClick={() =>
              startEstimate(selectedCustomer)
            }
            type="button"
          >
            New estimate
          </button>

          <button
            className="customer-delete-button"
            onClick={() =>
              deleteCustomer(
                selectedCustomer.id,
              )
            }
            type="button"
          >
            Delete customer
          </button>
        </div>
      </section>
    )
  }

  return (
    <>
      <section className="customers-page" data-tour="customers-page">
        <div className="customers-page-header">
          <div>
            <p className="eyebrow">
              RELATIONSHIPS
            </p>

            <h1>Customers</h1>

            <p className="customers-page-subtitle">
              {customers.length}{' '}
              {customers.length === 1
                ? 'customer'
                : 'customers'}{' '}
              saved on this device.
            </p>
          </div>

          <button
            className="button-dark"
            data-tour="add-customer"
            onClick={openCustomerModal}
            type="button"
          >
            + Add customer
          </button>
        </div>

        <label className="customer-search" data-tour="customer-search">
          <span aria-hidden="true">⌕</span>

          <input
            aria-label="Search customers"
            onChange={(event) =>
              setSearchTerm(event.target.value)
            }
            placeholder="Search by name, phone, email, or address..."
            type="search"
            value={searchTerm}
          />
        </label>

        {filteredCustomers.length > 0 ? (
          <div className="customer-grid" data-tour="customer-records">
            {filteredCustomers.map(
              (customer) => (
                <article
                  className="customer-card"
                  key={customer.id}
                >
                  <div className="customer-card-header">
                    <div className="customer-avatar">
                      {getInitials(customer)}
                    </div>

                    <div className="customer-card-name">
                      <h2>
                        {customer.firstName}{' '}
                        {customer.lastName}
                      </h2>

                      <p>
                        Customer since{' '}
                        {formatCustomerDate(
                          customer.createdAt,
                        )}
                      </p>
                    </div>

                    <button
                      aria-label={`Delete ${customer.firstName} ${customer.lastName}`}
                      className="customer-delete-button"
                      onClick={() =>
                        deleteCustomer(customer.id)
                      }
                      type="button"
                    >
                      ×
                    </button>
                  </div>

                  <div className="customer-contact-details">
                    <p>
                      {customer.phone ||
                        'No phone yet'}
                    </p>

                    <p>
                      {customer.email ||
                        'No email yet'}
                    </p>

                    <p>
                      {customer.streetAddress ||
                        'No street address yet'}
                    </p>

                    {(customer.city ||
                      customer.state ||
                      customer.zipCode) && (
                      <p>
                        {[
                          customer.city,
                          customer.state,
                          customer.zipCode,
                        ]
                          .filter(Boolean)
                          .join(', ')}
                      </p>
                    )}
                  </div>

                  <div className="customer-notes">
                    {customer.notes ||
                      'No customer notes yet.'}
                  </div>

                  <div className="customer-card-stats">
                    <div>
                      <strong>{customerDocumentStats.get(customer.id)?.documents ?? 0}</strong>
                      <span>documents</span>
                    </div>

                    <div>
                      <strong>{new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(customerDocumentStats.get(customer.id)?.billed ?? 0)}</strong>
                      <span>billed</span>
                    </div>
                  </div>

                  <div className="customer-card-actions">
                    <button
                      className="customer-primary-action"
                      onClick={() =>
                        startEstimate(customer)
                      }
                      type="button"
                    >
                      New estimate
                    </button>

                    <button
                      className="customer-secondary-action"
                      onClick={() =>
                        openCustomerDetails(
                          customer.id,
                        )
                      }
                      type="button"
                    >
                      View customer
                    </button>
                  </div>
                </article>
              ),
            )}
          </div>
        ) : (
          <div className="customers-empty-state">
            <div className="customers-empty-icon">
              +
            </div>

            <h2>
              {customers.length === 0
                ? 'No customers yet'
                : 'No matching customers'}
            </h2>

            <p>
              {customers.length === 0
                ? 'Add your first customer to begin creating estimates and invoices.'
                : 'Try changing your search or clearing the search box.'}
            </p>

            {customers.length === 0 && (
              <button
                className="button-dark"
                onClick={openCustomerModal}
                type="button"
              >
                Add first customer
              </button>
            )}
          </div>
        )}
      </section>

      {isModalOpen && (
        <div
          aria-labelledby="add-customer-title"
          aria-modal="true"
          className="modal-backdrop"
          role="dialog"
        >
          <form
            className="customer-modal"
            data-tour="customer-form"
            onSubmit={saveCustomer}
          >
            <div className="customer-modal-header">
              <div>
                <p className="eyebrow">
                  RABBIT&apos;S FOOT OWNER HUB
                </p>

                <h2 id="add-customer-title">
                  Add customer
                </h2>
              </div>

              <button
                aria-label="Close add customer form"
                className="modal-close-button"
                onClick={closeCustomerModal}
                type="button"
              >
                ×
              </button>
            </div>

            <div className="customer-form-grid">
              <label>
                <span>First name *</span>

                <input
                  autoFocus
                  onChange={(event) =>
                    updateFormField(
                      'firstName',
                      event.target.value,
                    )
                  }
                  placeholder="Michael"
                  type="text"
                  value={formData.firstName}
                />
              </label>

              <label>
                <span>Last name *</span>

                <input
                  onChange={(event) =>
                    updateFormField(
                      'lastName',
                      event.target.value,
                    )
                  }
                  placeholder="Smith"
                  type="text"
                  value={formData.lastName}
                />
              </label>

              <label>
                <span>Phone</span>

                <input
                  inputMode="tel"
                  onChange={(event) =>
                    updateFormField(
                      'phone',
                      event.target.value,
                    )
                  }
                  placeholder="(574) 555-1234"
                  type="tel"
                  value={formData.phone}
                />
              </label>

              <label>
                <span>Email</span>

                <input
                  onChange={(event) =>
                    updateFormField(
                      'email',
                      event.target.value,
                    )
                  }
                  placeholder="customer@example.com"
                  type="email"
                  value={formData.email}
                />
              </label>

              <label className="customer-form-full-width">
                <span>Street address</span>

                <input
                  onChange={(event) =>
                    updateFormField(
                      'streetAddress',
                      event.target.value,
                    )
                  }
                  placeholder="123 Main Street"
                  type="text"
                  value={
                    formData.streetAddress
                  }
                />
              </label>

              <label>
                <span>City</span>

                <input
                  onChange={(event) =>
                    updateFormField(
                      'city',
                      event.target.value,
                    )
                  }
                  placeholder="South Bend"
                  type="text"
                  value={formData.city}
                />
              </label>

              <label>
                <span>State</span>

                <input
                  maxLength={2}
                  onChange={(event) =>
                    updateFormField(
                      'state',
                      event.target.value,
                    )
                  }
                  placeholder="IN"
                  type="text"
                  value={formData.state}
                />
              </label>

              <label>
                <span>ZIP code</span>

                <input
                  inputMode="numeric"
                  onChange={(event) =>
                    updateFormField(
                      'zipCode',
                      event.target.value,
                    )
                  }
                  placeholder="46601"
                  type="text"
                  value={formData.zipCode}
                />
              </label>

              <label className="customer-form-full-width">
                <span>Customer notes</span>

                <textarea
                  onChange={(event) =>
                    updateFormField(
                      'notes',
                      event.target.value,
                    )
                  }
                  placeholder="Gate code, preferred contact method, job details..."
                  rows={4}
                  value={formData.notes}
                />
              </label>
            </div>

            {formError && (
              <p className="customer-form-error">
                {formError}
              </p>
            )}

            <div className="customer-modal-actions">
              <button
                className="button-light"
                onClick={closeCustomerModal}
                type="button"
              >
                Cancel
              </button>

              <button
                className="button-dark"
                type="submit"
              >
                Save customer
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  )
}

export default Customers
