import {
  Building2,
  Cloud,
  Download,
  DollarSign,
  FileText,
  LockKeyhole,
  LogOut,
  RefreshCw,
  Save,
  ShieldCheck,
} from 'lucide-react'
import { type FormEvent, useEffect, useState } from 'react'

import { useAuth } from '../../features/auth/authContext'
import { useCloudSync } from '../../features/cloud/cloudSyncContext'
import { DATA_REFRESHED_EVENT } from '../../features/cloud/syncQueue'
import { loadCustomers } from '../../features/customers/data/customerStore'
import { loadEstimates } from '../../features/estimates/data/estimateStore'
import { loadInvoices } from '../../features/invoices/data/invoiceStore'
import { loadLeads } from '../../features/leads/data/leadStore'
import { loadPhotos } from '../../features/photos/data/photoStore'
import { loadJobs } from '../../features/jobs/data/jobStore'
import { loadPricebook } from '../../features/pricing/data/pricebookStore'
import { loadWalkthroughs } from '../../features/walkthroughs/data/walkthroughStore'
import { loadAppointments } from '../../features/schedule/data/appointmentStore'
import { loadCommunications } from '../../features/communications/data/communicationStore'
import {
  loadBusinessSettings,
  saveBusinessSettings,
} from '../../features/settings/data/businessSettingsStore'
import type { BusinessSettings } from '../../features/settings/types/BusinessSettings'
import './Settings.css'

function Settings() {
  const { mode, session, signOut } = useAuth()
  const { errorMessage, lastSyncedAt, status, syncNow } = useCloudSync()
  const [settings, setSettings] = useState<BusinessSettings>(
    loadBusinessSettings,
  )
  const [isDirty, setIsDirty] = useState(false)
  const [message, setMessage] = useState('')
  const [formError, setFormError] = useState('')

  useEffect(() => {
    const refreshSettings = () => {
      if (!isDirty) setSettings(loadBusinessSettings())
    }

    window.addEventListener(DATA_REFRESHED_EVENT, refreshSettings)

    return () => {
      window.removeEventListener(DATA_REFRESHED_EVENT, refreshSettings)
    }
  }, [isDirty])

  function updateSetting<K extends keyof BusinessSettings>(
    field: K,
    value: BusinessSettings[K],
  ) {
    setSettings((currentSettings) => ({
      ...currentSettings,
      [field]: value,
    }))
    setIsDirty(true)
    setMessage('')
    setFormError('')
  }

  function saveSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!settings.businessName.trim()) {
      setFormError('Enter the business name.')
      return
    }

    if (!settings.email.trim() || !settings.email.includes('@')) {
      setFormError('Enter a valid business email address.')
      return
    }

    if (
      settings.defaultTaxRate < 0 ||
      settings.defaultTaxRate > 100 ||
      settings.defaultTaxReservePercent < 25 ||
      settings.defaultTaxReservePercent > 35 ||
      settings.estimateValidDays < 1 ||
      settings.invoiceDueDays < 1
      || settings.defaultLaborRate < 0
      || settings.minimumJobCharge < 0
      || settings.serviceCallCharge < 0
      || settings.diagnosticFee < 0
      || settings.travelCharge < 0
      || settings.afterHoursRatePercent < 0
      || settings.weekendRatePercent < 0
      || settings.emergencyRatePercent < 0
      || settings.defaultMaterialMarkupPercent < 0
      || settings.defaultOverheadPercent < 0
      || settings.paymentProcessingOverheadPercent < 0
      || settings.paymentProcessingOverheadPercent > 15
      || settings.targetGrossMarginPercent < 5
      || settings.targetGrossMarginPercent > 80
      || settings.defaultDeliveryCost < 0
      || settings.defaultDisposalCost < 0
    ) {
      setFormError('Check the tax rate and document due-day defaults.')
      return
    }

    const nextSettings: BusinessSettings = {
      ...settings,
      businessName: settings.businessName.trim(),
      phone: settings.phone.trim(),
      email: settings.email.trim(),
      website: settings.website.trim(),
      streetAddress: settings.streetAddress.trim(),
      city: settings.city.trim(),
      state: settings.state.trim().toUpperCase().slice(0, 2),
      zipCode: settings.zipCode.trim(),
      estimatePrefix: settings.estimatePrefix.trim().toUpperCase() || 'EST',
      invoicePrefix: settings.invoicePrefix.trim().toUpperCase() || 'INV',
      estimateTerms: settings.estimateTerms.trim(),
      invoiceTerms: settings.invoiceTerms.trim(),
      updatedAt: new Date().toISOString(),
    }

    saveBusinessSettings(nextSettings)
    setSettings(nextSettings)
    setIsDirty(false)
    setMessage('Business settings saved and queued for cloud sync.')
  }

  function downloadBackup() {
    const backup = {
      version: 3,
      exportedAt: new Date().toISOString(),
      settings: loadBusinessSettings(),
      customers: loadCustomers(),
      estimates: loadEstimates(),
      invoices: loadInvoices(),
      leads: loadLeads(),
      photoLibrary: loadPhotos(),
      walkthroughs: loadWalkthroughs(),
      pricebook: loadPricebook(),
      jobs: loadJobs(),
      appointments: loadAppointments(),
      communications: loadCommunications(),
    }
    const backupUrl = URL.createObjectURL(
      new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' }),
    )
    const downloadLink = document.createElement('a')
    downloadLink.href = backupUrl
    downloadLink.download = `owner-hub-business-backup-${new Date()
      .toISOString()
      .slice(0, 10)}.json`
    downloadLink.click()
    URL.revokeObjectURL(backupUrl)
    setMessage('A portable business-data backup was downloaded.')
  }

  return (
    <section className="settings-page">
      <header className="settings-page-header">
        <div>
          <p className="eyebrow">YOUR BUSINESS</p>
          <h1>Settings</h1>
          <p>Control your business identity, document defaults, and protected workspace.</p>
        </div>
        <button
          className="settings-primary-button"
          disabled={!isDirty}
          form="business-settings-form"
          type="submit"
        >
          <Save size={18} /> Save settings
        </button>
      </header>

      {message && <div className="settings-message" role="status">{message}</div>}
      {formError && <div className="settings-error" role="alert">{formError}</div>}

      <form className="settings-form" id="business-settings-form" onSubmit={saveSettings}>
        <article className="settings-form-card">
          <header className="settings-section-header">
            <span className="settings-card-icon"><Building2 size={24} /></span>
            <div>
              <p className="eyebrow">BUSINESS PROFILE</p>
              <h2>Company information</h2>
              <p>This information becomes the source of truth for branded documents.</p>
            </div>
          </header>

          <div className="settings-fields-grid">
            <label className="settings-field settings-field-wide">
              <span>Business name *</span>
              <input
                onChange={(event) => updateSetting('businessName', event.target.value)}
                value={settings.businessName}
              />
            </label>
            <label className="settings-field">
              <span>Phone</span>
              <input
                inputMode="tel"
                onChange={(event) => updateSetting('phone', event.target.value)}
                value={settings.phone}
              />
            </label>
            <label className="settings-field">
              <span>Email *</span>
              <input
                inputMode="email"
                onChange={(event) => updateSetting('email', event.target.value)}
                type="email"
                value={settings.email}
              />
            </label>
            <label className="settings-field settings-field-wide">
              <span>Website</span>
              <input
                onChange={(event) => updateSetting('website', event.target.value)}
                value={settings.website}
              />
            </label>
            <label className="settings-field settings-field-wide">
              <span>Business address</span>
              <input
                onChange={(event) => updateSetting('streetAddress', event.target.value)}
                placeholder="Street address"
                value={settings.streetAddress}
              />
            </label>
            <label className="settings-field">
              <span>City</span>
              <input
                onChange={(event) => updateSetting('city', event.target.value)}
                value={settings.city}
              />
            </label>
            <div className="settings-address-row">
              <label className="settings-field">
                <span>State</span>
                <input
                  maxLength={2}
                  onChange={(event) => updateSetting('state', event.target.value)}
                  value={settings.state}
                />
              </label>
              <label className="settings-field">
                <span>ZIP code</span>
                <input
                  inputMode="numeric"
                  onChange={(event) => updateSetting('zipCode', event.target.value)}
                  value={settings.zipCode}
                />
              </label>
            </div>
          </div>
        </article>

        <article className="settings-form-card">
          <header className="settings-section-header">
            <span className="settings-card-icon"><FileText size={24} /></span>
            <div>
              <p className="eyebrow">DOCUMENT DEFAULTS</p>
              <h2>Estimates and invoices</h2>
              <p>New documents begin with these defaults; existing documents stay unchanged.</p>
            </div>
          </header>

          <div className="settings-fields-grid">
            <label className="settings-field">
              <span>Default tax rate</span>
              <div className="settings-number-field">
                <input
                  min="0"
                  max="100"
                  onChange={(event) => updateSetting('defaultTaxRate', Number(event.target.value))}
                  step="0.01"
                  type="number"
                  value={settings.defaultTaxRate}
                />
                <b>%</b>
              </div>
            </label>
            <label className="settings-field">
              <span>Default tax reserve</span>
              <span className="settings-number-field"><input aria-label="Default tax reserve percentage" max="35" min="25" onChange={(event) => updateSetting('defaultTaxReservePercent', Number(event.target.value))} step="1" type="range" value={settings.defaultTaxReservePercent} /><b>{settings.defaultTaxReservePercent}% reserve</b></span>
            </label>
            <label className="settings-field">
              <span>Estimate valid for</span>
              <div className="settings-number-field">
                <input
                  min="1"
                  onChange={(event) => updateSetting('estimateValidDays', Number(event.target.value))}
                  type="number"
                  value={settings.estimateValidDays}
                />
                <b>days</b>
              </div>
            </label>
            <label className="settings-field">
              <span>Invoice due in</span>
              <div className="settings-number-field">
                <input
                  min="1"
                  onChange={(event) => updateSetting('invoiceDueDays', Number(event.target.value))}
                  type="number"
                  value={settings.invoiceDueDays}
                />
                <b>days</b>
              </div>
            </label>
            <div className="settings-prefix-row">
              <label className="settings-field">
                <span>Estimate prefix</span>
                <input
                  maxLength={8}
                  onChange={(event) => updateSetting('estimatePrefix', event.target.value)}
                  value={settings.estimatePrefix}
                />
              </label>
              <label className="settings-field">
                <span>Invoice prefix</span>
                <input
                  maxLength={8}
                  onChange={(event) => updateSetting('invoicePrefix', event.target.value)}
                  value={settings.invoicePrefix}
                />
              </label>
            </div>
            <label className="settings-field settings-field-wide">
              <span>Default estimate terms</span>
              <textarea
                onChange={(event) => updateSetting('estimateTerms', event.target.value)}
                rows={3}
                value={settings.estimateTerms}
              />
            </label>
            <label className="settings-field settings-field-wide">
              <span>Default invoice terms</span>
              <textarea
                onChange={(event) => updateSetting('invoiceTerms', event.target.value)}
                rows={3}
                value={settings.invoiceTerms}
              />
            </label>
          </div>
        </article>

        <article className="settings-form-card">
          <header className="settings-section-header">
            <span className="settings-card-icon"><DollarSign size={24} /></span>
            <div>
              <p className="eyebrow">PROFIT GUARD DEFAULTS</p>
              <h2>Cost and pricing rules</h2>
              <p>New estimates use these contractor-only defaults. Existing documents stay unchanged.</p>
            </div>
          </header>
          <div className="settings-fields-grid">
            {([
              ['defaultLaborRate', 'Internal labor cost / hour', '$'],
              ['minimumJobCharge', 'Minimum job charge', '$'],
              ['serviceCallCharge', 'Service call charge', '$'],
              ['diagnosticFee', 'Diagnostic fee', '$'],
              ['travelCharge', 'Travel charge', '$'],
              ['afterHoursRatePercent', 'After-hours premium', '%'],
              ['weekendRatePercent', 'Weekend premium', '%'],
              ['emergencyRatePercent', 'Emergency premium', '%'],
              ['defaultMaterialMarkupPercent', 'Material markup', '%'],
              ['defaultOverheadPercent', 'Overhead allowance', '%'],
              ['paymentProcessingOverheadPercent', 'Payment processing overhead', '%'],
              ['targetGrossMarginPercent', 'Target gross margin', '%'],
              ['defaultDeliveryCost', 'Default delivery cost', '$'],
              ['defaultDisposalCost', 'Default disposal cost', '$'],
            ] as const).map(([field, label, suffix]) => (
              <label className="settings-field" key={field}>
                <span>{label}</span>
                <div className="settings-number-field">
                  <input min="0" max={field === 'targetGrossMarginPercent' ? 80 : field === 'paymentProcessingOverheadPercent' ? 15 : undefined} onChange={(event) => updateSetting(field, Number(event.target.value))} step="0.01" type="number" value={settings[field]} />
                  <b>{suffix}</b>
                </div>
              </label>
            ))}
          </div>
        </article>

        <article className="settings-form-card settings-preferences-card">
          <header className="settings-section-header">
            <span className="settings-card-icon"><ShieldCheck size={24} /></span>
            <div>
              <p className="eyebrow">COMMUNICATION</p>
              <h2>Notification preferences</h2>
            </div>
          </header>
          <label className="settings-toggle-row">
            <div>
              <strong>Business email notifications</strong>
              <span>Use the business email for document and account notifications.</span>
            </div>
            <input
              checked={settings.emailNotifications}
              onChange={(event) => updateSetting('emailNotifications', event.target.checked)}
              type="checkbox"
            />
          </label>
          <label className="settings-toggle-row">
            <div><strong>Dark mode</strong><span>Use a low-glare theme throughout the Owner Hub.</span></div>
            <input checked={settings.darkMode} onChange={(event) => updateSetting('darkMode', event.target.checked)} type="checkbox" />
          </label>
          <label className="settings-toggle-row">
            <div>
              <strong>New lead alerts</strong>
              <span>Keep website estimate-request alerts enabled.</span>
            </div>
            <input
              checked={settings.leadNotifications}
              onChange={(event) => updateSetting('leadNotifications', event.target.checked)}
              type="checkbox"
            />
          </label>
        </article>
      </form>

      <div className="settings-grid">
        <article className="settings-card settings-security-card">
          <span className="settings-card-icon"><ShieldCheck size={24} /></span>
          <div>
            <p className="eyebrow">SECURE ACCESS</p>
            <h2>{mode === 'cloud' ? 'Owner login protected' : 'Development local mode'}</h2>
            <p>
              {mode === 'cloud'
                ? `Signed in as ${session?.user.email ?? 'the business owner'}.`
                : 'Connect Supabase before production deployment to require login.'}
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
                  : 'Changes stay on this device until cloud access is available.'}
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
            <h2>Download your business data</h2>
            <p>Export settings, customers, leads, estimates, invoices, payments, and photo metadata.</p>
          </div>
          <button className="settings-secondary-button" onClick={downloadBackup} type="button">
            <Download size={17} /> Download backup
          </button>
        </article>

        <article className="settings-card settings-protection-note">
          <LockKeyhole size={22} />
          <p>Business records and photos are private and restricted to authorized workspace members.</p>
        </article>
      </div>
    </section>
  )
}

export default Settings
