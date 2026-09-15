export interface AuthUser {
  id: string
  name: string
  phone: string
  role: 'user' | 'admin'
  /** ISO date the subscription ends, or null for no end date */
  expiresAt: string | null
}

export type BlockReason = 'other_device' | 'expired' | 'disabled' | 'offline' | 'no_profile'

/** What the UI needs to know about the account. 'off' = no project configured: the app
 *  runs open, exactly as it did before accounts existed. */
export type AuthSnapshot =
  | { status: 'off' }
  | { status: 'loading' }
  | { status: 'signed-out' }
  | { status: 'ok'; user: AuthUser; offline?: boolean }
  | { status: 'blocked'; reason: BlockReason; user?: AuthUser; deviceName?: string }
