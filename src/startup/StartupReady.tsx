import { useEffect } from 'react'

import { markStartupReady } from './startupDiagnostics'

export default function StartupReady() {
  useEffect(() => {
    markStartupReady()
  }, [])

  return null
}
