import { useEffect, useState } from 'react'

import {
  loadInvoices,
  saveInvoices,
} from '../data/invoiceStore'

import type { Invoice } from '../types/Invoice'

export default function Invoices() {
  const [invoices] =
  useState<Invoice[]>(() => loadInvoices())

  useEffect(() => {
    saveInvoices(invoices)
  }, [invoices])

  return (
    <section className="customers-page">
      <div className="customers-page-header">
        <div>
          <p className="eyebrow">DOCUMENTS</p>

          <h1>Invoices</h1>

          <p className="customers-page-subtitle">
            {invoices.length}{' '}
            {invoices.length === 1
              ? 'invoice'
              : 'invoices'}{' '}
            saved on this device.
          </p>
        </div>

        <button
          className="button-dark"
          type="button"
        >
          + New invoice
        </button>
      </div>

      {invoices.length === 0 ? (
        <div className="customers-empty-state">
          <div className="customers-empty-icon">
            $
          </div>

          <h2>No invoices yet</h2>

          <p>
            Convert an estimate into an
            invoice or create one manually.
          </p>
        </div>
      ) : (
        <div className="customer-grid">
          {invoices.map((invoice) => (
            <article
              className="customer-card"
              key={invoice.id}
            >
              <h2>{invoice.invoiceNumber}</h2>

              <p>{invoice.jobName}</p>

              <strong>{invoice.status}</strong>
            </article>
          ))}
        </div>
      )}
    </section>
  )
}