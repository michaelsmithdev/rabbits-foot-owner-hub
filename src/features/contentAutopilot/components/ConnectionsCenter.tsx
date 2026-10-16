import { Check, CirclePlay, Link2, MapPin, MessagesSquare, RefreshCw, ShieldCheck, Unplug } from 'lucide-react'
import { useState } from 'react'

import { providerLabels } from '../contentRules'
import {
  disconnectProvider,
  listProviderAccounts,
  selectProviderAccount,
  startProviderConnection,
  testProviderConnection,
} from '../services/contentApi'
import type { ContentProvider, SocialConnection } from '../types'

const icons = { facebook: MessagesSquare, google_business: MapPin, youtube: CirclePlay }

type Props = { connections: SocialConnection[]; onRefresh: () => Promise<void> }
type AccountOption = { id: string; parentId?: string; name: string }

export default function ConnectionsCenter({ connections, onRefresh }: Props) {
  const [busyProvider, setBusyProvider] = useState<ContentProvider | ''>('')
  const [accounts, setAccounts] = useState<Partial<Record<ContentProvider, AccountOption[]>>>({})
  const [selectedAccounts, setSelectedAccounts] = useState<Partial<Record<ContentProvider, string>>>({})
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const connectedCount = connections.filter((connection) => connection.status === 'connected').length

  async function connect(provider: ContentProvider) {
    setBusyProvider(provider); setError(''); setMessage('')
    try {
      const result = await startProviderConnection(provider)
      window.location.assign(result.authorizationUrl)
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'The provider connection could not start.')
      setBusyProvider('')
    }
  }

  async function loadAccounts(provider: ContentProvider) {
    setBusyProvider(provider); setError(''); setMessage('')
    try {
      const result = await listProviderAccounts(provider)
      setAccounts((current) => ({ ...current, [provider]: result.accounts }))
      if (result.accounts[0]) setSelectedAccounts((current) => ({ ...current, [provider]: `${result.accounts[0].parentId ?? ''}|${result.accounts[0].id}` }))
      if (!result.accounts.length) setError(`No eligible ${providerLabels[provider]} account was returned. Confirm that the signed-in account manages the expected business resource.`)
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Accounts could not be loaded.')
    } finally {
      setBusyProvider('')
    }
  }

  async function selectAccount(provider: ContentProvider) {
    const [parentId, accountId] = (selectedAccounts[provider] ?? '').split('|')
    if (!accountId) return
    setBusyProvider(provider); setError('')
    try {
      const result = await selectProviderAccount(provider, accountId, parentId)
      setMessage(result.message)
      setAccounts((current) => ({ ...current, [provider]: undefined }))
      await onRefresh()
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'The account could not be selected.')
    } finally {
      setBusyProvider('')
    }
  }

  async function test(provider: ContentProvider) {
    setBusyProvider(provider); setError(''); setMessage('')
    try {
      const result = await testProviderConnection(provider)
      setMessage(`${providerLabels[provider]}: ${result.checks.join(' · ')}${result.warning ? ` Warning: ${result.warning}` : ''}`)
      await onRefresh()
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'The connection test failed.')
    } finally {
      setBusyProvider('')
    }
  }

  async function disconnect(provider: ContentProvider) {
    if (!window.confirm(`Disconnect ${providerLabels[provider]}? This deletes the saved local authorization. It does not delete existing public posts.`)) return
    setBusyProvider(provider); setError(''); setMessage('')
    try {
      const result = await disconnectProvider(provider)
      setMessage(result.message)
      await onRefresh()
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'The account could not be disconnected.')
    } finally {
      setBusyProvider('')
    }
  }

  return (
    <section className="ca-connections">
      <div className="ca-setup-wizard">
        <div className="ca-setup-progress"><span style={{ width: `${connectedCount / 3 * 80}%` }} /></div>
        <header><span className="ca-eyebrow">FIRST-TIME SETUP</span><h2>{connectedCount === 3 ? 'Social publishing is connected' : `Connect social accounts · ${connectedCount} of 3`}</h2><p>Tokens stay encrypted on the server. They are never returned to the browser or Android app.</p></header>
        <ol><li className={connections[0]?.status === 'connected' ? 'complete' : ''}><span>1</span>Facebook</li><li className={connections[1]?.status === 'connected' ? 'complete' : ''}><span>2</span>Google Business</li><li className={connections[2]?.status === 'connected' ? 'complete' : ''}><span>3</span>YouTube</li><li><span>4</span>Brand profile</li><li><span>5</span>Test post</li></ol>
      </div>
      {message ? <div className="ca-success" role="status"><Check size={18} />{message}</div> : null}
      {error ? <div className="ca-error" role="alert">{error}</div> : null}
      <div className="ca-connection-grid">
        {connections.map((connection) => {
          const provider = connection.provider
          const Icon = icons[provider]
          const providerAccounts = accounts[provider]
          const isBusy = busyProvider === provider
          return (
            <article className={`ca-connection-card ca-${provider}`} key={provider}>
              <header><span className="ca-provider-icon"><Icon size={24} /></span><div><h2>{providerLabels[provider]}</h2><span className={`ca-status-pill ca-connection-${connection.status}`}>{connection.status.replaceAll('_', ' ')}</span></div></header>
              <div className="ca-connection-body">
                {connection.displayName ? <p><strong>{connection.displayName}</strong><span>{connection.status === 'connected' ? 'Ready to publish' : connection.lastError || 'Action required'}</span></p> : <p><strong>No account selected</strong><span>Official OAuth connection required</span></p>}
                <ul>{connection.capabilities.videoUpload ? <li><Check size={15} />Video publishing</li> : null}{connection.capabilities.reels ? <li><Check size={15} />Page Reels</li> : null}{connection.capabilities.localPosts ? <li><Check size={15} />Local Posts</li> : null}{connection.capabilities.locationVideo ? <li><Check size={15} />Location video</li> : null}{connection.capabilities.scheduling ? <li><Check size={15} />Scheduling</li> : null}</ul>
                {connection.capabilities.warnings.map((warning) => <div className="ca-provider-warning" key={warning}>{warning}</div>)}
              </div>
              {providerAccounts ? (
                <div className="ca-account-picker"><label><span>Select the Rabbit&apos;s Foot resource</span><select onChange={(event) => setSelectedAccounts((current) => ({ ...current, [provider]: event.target.value }))} value={selectedAccounts[provider] ?? ''}>{providerAccounts.map((account) => <option key={`${account.parentId}-${account.id}`} value={`${account.parentId ?? ''}|${account.id}`}>{account.name}</option>)}</select></label><button className="ca-primary-button" disabled={isBusy || !providerAccounts.length} onClick={() => void selectAccount(provider)} type="button">Use this account</button></div>
              ) : (
                <footer>
                  {connection.status === 'connected' ? <><button disabled={isBusy} onClick={() => void test(provider)} type="button"><ShieldCheck size={17} />Test connection</button><button disabled={isBusy} onClick={() => void disconnect(provider)} type="button"><Unplug size={17} />Disconnect</button></> : connection.status === 'pending' ? <><button className="ca-primary-button" disabled={isBusy} onClick={() => void loadAccounts(provider)} type="button"><Link2 size={17} />Choose account</button><button disabled={isBusy} onClick={() => void connect(provider)} type="button"><RefreshCw size={17} />Restart OAuth</button></> : <button className="ca-primary-button" disabled={isBusy} onClick={() => void connect(provider)} type="button"><Link2 size={17} />Connect {providerLabels[provider]}</button>}
                </footer>
              )}
            </article>
          )
        })}
      </div>
      <div className="ca-security-note"><ShieldCheck size={24} /><div><strong>Secure connection model</strong><p>OAuth authorization codes are exchanged server-to-server. Access and refresh tokens are AES-256-GCM encrypted, omitted from API responses, and deleted locally when you disconnect.</p></div></div>
    </section>
  )
}
