import { useStore } from '../store'
import type { AuthSnapshot } from './types'

/** The compass, zones, findings and reports are the paid insight. Open when no
 *  project is configured; otherwise only for a signed-in account holding the seat. */
export function analysisAllowed(auth: AuthSnapshot): boolean {
  return auth.status === 'off' || auth.status === 'ok'
}

/** Gate for analysis surfaces — the login page already covers the app whenever this
 *  is false, so callers simply return. */
export function requireAnalysis(): boolean {
  return analysisAllowed(useStore.getState().auth)
}

export const requireLicense = requireAnalysis
