import { Cloud, Download, LockKeyhole, LogOut, RefreshCw, ShieldCheck } from 'lucide-react'
import { useState } from 'react'

import { useAuth } from '../../features/auth/authContext'
import { useCloudSync } from '../../features/cloud/cloudSyncContext'
import { loadCustomers } from '../../features/customers/data/customerStore'
import { loadEstimates } from '../../features/estimates/data/estimateStore'
import { loadInvoices } from '../../features/invoices/data/invoiceStore'
import { loadLeads } from '../../features/leads/data/leadStore'
import './Settings.css'

function Settings() {
  const { mode, session, signOut } = useAuth()
  const { errorMessage, lastSyncedAt, status, syncNow } = useCloudSync()
  const [message, setMessage] = useState('')

  function downloadBackup() {
    const backup = {
      version: 1,
      exportedAt: new Date().toISOString(),
      customers: loadCustomers(),
      estimates: loadEstimates(),
      invoices: loadInvoices(),
      leads: loadLeads(),
    }
    const backupUrl = URL.createObjectURL(
      new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' }),
    )
    const downloadLink = document.createElement('a')
    downloadLink.href = backupUrl
    downloadLink.download = `rabbits-foot-owner-hub-${new Date()
      .toISOString()
      .slice(0, 10)}.json`
    downloadLink.click()
    URL.revokeObjectURL(backupUrl)
    setMessage('Encrypted cloud data remains synced. A local backup was downloaded.')
  }

  return (
    <section className="settings-page">
      <header>
        <p className="eyebrow">YOUR BUSINESS</p>
        <h1>Settings &amp; security</h1>
        <p>Manage the protected workspace, synchronization, and backups.</p>
      </header>

      {message && <div className="settings-message" role="status">{message}</div>}

      <div className="settings-grid">
        <article className="settings-card settings-security-card">
          <span className="settings-card-icon"><ShieldCheck size={24} /></span>
          <div>
            <p className="eyebrow">SECURE ACCESS</p>
            <h2>{mode === 'cloud' ? 'Owner login protected' : 'Development local mode'}</h2>
            <p>
              {mode === 'cloud'
                ? `Signed in as ${session?.user.email ?? 'the business owner'}.`
                : 'Add the Supabase project values before production deployment to require login.'}
            </p>
          </div>
          {mode === 'cloud' && (
            <button className="settings-secondary-button" onClick={() => void signOut()} type="button">
              <LogOut size={17} /> Sign out
            </button>
          )}
        </article>

        <article className="settings-card">
          <span className="settings-card-icon"><Cloud size={24} /></span>
          <div>
            <p className="eyebrow">CLOUD SYNC</p>
            <h2>{status === 'synced' ? 'Everything is backed up' : status === 'local' ? 'Cloud connection pending' : 'Synchronization status'}</h2>
            <p>
              {status === 'error'
                ? errorMessage
                : lastSyncedAt
                  ? `Last successful sync: ${new Date(lastSyncedAt).toLocaleString()}`
                  : 'Changes are kept safely on this device until cloud access is connected.'}
            </p>
          </div>
          <button className="settings-secondary-button" disabled={status === 'local'} onClick={() => void syncNow()} type="button">
            <RefreshCw size={17} /> Sync now
          </button>
        </article>

        <article className="settings-card">
          <span className="settings-card-icon"><Download size={24} /></span>
          <div>
            <p className="eyebrow">PORTABLE BACKUP</p>
            <h2>Download a business backup</h2>
            <p>Export customers, leads, estimates, invoices, and payments in one dated file.</p>
          </div>
          <button className="settings-secondary-button" onClick={downloadBackup} type="button">
            <Download size={17} /> Download backup
          </button>
        </article>

        <article className="settings-card settings-protection-note">
          <LockKeyhole size={22} />
          <p>
            The browser only receives the public Supabase key. Row-level security
            restricts every cloud record to authorized members of this business.
          </p>
        </article>
      </div>
    </section>
  )
}

export default Settings
