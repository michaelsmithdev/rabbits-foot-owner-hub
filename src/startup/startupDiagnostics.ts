type StartupEvent = {
  at: string
  stage: string
  detail?: string
}

const STARTUP_LOG_KEY = 'ownerhub:startup-log'
const MAXIMUM_EVENTS = 50

declare global {
  interface Window {
    __OWNER_HUB_BOOT_EVENTS__?: StartupEvent[]
    __OWNER_HUB_READY__?: boolean
  }
}

function describe(value: unknown): string {
  if (value instanceof Error) return `${value.name}: ${value.message}`
  if (typeof value === 'string') return value

  try {
    return JSON.stringify(value)
  } catch {
    return 'Unknown startup error'
  }
}

function readEvents(): StartupEvent[] {
  try {
    const stored = localStorage.getItem(STARTUP_LOG_KEY)
    if (!stored) return []
    const parsed: unknown = JSON.parse(stored)
    return Array.isArray(parsed) ? (parsed as StartupEvent[]) : []
  } catch {
    return []
  }
}

export function recordStartupEvent(stage: string, detail?: unknown) {
  const event: StartupEvent = {
    at: new Date().toISOString(),
    stage,
    ...(detail === undefined ? {} : { detail: describe(detail) }),
  }

  console.info(`[Owner Hub startup] ${stage}`, detail ?? '')

  try {
    const events = [...readEvents(), event].slice(-MAXIMUM_EVENTS)
    localStorage.setItem(STARTUP_LOG_KEY, JSON.stringify(events))
  } catch {
    // Diagnostics must never prevent the application from starting.
  }
}

export function installGlobalStartupLogging() {
  window.__OWNER_HUB_BOOT_EVENTS__?.forEach((event) => {
    recordStartupEvent(event.stage, event.detail)
  })
  window.__OWNER_HUB_BOOT_EVENTS__ = []

  window.addEventListener('error', (event) => {
    const target = event.target
    const failedResource = target instanceof HTMLScriptElement
      ? target.src
      : target instanceof HTMLLinkElement
        ? target.href
        : ''

    recordStartupEvent(
      failedResource ? 'resource-load-failed' : 'window-error',
      failedResource || event.error || event.message,
    )
  }, true)

  window.addEventListener('unhandledrejection', (event) => {
    recordStartupEvent('unhandled-promise-rejection', event.reason)
  })
}

export function markStartupReady(stage = 'react-ready') {
  window.__OWNER_HUB_READY__ = true
  recordStartupEvent(stage)

  const fallback = document.getElementById('owner-hub-startup-fallback')
  if (fallback) fallback.hidden = true
}
