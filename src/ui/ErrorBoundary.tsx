import { Component, type ErrorInfo, type ReactNode } from 'react'

const SAFE_BOOT_KEY = 'vastu-studio.safe-boot'

/** Set when a render crashed: the next boot opens a blank drawing instead of reloading
 *  the plan that broke, so a damaged file can never trap the studio in a crash loop. */
export function consumeSafeBoot(): boolean {
  try {
    const on = sessionStorage.getItem(SAFE_BOOT_KEY) === '1'
    if (on) sessionStorage.removeItem(SAFE_BOOT_KEY)
    return on
  } catch { return false }
}

export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null }
  static getDerivedStateFromError(error: Error) { return { error } }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error(error, info.componentStack) }
  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="crash" role="alert">
        <div className="crash-card">
          <h1>Something went wrong drawing this plan</h1>
          <p>
            The studio hit an error it couldn’t recover from. Reloading brings back your last saved
            state. If the same drawing breaks again, start blank — everything else in your library is untouched.
          </p>
          <pre>{this.state.error.message}</pre>
          <div className="crash-actions">
            <button className="btn-primary" onClick={() => location.reload()}>Reload</button>
            <button className="btn-ghost" onClick={() => { try { sessionStorage.setItem(SAFE_BOOT_KEY, '1') } catch { /* private mode */ } location.reload() }}>
              Start blank
            </button>
          </div>
        </div>
      </div>
    )
  }
}
