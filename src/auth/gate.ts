import { useStore } from '../store'
import type { AuthSnapshot } from './types'

/** The compass, zones, findings and reports are the paid insight. Open when no
 *  project is configured; otherwise only for a signed-in account holding the seat. */
export function analysisAllowed(auth: AuthSnapshot, chartsReady: boolean = useStore.getState().chartsReady): boolean {
  if (auth.status === 'off') return true
  return auth.status === 'ok' && chartsReady
}

/** Gate for analysis surfaces — the login page already covers the app whenever this
 *  is false, so callers simply return. */
export function requireAnalysis(): boolean {
  return analysisAllowed(useStore.getState().auth)
}

export const requireLicense = requireAnalysis
