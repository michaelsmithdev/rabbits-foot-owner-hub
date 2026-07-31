import {
  Component,
  type ErrorInfo,
  type ReactNode,
} from 'react'
import { AlertTriangle, RotateCcw } from 'lucide-react'

type ApplicationErrorBoundaryProps = {
  children: ReactNode
}

type ApplicationErrorBoundaryState = {
  hasError: boolean
}

class ApplicationErrorBoundary extends Component<
  ApplicationErrorBoundaryProps,
  ApplicationErrorBoundaryState
> {
  state: ApplicationErrorBoundaryState = {
    hasError: false,
  }

  static getDerivedStateFromError(): ApplicationErrorBoundaryState {
    return { hasError: true }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Owner Hub could not render.', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return (
        <main className="application-error" role="alert">
          <div className="application-error-card">
            <span className="application-error-icon">
              <AlertTriangle aria-hidden="true" size={28} />
            </span>
            <p className="eyebrow">OWNER HUB RECOVERY</p>
            <h1>Something did not load correctly.</h1>
            <p>
              Your saved business data has not been deleted. Reload the app to
              recover this screen.
            </p>
            <button
              className="button-dark"
              onClick={() => window.location.reload()}
              type="button"
            >
              <RotateCcw aria-hidden="true" size={18} />
              Reload Owner Hub
            </button>
          </div>
        </main>
      )
    }

    return this.props.children
  }
}

export default ApplicationErrorBoundary
